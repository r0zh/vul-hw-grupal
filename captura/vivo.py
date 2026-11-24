"""Servidor local de la demo en directo del ataque (para la presentación).

    uv run python -m captura.vivo                    # http://127.0.0.1:8000/presentacion/
    uv run python -m captura.vivo --puerto 8320 --abrir
    uv run python -m captura.vivo --comprobar        # prueba sin placa; sale con 0 o 1

Sirve la raíz del repositorio, solo en 127.0.0.1 porque maneja la placa, de
modo que /presentacion/ y /web/ funcionan igual que con un servidor estático.
Añade dos rutas:

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
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import importlib.util
import json
import os
import socket
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


@contextlib.contextmanager
def _open_nano(req, cancel):
    ok, reason = nano_status()
    if not ok:
        raise LiveError(reason)
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

    def do_GET(self):
        if not self._local():
            self.send_error(403, "Solo en local")
            return
        url = urlsplit(self.path)
        if url.path == "/api/estado":
            body = json.dumps(status(), ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif url.path == "/api/vivo":
            self._live(url.query)
        else:
            # El navegador corta descargas al recargar: no es un error ni merece una traza en la consola.
            with contextlib.suppress(BrokenPipeError, ConnectionResetError):
                super().do_GET()

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


def serve(port: int, open_browser: bool) -> int:
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError as error:
        sys.exit(f"No se puede usar el puerto {port} ({error}): prueba otro con --puerto")
    url = f"http://127.0.0.1:{port}/presentacion/"
    print(f"Presentación: {url}\nDemo suelta:  {url}demo.html\n"
          f"Placa: {nano_status()[1]}\nCtrl+C para parar.", flush=True)
    if open_browser:
        webbrowser.open(url)
    with server:
        with contextlib.suppress(KeyboardInterrupt):
            server.serve_forever()
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

    server.shutdown()
    print("\nTodo bien." if not failures else f"\n{len(failures)} comprobaciones fallan.")
    return 1 if failures else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--puerto", type=int, default=8000, help="puerto local (8000)")
    parser.add_argument("--abrir", action="store_true", help="abre la presentación en el navegador")
    parser.add_argument("--comprobar", action="store_true",
                        help="prueba el servidor sin placa en un puerto libre y sale con 0 o 1")
    args = parser.parse_args(argv)
    return check() if args.comprobar else serve(args.puerto, args.abrir)


if __name__ == "__main__":
    raise SystemExit(main())
