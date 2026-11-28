"""La sala: el público elige desde el móvil los bytes de la clave de la demo.

En la diapositiva «pregunta» sale un código QR. Cada móvil que lo abre recibe
una de las 16 posiciones de la clave y elige su valor, de 00 a FF; al cerrar,
las posiciones sin valor las pone el azar y la clave se carga en el chip. Nadie
ve la clave entera: cada persona sabe solo su byte, y lo comprueba cuando el
ataque lo saca del consumo y su móvil se pone verde.

Hay dos servidores y solo uno sale a internet:

- El del público (`serve_audience`): escucha en 127.0.0.1 y se publica con un
  túnel (`captura.vivo --sala`). Solo tiene cuatro rutas, no sirve ficheros y
  nunca da la clave ni los bytes de los demás:

      GET  /                la página del móvil (presentacion/sala.html)
      GET  /estado?id=…     lo que ve ese móvil
      POST /byte            {"id", "valor": 0-255}
      POST /apuesta         {"id", "valor": 10 | 100 | 1000 | 10000 | 1000000}

- El de la presentación (`captura/vivo.py`), que no sale de 127.0.0.1: sus
  rutas /api/sala manejan la ronda desde las diapositivas.

`id` es un identificador al azar que guarda cada móvil (32 cifras hex): no hay
nombres ni cuentas, y lo único que se guarda de cada uno es su posición, su
byte y su apuesta, en memoria y hasta que se para el servidor.
"""

from __future__ import annotations

import json
import re
import secrets
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

POSITIONS = 16
MAX_DEVICES = 300          # móviles por ronda; los demás solo miran
MAX_BODY = 200             # bytes de cuerpo que se leen de un POST
BETS = (10, 100, 1000, 10_000, 1_000_000)  # las opciones de la diapositiva «apuesta»
PAGE = Path(__file__).resolve().parents[1] / "presentacion" / "sala.html"
_ID = re.compile(r"[0-9a-f]{32}")


@dataclass
class Device:
    position: int | None    # None: llegó cuando ya no quedaban posiciones
    value: int | None = None
    bet: int | None = None


class Room:
    """Una ronda: quién tiene cada posición, qué ha elegido y qué se ha leído ya."""

    def __init__(self, url: str | None = None):
        self.url = url      # dirección pública de la página del móvil; None: sin sala
        self._lock = threading.Lock()
        self.round = 0
        self._reset()

    def _reset(self) -> None:
        self.round += 1
        self.open = True
        self.betting = False
        self.devices: dict[str, Device] = {}
        self.key: bytes | None = None
        self.chosen: frozenset[int] = frozenset()   # posiciones con byte del público, al cerrar
        self.read: dict[int, int] = {}              # posición → trazas con las que se leyó

    def reopen(self) -> None:
        """Empieza otra ronda: se olvidan los móviles, los bytes y las apuestas."""
        with self._lock:
            self._reset()

    # ---- el público ----

    def _device(self, device_id: str) -> Device | None:
        """El móvil, dándolo de alta si es nuevo; None si ya no caben más."""
        device = self.devices.get(device_id)
        if device is None:
            if len(self.devices) >= MAX_DEVICES:
                return None
            taken = {d.position for d in self.devices.values()}
            free = next((j for j in range(POSITIONS) if j not in taken), None) if self.open else None
            device = self.devices[device_id] = Device(position=free)
        return device

    def choose(self, device_id: str, value: int) -> bool:
        with self._lock:
            device = self._device(device_id)
            if not self.open or device is None or device.position is None:
                return False
            device.value = value
            return True

    def bet(self, device_id: str, value: int) -> bool:
        with self._lock:
            device = self._device(device_id)
            if not self.betting or device is None:
                return False
            device.bet = value
            return True

    def public_state(self, device_id: str) -> dict:
        """Lo que ve un móvil: su posición y su byte, nunca los de los demás."""
        with self._lock:
            device = self._device(device_id)
            position = device.position if device else None
            value = device.value if device else None
            random_fill = False
            if self.key is not None and position is not None:
                random_fill = position not in self.chosen
                value = self.key[position]
            traces = self.read.get(position) if position is not None else None
            return {
                "ronda": self.round,
                "abierta": self.open,
                "posicion": position,
                "valor": None if value is None else f"{value:02x}",
                "azar": random_fill,
                "elegidos": sum(d.value is not None for d in self.devices.values()),
                "apuesta_abierta": self.betting,
                "apuesta": device.bet if device else None,
                "leido": None if traces is None else {"trazas": traces},
            }

    # ---- la presentación ----

    def close(self) -> bytes:
        """Cierra la ronda y da la clave: los bytes elegidos y, en los huecos, azar."""
        with self._lock:
            if self.key is None:
                picked = {d.position: d.value for d in self.devices.values()
                          if d.position is not None and d.value is not None}
                self.key = bytes(picked.get(j, secrets.randbelow(256)) for j in range(POSITIONS))
                self.chosen = frozenset(picked)
                self.open = False
            return self.key

    def set_betting(self, on: bool) -> None:
        with self._lock:
            self.betting = on

    def mark_read(self, positions: list[int], traces: int, key: bytes | None = None) -> bool:
        """El ataque ha sacado estas posiciones con `traces` trazas. Lista vacía: empieza otra captura.

        Solo cuenta si la captura se hizo con la clave de esta ronda: así un móvil no se pone
        verde por una clave vieja que el navegador guardara de antes de reiniciar el servidor.
        """
        with self._lock:
            if not positions:
                self.read = {}
                return True
            if self.key is None or key != self.key:
                return False
            for j in positions:
                self.read.setdefault(j, traces)
            return True

    def local_state(self) -> dict:
        """Lo que ven las diapositivas: qué posiciones tienen valor, no cuál."""
        with self._lock:
            owners = {d.position: d for d in self.devices.values() if d.position is not None}
            bets = [d.bet for d in self.devices.values() if d.bet is not None]
            return {
                "activa": self.url is not None,
                "url": self.url,
                "ronda": self.round,
                "abierta": self.open,
                "asignados": [j in owners for j in range(POSITIONS)],
                "elegidos": [j in self.chosen if self.key is not None
                             else j in owners and owners[j].value is not None for j in range(POSITIONS)],
                "dispositivos": len(self.devices),
                "apuesta_abierta": self.betting,
                "apuestas": {str(option): bets.count(option) for option in BETS},
                "leidos": sorted(self.read),
            }


