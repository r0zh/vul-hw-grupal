"""Servidor local de la demo en directo del ataque (para la presentación).

    uv run python -m captura.vivo                    # http://127.0.0.1:8000/presentacion/
    uv run python -m captura.vivo --puerto 8320 --abrir
    uv run python -m captura.vivo --comprobar        # prueba sin placa; sale con 0 o 1
    uv run python -m captura.vivo --sala --abrir     # con la sala: el público elige la clave desde el móvil

Sirve la raíz del repositorio, solo en 127.0.0.1 porque maneja la placa, de
modo que /presentacion/ y /web/ funcionan igual que con un servidor estático.
Añade estas rutas:

GET /api/estado
    {"modos": [...], "nano": {"disponible", "motivo"},
     "grabado": {"trazas", "clave_hex", "fecha"}}

GET /api/vivo?modo=nano|grabado|simulado&n=400&clave=<32 hex>&desde=440&hasta=740[&ritmo=18.6]
    Server-Sent Events, un lote cada ~250 ms:
      event: inicio  {modo, clave_hex, ventana, n, ritmo_esperado, etiqueta[, aviso]}
      event: lote    {i0, textos: [16 bytes en hex], trazas: [[muestras]], ritmo}
      event: fin     {n, segundos}
      event: error   {mensaje}

Los modos:

- `nano`: captura real con las funciones de `captura/cw.py` (connect,
  detect_platform, reset_target y capture_one, que comprueba cada texto cifrado
  contra `analisis/aes.py`), con textos claros aleatorios y la clave pedida, que
  se carga en el target. Las trazas van en códigos del ADC (0 a 255).
- `grabado`: reproduce `datos/20261113-nano-tinyaes-respaldo` (1000 trazas
  medidas con la clave de laboratorio, que no se puede elegir) a 18,6 trazas/s,
  el ritmo medido; `ritmo` lo cambia para ensayar. Códigos del ADC.
- `simulado`: `analisis/simulate.py` con la clave pedida y SNR 0,5, del orden
  de la que se midió en la placa. Las trazas sintéticas tienen 96 muestras, así
  que la ventana se ignora; van en unidades arbitrarias con 4 decimales.

Una captura a la vez: una petición nueva a /api/vivo cancela la que esté en
marcha (que recibe un `error`), espera a que suelte la placa y empieza. Así,
recargar la página o pulsar «Capturar» otra vez nunca deja la demo bloqueada.
Si el cliente se desconecta, la captura se para al enviar el lote siguiente.

La sala (`captura/sala.py`): con `--sala`, el público elige desde el móvil los
16 bytes de la clave. Un segundo servidor, en 127.0.0.1:8001, atiende a los
móviles; `cloudflared` lo publica con un túnel y su dirección sale en un QR.
Ese servidor no tiene acceso a la placa ni a los ficheros. Con `--sala-url` se
da la dirección a mano (otro túnel, o http://127.0.0.1:8001/ para ensayar en
este equipo). Las diapositivas manejan la ronda con estas rutas, solo locales:

GET  /api/sala            {"activa", "url", "ronda", "abierta", "asignados", "elegidos",
                           "dispositivos", "apuesta_abierta", "apuestas", "leidos"}
GET  /api/sala/qr.svg     el QR de la dirección de los móviles
POST /api/sala/abrir      otra ronda: se olvidan los móviles y sus bytes
POST /api/sala/cerrar     cierra y da {"clave_hex", "del_publico", …}; los huecos, al azar
POST /api/sala/apuesta    {"abierta": true|false}: los móviles pueden apostar
POST /api/sala/leidos     {"posiciones": [0-15], "trazas": N, "clave": hex}: el ataque los ha
                          sacado; solo cuenta si la captura fue con la clave de la ronda (si no, 409)
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import importlib.util
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import numpy as np

from analisis import aes, attacks
from analisis.config import LAB_KEY, SimulationConfig
from analisis.simulate import simulate_from_texts

from . import campana
from . import cw as capture
from . import sala

RECORDED = campana.REPO / "datos" / "20261113-nano-tinyaes-respaldo"
MODES = ("nano", "grabado", "simulado")
MEASURED_RATE = 18.6       # trazas/s del Nano el 2026-11-13 (hardware/README.md)
BATCH_SECONDS = 0.25
MAX_TRACES = 5000
MAX_WINDOW = 1500          # muestras por traza que se envían
NANO_BUFFER = 50_000       # muestras que caben en el buffer del Nano
SIM_SNR = 0.5              # la placa da entre 0,52 y 0,71 (\realSnrMin y \realSnrMax)
NANO_USB = ("2b3e", "ace0")  # VID y PID del ChipWhisperer-Nano
CANCELLED = "Cancelada: ha empezado otra captura"
LABEL_NANO = "Captura en directo del ChipWhisperer-Nano"
LABEL_SIM = "Trazas simuladas, no medidas: modelo de Hamming con ruido"
ROOM_PORT = 8001           # servidor del público, el que publica el túnel
MAX_LOCAL_BODY = 2000      # bytes de cuerpo que se leen de un POST de las diapositivas
# La dirección de un túnel rápido son varias palabras con guiones; así no se confunde con
# https://api.trycloudflare.com, que cloudflared nombra cuando no consigue abrir el túnel.
TUNNEL_URL = re.compile(r"https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com")
NO_ROOM = "La sala no está activa: arranca el servidor con --sala"

ROOM = sala.Room()         # sin dirección pública hasta que serve() la ponga


class LiveError(Exception):
    """Error que se cuenta tal cual al cliente."""


# --------------------------------------------------------------------------
# Estado


def nano_status() -> tuple[bool, str]:
    """¿Se puede capturar con el Nano? Sin abrir la placa: no tarda ni la bloquea."""
    if importlib.util.find_spec("chipwhisperer") is None:
        return False, "Falta chipwhisperer: uv sync --group captura"
    devices = Path("/sys/bus/usb/devices")
    if not devices.is_dir():  # sin sysfs no se puede mirar sin abrirla
        return True, "chipwhisperer instalado; la placa se comprueba al capturar"
    for device in devices.iterdir():
        try:
            ids = tuple((device / name).read_text().strip() for name in ("idVendor", "idProduct"))
            if ids != NANO_USB:
                continue
            bus, dev = (int((device / name).read_text()) for name in ("busnum", "devnum"))
        except (OSError, ValueError):
            continue
        if os.access(f"/dev/bus/usb/{bus:03d}/{dev:03d}", os.R_OK | os.W_OK):
            return True, "ChipWhisperer-Nano enchufado"
        return False, "El ChipWhisperer está enchufado, pero sin permiso: ¿reglas udev? (hardware/README.md)"
    return False, "No se encuentra el ChipWhisperer: ¿está enchufado? ¿reglas udev?"


def recorded_info() -> dict | None:
    path = RECORDED.with_suffix(".json")
    if not path.exists():
        return None
    meta = json.loads(path.read_text())
    return {"trazas": meta["n_traces"], "clave_hex": meta["clave_hex"], "fecha": meta["fecha"]}


def status() -> dict:
    ok, reason = nano_status()
    recorded = recorded_info()
    return {
        "modos": [mode for mode in MODES if mode != "grabado" or recorded],
        "nano": {"disponible": ok, "motivo": reason},
        "grabado": recorded,
    }


def parse_request(query: str) -> SimpleNamespace:
    q = {name: values[-1] for name, values in parse_qs(query).items()}
    mode = q.get("modo", "grabado")
    if mode not in MODES:
        raise LiveError(f"Modo desconocido «{mode}»: usa nano, grabado o simulado")
    try:
        n = int(q.get("n", 400))
        key = bytes.fromhex(q.get("clave", LAB_KEY.hex()))
        start, stop = int(q.get("desde", 440)), int(q.get("hasta", 740))
        rate = float(q.get("ritmo", MEASURED_RATE))
    except ValueError as error:
        raise LiveError(f"Parámetros no válidos: {error}") from None
    if not 1 <= n <= MAX_TRACES:
        raise LiveError(f"n tiene que estar entre 1 y {MAX_TRACES}")
    if len(key) != 16:
        raise LiveError("La clave tiene que tener 16 bytes (32 caracteres hex)")
    if not 0 <= start < stop <= min(start + MAX_WINDOW, NANO_BUFFER):
        raise LiveError(f"Ventana no válida: 0 ≤ desde < hasta ≤ {NANO_BUFFER}, "
                        f"con {MAX_WINDOW} muestras como mucho")
    if not 0.1 <= rate <= 10_000:
        raise LiveError("El ritmo tiene que estar entre 0,1 y 10 000 trazas/s")
    return SimpleNamespace(mode=mode, n=n, key=key, start=start, stop=stop, rate=rate)


# --------------------------------------------------------------------------
# Fuentes de trazas: context managers que dan (inicio, iterador de (texto, traza))


def _adc_codes(traces) -> np.ndarray:
    """De los valores del Nano en coma flotante (código/256 − 0,5) a códigos del ADC."""
    return np.rint((np.asarray(traces, dtype=np.float64) + 0.5) * 256).astype(np.int16)


def _replay(texts, traces, rate: float, cancel: threading.Event):
    """Da las trazas al ritmo pedido (trazas/s), como si se capturaran; para al cancelar."""
    t0 = time.monotonic()
    for i, (text, trace) in enumerate(zip(texts, traces)):
        if cancel.wait(max(0.0, t0 + (i + 1) / rate - time.monotonic())):
            return
        yield bytes(text), trace


@functools.lru_cache(maxsize=1)
def _recorded() -> campana.Campaign:
    return campana.load(RECORDED)


@contextlib.contextmanager
def _open_recorded(req, cancel):
    data = _recorded()
    if req.stop > data.traces.shape[1]:
        raise LiveError(f"La campaña grabada tiene {data.traces.shape[1]} muestras por traza")
    n = min(req.n, len(data.traces))
    day = data.metadata["fecha"][:10].split("-")
    yield {
        "modo": "grabado", "clave_hex": bytes(data.key).hex(), "ventana": [req.start, req.stop],
        "n": n, "ritmo_esperado": req.rate,
        "etiqueta": f"Trazas grabadas el {'-'.join(reversed(day))}, clave de laboratorio",
    }, _replay(data.plaintexts[:n], _adc_codes(data.traces[:n, req.start:req.stop]), req.rate, cancel)


@contextlib.contextmanager
def _open_simulated(req, cancel):
    rng = np.random.default_rng()
    texts = rng.integers(0, 256, size=(req.n, 16), dtype=np.uint8)
    config = SimulationConfig(key=req.key, snr=SIM_SNR, seed=int(rng.integers(2**31)))
    traces = np.round(simulate_from_texts(texts, config).traces.astype(np.float64), 4)
    yield {
        "modo": "simulado", "clave_hex": req.key.hex(), "ventana": [0, config.n_samples],
        "n": req.n, "ritmo_esperado": req.rate, "etiqueta": LABEL_SIM,
    }, _replay(texts, traces, req.rate, cancel)


def _fix_clock_phase(scope, platform: str, one) -> str | None:
    """Reinicia la fase de los relojes mientras las trazas salgan saturadas.

    Errata de NewAE (hardware/README.md): el desfase entre los relojes del ADC
    y del target cambia en cada arranque, y con algunos las trazas se recortan.
    Se miran tres trazas; si más del 1 % de sus muestras está en un tope del
    ADC, se reinicia la fase (y el target, que se queda sin reloj) y se vuelve
    a mirar. Devuelve un aviso si no se arregla.
    """
    for _ in range(5):
        codes = np.array([one()[1] for _ in range(3)])
        if np.mean((codes <= 0) | (codes >= 255)) <= 0.01:
            return None
        reset = getattr(scope, "reset_clock_phase", None)
        if reset is None:
            break
        print("Trazas saturadas: reinicio la fase de los relojes", flush=True)
        reset()
        capture.reset_target(scope, platform)
    return "Las trazas salen saturadas: revisa la fase de los relojes (hardware/README.md)"


def _allow_capture_off_main_thread() -> None:
    """Deja capturar desde los hilos del servidor.

    `CWNano.arm()` y `capture()` envuelven la lectura USB en
    `DelayedKeyboardInterrupt`, que cambia el manejador de SIGINT, y
    `signal.signal` solo se puede llamar desde el hilo principal: desde un hilo
    del servidor falla con «signal only works in main thread». Fuera del hilo
    principal la guarda no hace nada; Ctrl+C solo llega al hilo principal.
    """
    from chipwhisperer.common.utils import util

    guard = util.DelayedKeyboardInterrupt
    if getattr(guard, "_vivo", False):
        return
    enter, exit_ = guard.__enter__, guard.__exit__

    def __enter__(self):
        if threading.current_thread() is threading.main_thread():
            return enter(self)

    def __exit__(self, *exc):
        if threading.current_thread() is threading.main_thread():
            return exit_(self, *exc)

    guard.__enter__, guard.__exit__, guard._vivo = __enter__, __exit__, True


@contextlib.contextmanager
def _open_nano(req, cancel):
    ok, reason = nano_status()
    if not ok:
        raise LiveError(reason)
    _allow_capture_off_main_thread()
    cw, scope, target = capture.connect()  # sale con un mensaje claro si no puede
    try:
        platform = capture.detect_platform(scope, None)
        scope.adc.samples = req.stop
        capture.reset_target(scope, platform)
        round_keys = aes.key_expansion(req.key)
        rng = np.random.default_rng()
        count = [0]

        def one():
            """Una traza con un texto claro aleatorio, con los reintentos de `capturar`."""
            for _ in range(11):
                if cancel.is_set():  # también durante la calibración de la fase
                    raise LiveError(CANCELLED)
                text = rng.integers(0, 256, 16, dtype=np.uint8).tobytes()
                result = capture.capture_one(cw, scope, target, text, req.key, round_keys,
                                             req.stop, count[0])
                if result is not None:
                    count[0] += 1
                    return text, _adc_codes(result[0][req.start:req.stop])
                capture.reset_target(scope, platform)
            raise LiveError("Demasiados timeouts seguidos: ¿firmware cargado? "
                            "Prueba «uv run python -m captura.cw programar»")

        def stream():
            while not cancel.is_set():
                yield one()

        info = {
            "modo": "nano", "clave_hex": req.key.hex(), "ventana": [req.start, req.stop],
            "n": req.n, "ritmo_esperado": MEASURED_RATE, "etiqueta": LABEL_NANO,
        }
        warning = _fix_clock_phase(scope, platform, one)
        if warning:
            info["aviso"] = warning
        yield info, stream()
    finally:
        for device in (scope, target):
            with contextlib.suppress(Exception):
                device.dis()


OPENERS = {"nano": _open_nano, "grabado": _open_recorded, "simulado": _open_simulated}


# --------------------------------------------------------------------------
# Servidor

_turn_lock = threading.Lock()
_current: threading.Event | None = None
_running = threading.Lock()  # una captura a la vez, y la placa, de una en una


def _take_turn() -> threading.Event:
    """Cancela la captura en marcha y da la señal de cancelación de la nueva."""
    global _current
    with _turn_lock:
        if _current is not None:
            _current.set()
        _current = threading.Event()
        return _current


class Handler(SimpleHTTPRequestHandler):
    # Tiempo máximo de cada lectura o escritura del socket: un cliente que deja
    # de leer no puede tener la placa cogida para siempre.
    timeout = 5

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(campana.REPO), **kwargs)

    def end_headers(self):
        # Sin caché: lo que se cambia al ensayar se ve al recargar.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        if self.path.startswith("/api/"):
            super().log_message(format, *args)

    def _local(self) -> bool:
        """Solo 127.0.0.1 y localhost (contra el DNS rebinding) y, en la API, solo
        desde las páginas de este servidor: otra web abierta en el navegador no
        puede lanzar ni cortar una captura."""
        port = self.server.server_address[1]
        hosts = (f"127.0.0.1:{port}", f"localhost:{port}")
        if self.headers.get("Host") not in hosts:
            return False
        if not self.path.startswith("/api/"):
            return True
        origin = self.headers.get("Origin")
        site = self.headers.get("Sec-Fetch-Site", "same-origin")  # curl y urllib no la mandan
        return (not origin or origin in tuple(f"http://{h}" for h in hosts)) and site in ("same-origin", "none")

    def do_HEAD(self):
        if self._local():
            super().do_HEAD()
        else:
            self.send_error(403, "Solo en local")

    def _reply(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, data: dict) -> None:
        self._reply(code, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        if not self._local():
            self.send_error(403, "Solo en local")
            return
        url = urlsplit(self.path)
        if url.path == "/api/estado":
            self._json(200, status())
        elif url.path == "/api/vivo":
            self._live(url.query)
        elif url.path == "/api/sala":
            self._json(200, ROOM.local_state())
        elif url.path == "/api/sala/qr.svg":
            svg = sala.qr_svg(ROOM.url) if ROOM.url else None
            if svg is None:
                self._json(503, {"error": NO_ROOM if not ROOM.url else "Falta segno: lo instala uv run"})
            else:
                self._reply(200, svg.encode(), "image/svg+xml; charset=utf-8")
        else:
            # El navegador corta descargas al recargar: no es un error ni merece una traza en la consola.
            with contextlib.suppress(BrokenPipeError, ConnectionResetError):
                super().do_GET()

    def do_POST(self):
        """Las órdenes de las diapositivas a la sala. Como el resto de la API, solo en local."""
        if not self._local():
            self.send_error(403, "Solo en local")
            return
        path = urlsplit(self.path).path
        if path not in ("/api/sala/abrir", "/api/sala/cerrar", "/api/sala/apuesta", "/api/sala/leidos"):
            self._json(404, {"error": "No existe"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(length)) if 0 < length <= MAX_LOCAL_BODY else {}
        except ValueError:
            data = None
        if not isinstance(data, dict):
            self._json(400, {"error": "El cuerpo tiene que ser un objeto JSON"})
        elif not ROOM.url:
            self._json(409, {"error": NO_ROOM})
        elif path == "/api/sala/abrir":
            ROOM.reopen()
            self._json(200, ROOM.local_state())
        elif path == "/api/sala/cerrar":
            key = ROOM.close()
            state = ROOM.local_state()
            self._json(200, {**state, "clave_hex": key.hex(), "del_publico": sum(state["elegidos"])})
        elif path == "/api/sala/apuesta":
            if type(data.get("abierta")) is not bool:
                self._json(400, {"error": "Falta «abierta»: true o false"})
                return
            ROOM.set_betting(data["abierta"])
            self._json(200, ROOM.local_state())
        else:
            positions, traces, key = data.get("posiciones"), data.get("trazas"), data.get("clave")
            if (not isinstance(positions, list) or len(positions) > sala.POSITIONS
                    or any(type(j) is not int or not 0 <= j < sala.POSITIONS for j in positions)
                    or type(traces) is not int or not 0 <= traces <= MAX_TRACES
                    or (positions and (not isinstance(key, str) or not re.fullmatch(r"[0-9a-f]{32}", key)))):
                self._json(400, {"error": "«posiciones» de 0 a 15, «trazas» en número y «clave» en hex"})
                return
            done = ROOM.mark_read(positions, traces, bytes.fromhex(key) if positions else None)
            self._json(200 if done else 409, ROOM.local_state())

    def _send(self, event: str, data: dict) -> None:
        payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        self.wfile.write(f"event: {event}\ndata: {payload}\n\n".encode())
        self.wfile.flush()

    def _live(self, query: str) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.end_headers()
        try:
            req = parse_request(query)  # una petición mal hecha no corta la que está en marcha
            cancel = _take_turn()
            if not _running.acquire(timeout=10):
                raise LiveError("La captura anterior no termina: espera unos segundos o reinicia el servidor")
            try:
                if cancel.is_set():
                    raise LiveError(CANCELLED)
                with OPENERS[req.mode](req, cancel) as (info, source):
                    self._send("inicio", info)
                    self._pump(source, info["n"], cancel)
            finally:
                _running.release()
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass  # el cliente se ha ido o no lee; la placa ya está suelta
        except (LiveError, SystemExit) as error:  # SystemExit: mensajes de captura/cw.py
            with contextlib.suppress(OSError):
                self._send("error", {"mensaje": str(error)})
        except Exception as error:  # noqa: BLE001 - la placa puede fallar a mitad
            self.log_error("captura: %r", error)
            with contextlib.suppress(OSError):
                self._send("error", {"mensaje": f"Error durante la captura: {error}"})

    def _pump(self, source, n: int, cancel: threading.Event) -> None:
        """Agrupa las trazas en lotes de ~250 ms, los envía y acaba con `fin`."""
        t0 = last = time.monotonic()
        sent, texts, traces = 0, [], []
        for text, trace in source:
            texts.append(text.hex())
            traces.append(trace.tolist())
            now = time.monotonic()
            done = sent + len(texts)
            if done >= n or now - last >= BATCH_SECONDS:
                self._send("lote", {"i0": sent, "textos": texts, "trazas": traces,
                                    "ritmo": round(done / max(now - t0, 1e-3), 1)})
                sent, texts, traces, last = done, [], [], now
            if done >= n:
                break
        if cancel.is_set():
            raise LiveError(CANCELLED)
        self._send("fin", {"n": sent, "segundos": round(time.monotonic() - t0, 1)})


def _open_tunnel(port: int, timeout: float = 30.0) -> tuple[subprocess.Popen, str]:
    """Publica el servidor del público con un túnel rápido de cloudflared: (proceso, dirección).

    cloudflared escribe la dirección (https://….trycloudflare.com) en su registro,
    que va por stderr; se sigue leyendo después para que no se llene la tubería.
    """
    program = shutil.which("cloudflared")
    if program is None:
        raise LiveError("falta cloudflared (en Arch: sudo pacman -S cloudflared)")
    process = subprocess.Popen([program, "tunnel", "--url", f"http://127.0.0.1:{port}"],
                               stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.PIPE, text=True, errors="replace")
    found: list[str] = []
    ready = threading.Event()

    def read_log() -> None:
        for line in process.stderr:
            match = TUNNEL_URL.search(line)
            if match and not found:
                found.append(match.group(0))
                ready.set()
        ready.set()  # cloudflared ha terminado

    threading.Thread(target=read_log, daemon=True).start()
    ready.wait(timeout)
    if not found:
        process.terminate()
        raise LiveError("cloudflared no ha dado una dirección: ¿hay internet?")
    return process, found[0]


def _start_room(port: int, url: str | None, tunnel: bool) -> subprocess.Popen | None:
    """Arranca el servidor del público y, si se pide, el túnel. Si algo falla, la
    presentación sigue sin sala: la diapositiva vuelve a la palabra de la clase."""
    try:
        sala.serve_audience(ROOM, port)
    except OSError as error:
        print(f"Sala: no se puede usar el puerto {port} ({error}); sigue sin sala.", flush=True)
        return None
    process = None
    if url is None and tunnel:
        try:
            process, url = _open_tunnel(port)
        except (LiveError, OSError) as error:
            print(f"Sala: {error}; sigue sin sala (o da la dirección con --sala-url).", flush=True)
            return None
    ROOM.url = url.rstrip("/") + "/"
    print(f"Sala (móviles): {ROOM.url}", flush=True)
    if sala.qr_svg(ROOM.url) is None:
        print("Sala: falta segno para el QR (lo instala uv run); se verá solo la dirección.", flush=True)
    return process


def serve(port: int, open_browser: bool, room_port: int = ROOM_PORT, room_url: str | None = None,
          tunnel: bool = False) -> int:
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError as error:
        sys.exit(f"No se puede usar el puerto {port} ({error}): prueba otro con --puerto")
    url = f"http://127.0.0.1:{port}/presentacion/"
    print(f"Presentación: {url}\nDemo suelta:  {url}demo.html\n"
          f"Placa: {nano_status()[1]}", flush=True)
    tunnel_process = _start_room(room_port, room_url, tunnel) if room_url or tunnel else None
    print("Ctrl+C para parar.", flush=True)
    if open_browser:
        webbrowser.open(url)
    with server:
        with contextlib.suppress(KeyboardInterrupt):
            server.serve_forever()
    if tunnel_process is not None:
        tunnel_process.terminate()
    # Al salir, se para la captura en marcha y se espera a que suelte la placa.
    _take_turn()
    if _running.acquire(timeout=5):
        _running.release()
    return 0


# --------------------------------------------------------------------------
# Comprobación sin hardware


def _events(url: str, timeout: float = 60) -> list[tuple[str, dict]]:
    """Lee un flujo SSE hasta que el servidor lo cierra: [(evento, datos), ...]."""
    events, name = [], None
    with urllib.request.urlopen(url, timeout=timeout) as response:
        for raw in response:
            line = raw.decode().rstrip("\r\n")
            if line.startswith("event: "):
                name = line[7:]
            elif line.startswith("data: "):
                events.append((name, json.loads(line[6:])))
    return events


def _attack(events) -> bytes:
    """CPA de analisis/attacks.py sobre lo recibido: la clave que gana."""
    batches = [data for name, data in events if name == "lote"]
    texts = np.array([list(bytes.fromhex(t)) for b in batches for t in b["textos"]], dtype=np.uint8)
    traces = np.array([t for b in batches for t in b["trazas"]], dtype=np.float64)
    return bytes(attacks.winning_key(attacks.cpa_scores(traces, texts)))


class _Quiet(Handler):
    def log_message(self, format, *args):
        pass


def _call(url: str, data: dict | bytes | None = None, headers: dict | None = None) -> tuple[int, object]:
    """Una petición (POST si lleva datos): el código y el cuerpo, como JSON si lo es."""
    body = data if data is None or isinstance(data, bytes) else json.dumps(data).encode()
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            code, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        code, raw = error.code, error.read()
    try:
        return code, json.loads(raw)
    except ValueError:
        return code, raw.decode(errors="replace")


def _check_tunnel(expect) -> None:
    """El arranque del túnel, con un cloudflared de mentira que escribe lo que el de verdad."""
    import stat
    import tempfile

    fake = """#!/bin/sh
echo '2026-11-24T10:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...' >&2
%s
sleep 30
"""
    good = ("echo '2026-11-24T10:00:01Z INF |  https://calm-river-demo-sala.trycloudflare.com"
            "                                |' >&2")
    bad = ("echo 'failed to request quick Tunnel: Post \"https://api.trycloudflare.com/tunnel\": "
           "dial tcp: lookup api.trycloudflare.com: no such host' >&2\nexit 1")
    path = os.environ.get("PATH", "")
    with tempfile.TemporaryDirectory() as folder:
        program = Path(folder) / "cloudflared"
        os.environ["PATH"] = folder
        try:
            expect(_raises(lambda: _open_tunnel(8001, 2)), "túnel: sin cloudflared, la presentación sigue sin sala")
            os.environ["PATH"] = folder + os.pathsep + path
            program.write_text(fake % good)
            program.chmod(program.stat().st_mode | stat.S_IXUSR)
            process, url = _open_tunnel(8001, 5)
            process.terminate()
            expect(url == "https://calm-river-demo-sala.trycloudflare.com" and process.wait(5) is not None,
                   "túnel: la dirección sale del registro de cloudflared")
            program.write_text(fake % bad)
            expect(_raises(lambda: _open_tunnel(8001, 5)), "túnel: sin internet no se toma por dirección la de la API")
        finally:
            os.environ["PATH"] = path


def _raises(call) -> bool:
    try:
        call()
    except LiveError:
        return True
    return False


def _check_room(base: str, expect) -> None:
    """La sala de principio a fin, con móviles de mentira: eligen, se cierra, se ataca y se enteran."""
    global ROOM
    previous, ROOM = ROOM, sala.Room("https://sala.example/")
    audience = sala.serve_audience(ROOM, 0)
    public = f"http://127.0.0.1:{audience.server_address[1]}"
    phones = [f"{i:032x}" for i in range(1, 21)]
    chosen = {i: (37 * i + 11) % 256 for i in range(12)}

    def phone(i: int) -> dict:
        return _call(f"{public}/estado?id={phones[i]}")[1]

    try:
        code, state = _call(base + "/api/sala")
        expect(code == 200 and state["activa"] and state["abierta"] and not any(state["asignados"])
               and state["dispositivos"] == 0, "sala: empieza abierta y vacía")
        code, svg = _call(base + "/api/sala/qr.svg")
        expect(code == 200 and str(svg).startswith("<svg"), "sala: el QR de la dirección, en SVG")

        code, page = _call(public + "/")
        expect(code == 200 and 'data-vista="elige"' in page
               and not re.search(r"""(?:src|href)=["']?(?:https?:)?//""", page),
               "sala: la página del móvil no carga nada de fuera")

        positions = [phone(i)["posicion"] for i in range(20)]
        expect(positions == [*range(16), None, None, None, None],
               "sala: los 16 primeros móviles tienen posición y los demás miran")
        expect(set(phone(0)) == {"ronda", "abierta", "posicion", "valor", "azar", "elegidos",
                                 "apuesta_abierta", "apuesta", "leido"},
               "sala: un móvil solo ve su posición y su byte")

        saved = [_call(public + "/byte", {"id": phones[i], "valor": v}) for i, v in chosen.items()]
        chosen[3] = 0xFF
        saved.append(_call(public + "/byte", {"id": phones[3], "valor": 0xFF}))
        expect(all(code == 200 for code, _ in saved) and phone(3)["valor"] == "ff" and phone(5)["valor"] == f"{chosen[5]:02x}",
               "sala: 12 móviles eligen su byte y uno lo cambia")
        bad = [_call(public + "/byte", {"id": phones[12], "valor": v})[0] for v in (256, -1, "2a", True, 1.5, None)]
        expect(bad == [409] * 6 and phone(12)["valor"] is None, "sala: un valor que no es de 0 a 255 no se guarda")
        expect(_call(public + "/byte", {"id": phones[16], "valor": 1})[0] == 409, "sala: quien no tiene posición no elige")
        expect(_call(public + "/byte", {"id": "x" * 32, "valor": 1})[0] == 400
               and _call(public + "/estado?id=1")[0] == 400
               and _call(public + "/byte", json.dumps({"id": phones[0], "valor": 1, "x": "a" * 300}).encode())[0] == 400,
               "sala: identificador mal escrito o cuerpo largo → 400")
        closed_doors = [_call(public + path)[0] for path in
                        ("/api/sala", "/api/vivo?n=5", "/presentacion/index.html", "/pyproject.toml", "//etc/passwd")]
        closed_doors.append(_call(public + "/api/sala/cerrar", {})[0])
        expect(closed_doors == [404] * 6, "sala: el servidor del público no da ficheros, ni la placa, ni la clave")

        state = _call(base + "/api/sala")[1]
        expect(sum(state["elegidos"]) == 12 and state["dispositivos"] == 20 and "clave_hex" not in state
               and all(type(x) is bool for x in state["elegidos"]),
               "sala: las diapositivas ven cuántos han elegido, no qué")

        before = _call(public + "/apuesta", {"id": phones[0], "valor": 100})[0]
        _call(base + "/api/sala/apuesta", {"abierta": True})
        bets = [_call(public + "/apuesta", {"id": phones[i], "valor": v})[0] for i, v in ((0, 100), (17, 100), (18, 1000), (19, 50))]
        state = _call(base + "/api/sala/apuesta", {"abierta": False})[1]
        expect(before == 409 and bets == [200, 200, 200, 409]
               and state["apuestas"] == {"10": 0, "100": 2, "1000": 1, "10000": 0, "1000000": 0},
               "sala: las apuestas solo cuentan mientras están abiertas, también las de quien mira")

        code, _ = _call(base + "/api/sala/cerrar", {}, {"Origin": "http://ejemplo.org"})
        expect(code == 403 and _call(base + "/api/sala")[1]["abierta"], "sala: otra web no puede cerrar la ronda → 403")

        code, end = _call(base + "/api/sala/cerrar", {})
        key = bytes.fromhex(end["clave_hex"])
        expect(code == 200 and len(key) == 16 and end["del_publico"] == 12 and not end["abierta"]
               and all(key[i] == v for i, v in chosen.items())
               and _call(base + "/api/sala/cerrar", {})[1]["clave_hex"] == key.hex(),
               "sala: al cerrar, la clave lleva los 12 bytes elegidos y 4 al azar")
        late = _call(f"{public}/estado?id={'f' * 32}")[1]
        expect(_call(public + "/byte", {"id": phones[0], "valor": 0})[0] == 409
               and phone(0)["valor"] == f"{chosen[0]:02x}" and not phone(0)["azar"]
               and phone(13)["valor"] == f"{key[13]:02x}" and phone(13)["azar"]
               and phone(16)["valor"] is None and late["posicion"] is None,
               "sala: cerrada, nadie cambia su byte y a quien no eligió se le dice el del azar")

        events = _events(base + f"/api/vivo?modo=simulado&n=400&ritmo=2000&clave={key.hex()}")
        expect(_attack(events) == key, "sala: el CPA de 400 trazas simuladas da la clave de la sala")
        other = bytes(b ^ 0xFF for b in key).hex()
        stale = _call(base + "/api/sala/leidos", {"posiciones": [0], "trazas": 10, "clave": other})[0]
        expect(stale == 409 and phone(0)["leido"] is None, "sala: una captura con otra clave no pone verde a nadie")
        _call(base + "/api/sala/leidos", {"posiciones": [0, 5], "trazas": 40, "clave": key.hex()})
        _call(base + "/api/sala/leidos", {"posiciones": list(range(16)), "trazas": 90, "clave": key.hex()})
        read = (phone(0)["leido"], phone(1)["leido"], phone(16)["leido"])
        wrong = [_call(base + "/api/sala/leidos", body)[0] for body in
                 ({"posiciones": [16], "trazas": 5, "clave": key.hex()}, {"posiciones": [1], "trazas": 5})]
        _call(base + "/api/sala/leidos", {"posiciones": [], "trazas": 0})
        expect(read == ({"trazas": 40}, {"trazas": 90}, None) and wrong == [400, 400] and phone(0)["leido"] is None,
               "sala: cada móvil se entera de con cuántas trazas se leyó su byte")

        state = _call(base + "/api/sala/abrir", {})[1]
        expect(state["abierta"] and state["dispositivos"] == 0 and state["ronda"] == end["ronda"] + 1
               and phone(19)["posicion"] == 0, "sala: otra ronda empieza de cero")
        for i in range(sala.MAX_DEVICES + 5):
            _call(f"{public}/estado?id={i:032x}".replace("id=0", "id=a"))
        expect(_call(base + "/api/sala")[1]["dispositivos"] == sala.MAX_DEVICES,
               f"sala: como mucho {sala.MAX_DEVICES} móviles por ronda")

        ROOM = sala.Room()
        expect(_call(base + "/api/sala")[1]["activa"] is False and _call(base + "/api/sala/cerrar", {})[0] == 409
               and _call(base + "/api/sala/qr.svg")[0] == 503, "sin --sala: no hay sala ni QR")
        _check_tunnel(expect)
    finally:
        audience.shutdown()
        ROOM = previous


def check() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", 0), _Quiet)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    failures = []

    def expect(ok: bool, what: str) -> None:
        print(f"{'ok ' if ok else 'MAL'}  {what}", flush=True)
        if not ok:
            failures.append(what)

    def well_formed(events, mode: str, n: int, width: int) -> bool:
        names = [name for name, _ in events]
        batches = [data for name, data in events if name == "lote"]
        starts = [b["i0"] for b in batches]
        sizes = [len(b["textos"]) for b in batches]
        return (names[0] == "inicio" and events[0][1]["modo"] == mode and names[-1] == "fin"
                and events[-1][1]["n"] == n == sum(sizes) and len(batches) >= 2
                and starts == [sum(sizes[:i]) for i in range(len(sizes))]
                and all(len(b["trazas"]) == len(b["textos"]) for b in batches)
                and all(len(t) == width for b in batches for t in b["trazas"]))

    state = json.load(urllib.request.urlopen(base + "/api/estado", timeout=5))
    expect(set(state) == {"modos", "nano", "grabado"} and "grabado" in state["modos"]
           and set(state["nano"]) == {"disponible", "motivo"},
           f"/api/estado; placa: {state['nano']['motivo']}")

    events = _events(base + "/api/vivo?modo=grabado&n=200&ritmo=600")
    start = events[0][1]
    expect(well_formed(events, "grabado", 200, 300) and start["ventana"] == [440, 740]
           and start["clave_hex"] == state["grabado"]["clave_hex"],
           f"grabado: {len(events) - 2} lotes, 200 trazas de 300 muestras")
    codes = np.array([t for name, data in events if name == "lote" for t in data["trazas"]])
    expect(codes.dtype.kind == "i" and codes.min() >= 0 and codes.max() <= 255, "grabado: códigos del ADC")
    expect(_attack(events).hex() == start["clave_hex"], "grabado: el CPA de lo recibido da la clave")

    key = b"UMA hardware 26!"
    events = _events(base + f"/api/vivo?modo=simulado&n=400&ritmo=1000&clave={key.hex()}")
    start = events[0][1]
    expect(well_formed(events, "simulado", 400, 96) and start["clave_hex"] == key.hex()
           and "simulad" in start["etiqueta"], "simulado: 400 trazas, etiquetado como simulado")
    expect(_attack(events) == key, f"simulado: el CPA de lo recibido da «{key.decode()}»")

    events = _events(base + "/api/vivo?modo=grabado&n=10")
    seconds = events[-1][1].get("segundos", 0)
    expect(events[-1][0] == "fin" and 0.4 < seconds < 1.2,
           f"ritmo medido: 10 trazas en {seconds} s a {MEASURED_RATE} trazas/s")

    for query, what in (("modo=foo", "modo desconocido"), ("clave=zz", "clave mal escrita"),
                        ("desde=740&hasta=440", "ventana al revés"), ("n=0", "n = 0")):
        events = _events(base + "/api/vivo?" + query)
        expect([name for name, _ in events] == ["error"], f"{what} → {events[0][1].get('mensaje')}")

    if state["nano"]["disponible"]:
        print("--   nano: la placa está enchufada y --comprobar no la toca")
    else:
        events = _events(base + "/api/vivo?modo=nano&n=5")
        expect(events == [("error", {"mensaje": state["nano"]["motivo"]})],
               f"nano sin placa → «{state['nano']['motivo']}»")

    # Una a la vez: la segunda cancela la primera, que acaba con un error.
    first: list = []
    worker = threading.Thread(target=lambda: first.extend(_events(base + "/api/vivo?modo=grabado&n=1000&ritmo=40")))
    worker.start()
    time.sleep(0.6)
    second = _events(base + "/api/vivo?modo=grabado&n=20&ritmo=2000")
    worker.join(10)
    expect(not worker.is_alive() and first[-1] == ("error", {"mensaje": CANCELLED})
           and second[-1][0] == "fin" and second[-1][1]["n"] == 20,
           f"una a la vez: la primera para con {sum(1 for n, _ in first if n == 'lote')} lotes y la segunda acaba")

    # Un cliente que deja de leer no retiene la placa: el socket tiene timeout.
    port = server.server_address[1]
    stalled = socket.socket()
    stalled.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
    stalled.connect(("127.0.0.1", port))
    stalled.sendall(f"GET /api/vivo?modo=grabado&n=1000&ritmo=10000&desde=0&hasta=1500 HTTP/1.0\r\n"
                    f"Host: 127.0.0.1:{port}\r\n\r\n".encode())
    time.sleep(1)
    t0 = time.monotonic()
    events = _events(base + "/api/vivo?modo=grabado&n=20&ritmo=2000")
    stalled.close()
    expect(events[-1][0] == "fin", f"cliente que no lee: la siguiente acaba a los {time.monotonic() - t0:.1f} s")

    for headers, what in (({"Host": "ejemplo.org"}, "Host ajeno"),
                          ({"Sec-Fetch-Site": "cross-site"}, "petición desde otra web"),
                          ({"Origin": "http://localhost:9999"}, "Origin de otro puerto")):
        try:
            urllib.request.urlopen(urllib.request.Request(base + "/api/vivo?n=5", headers=headers), timeout=5)
            expect(False, f"{what} → 403")
        except urllib.error.HTTPError as error:
            expect(error.code == 403, f"{what} → 403")

    for path in ("/presentacion/demo.html", "/web/data/nano-tinyaes.json"):
        try:
            with urllib.request.urlopen(base + path, timeout=5) as response:
                expect(response.status == 200, f"estático: {path}")
        except urllib.error.HTTPError as error:
            expect(False, f"estático: {path} ({error.code})")

    _check_room(base, expect)

    server.shutdown()
    print("\nTodo bien." if not failures else f"\n{len(failures)} comprobaciones fallan.")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--puerto", type=int, default=8000, help="puerto local (8000)")
    parser.add_argument("--abrir", action="store_true", help="abre la presentación en el navegador")
    parser.add_argument("--comprobar", action="store_true",
                        help="prueba el servidor sin placa en un puerto libre y sale con 0 o 1")
    parser.add_argument("--sala", action="store_true",
                        help="el público elige la clave desde el móvil: publica la sala con cloudflared")
    parser.add_argument("--sala-url", metavar="URL",
                        help="dirección pública de la sala ya montada (o http://127.0.0.1:8001/ para ensayar)")
    parser.add_argument("--puerto-sala", type=int, default=ROOM_PORT, help=f"puerto local de la sala ({ROOM_PORT})")
    args = parser.parse_args(argv)
    if args.comprobar:
        return check()
    return serve(args.puerto, args.abrir, args.puerto_sala, args.sala_url, args.sala)


if __name__ == "__main__":
    raise SystemExit(main())