# --------------------------------------------------------------------------
# Servidor del público


def _json_body(handler: BaseHTTPRequestHandler) -> dict | None:
    """El cuerpo de un POST como objeto JSON; None si falta, es largo o no es un objeto."""
    try:
        length = int(handler.headers.get("Content-Length", ""))
    except ValueError:
        return None
    if not 0 < length <= MAX_BODY:
        return None
    try:
        data = json.loads(handler.rfile.read(length))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _is_int(value, allowed) -> bool:
    return type(value) is int and value in allowed  # bool no vale: True == 1


def audience_handler(room: Room) -> type[BaseHTTPRequestHandler]:
    class Audience(BaseHTTPRequestHandler):
        timeout = 5             # un móvil que deja de leer no retiene un hilo
        server_version = "sala"
        sys_version = ""

        def log_message(self, format, *args):
            pass                # ni direcciones ni identificadores en la consola

        def _reply(self, code: int, body: bytes, content_type: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

        def _json(self, code: int, data: dict) -> None:
            self._reply(code, json.dumps(data, separators=(",", ":")).encode(), "application/json; charset=utf-8")

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == "/":
                try:
                    page = PAGE.read_bytes()
                except OSError:
                    self._json(500, {"error": "falta la página"})
                    return
                self._reply(200, page, "text/html; charset=utf-8")
            elif url.path == "/estado":
                device_id = parse_qs(url.query).get("id", [""])[-1]
                if not _ID.fullmatch(device_id):
                    self._json(400, {"error": "id"})
                    return
                self._json(200, room.public_state(device_id))
            else:
                self._json(404, {"error": "no existe"})

        def do_POST(self):
            path = urlsplit(self.path).path
            if path not in ("/byte", "/apuesta"):
                self._json(404, {"error": "no existe"})
                return
            data = _json_body(self)
            device_id = data.get("id") if data else None
            if not isinstance(device_id, str) or not _ID.fullmatch(device_id):
                self._json(400, {"error": "id"})
                return
            value = data.get("valor")
            if path == "/byte":
                done = _is_int(value, range(256)) and room.choose(device_id, value)
            else:
                done = _is_int(value, BETS) and room.bet(device_id, value)
            self._json(200 if done else 409, room.public_state(device_id))

    return Audience


def serve_audience(room: Room, port: int) -> ThreadingHTTPServer:
    """Arranca el servidor del público en 127.0.0.1 (lo publica el túnel) y lo devuelve."""
    server = ThreadingHTTPServer(("127.0.0.1", port), audience_handler(room))
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def qr_svg(url: str) -> str | None:
    """El QR de la dirección, en SVG; None si falta segno (lo instala uv run)."""
    try:
        import segno
    except ImportError:
        return None
    import io

    buffer = io.BytesIO()
    # Se pide la corrección de errores más baja para que el código tenga los menos módulos
    # posibles (y más grandes, que es lo que cuenta desde el fondo del aula); segno la sube
    # sola si cabe en el mismo tamaño. Una dirección de trycloudflare da 33 × 33 módulos.
    segno.make(url, error="l").save(buffer, kind="svg", border=2, dark="#1d1d1f",
                                    xmldecl=False, svgns=True, nl=False, omitsize=True)
    return buffer.getvalue().decode()
