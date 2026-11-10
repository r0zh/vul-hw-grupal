"""Captura de trazas con un ChipWhisperer (Nano, Lite o Husky).

Uso (con el grupo `captura` instalado: `uv sync --group captura`):

    uv run python -m captura.cw info                    # ¿se ve el CW? tipo y firmware
    uv run python -m captura.cw programar               # carga simpleserial-aes en el target
    uv run python -m captura.cw capturar -n 50 --nombre prueba
    uv run python -m captura.cw capturar -n 3000 --nombre nano-tinyaes

    # Sin hardware: mismo flujo con trazas sintéticas (marcadas como simuladas)
    uv run python -m captura.cw capturar --simular -n 2000 --nombre humo

Cada cifrado se comprueba contra `analisis/aes.py`: si el texto cifrado que
devuelve el target no coincide, la captura se detiene, porque o el firmware no
es AES-128 o la clave cargada no es la que creemos.

Las campañas se guardan en `datos/brutos/` (ignorado por git) con el formato
de `captura/campana.py`.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from analisis import aes
from analisis.config import LAB_KEY

from . import campana

FIRMWARE_DIR = campana.REPO / "firmware" / "build"
DATA_DIR = campana.REPO / "datos" / "brutos"

#: Plataformas de firmware de NewAE que sabemos programar.
PROGRAMMERS = {
    "CWNANO": "STM32FProgrammer",
    "CWLITEARM": "STM32FProgrammer",
    "CWLITEXMEGA": "XMEGAProgrammer",
}


# --------------------------------------------------------------------------
# Conexión


def _cw():
    try:
        import chipwhisperer as cw
    except ImportError:
        sys.exit("Falta el paquete chipwhisperer: uv sync --group captura")
    return cw


def connect():
    cw = _cw()
    try:
        scope = cw.scope()
    except Exception as error:  # noqa: BLE001 - el mensaje de cw ya es útil
        sys.exit(
            f"No se pudo abrir el ChipWhisperer: {error}\n"
            "¿Está conectado? ¿Están instaladas las reglas udev? (ver captura/README.md)"
        )
    scope.default_setup()
    target = cw.target(scope, cw.targets.SimpleSerial)
    return cw, scope, target


def detect_platform(scope, requested: str | None) -> str:
    if requested:
        return requested.upper()
    if type(scope).__name__ == "CWNano":
        return "CWNANO"
    sys.exit(
        f"Scope {type(scope).__name__}: no se puede deducir el target. "
        "Indica --platform CWLITEARM o CWLITEXMEGA (mira qué chip lleva la placa)."
    )


def reset_target(scope, platform: str) -> None:
    if platform == "CWLITEXMEGA":
        scope.io.pdic = "low"
        time.sleep(0.1)
        scope.io.pdic = "high_z"
        time.sleep(0.1)
    else:
        scope.io.nrst = "low"
        time.sleep(0.05)
        scope.io.nrst = "high_z"
        time.sleep(0.05)


def _try(getter):
    try:
        value = getter()
    except Exception:  # noqa: BLE001 - atributos que no existen en todos los scopes
        return None
    return value if isinstance(value, (int, float, str, bool)) else str(value)


def scope_metadata(scope) -> dict:
    return {
        "tipo": type(scope).__name__,
        "serie": _try(lambda: scope.sn),
        "firmware_scope": _try(lambda: scope.fw_version_str),
        "adc_muestras": _try(lambda: scope.adc.samples),
        # Nano: scope.adc.clk_freq / scope.io.clkout. Lite/Husky: scope.clock.*
        "adc_hz": _try(lambda: scope.adc.clk_freq) or _try(lambda: scope.clock.adc_freq),
        "reloj_target_hz": _try(lambda: scope.io.clkout) or _try(lambda: scope.clock.clkgen_freq),
        "ganancia_db": _try(lambda: scope.gain.db),
    }


# --------------------------------------------------------------------------
# Subcomandos


def cmd_info(args) -> int:
    cw, scope, target = connect()
    print(scope)
    print("\nResumen:", scope_metadata(scope))
    try:
        platform = detect_platform(scope, args.platform)
        print(f"Plataforma de firmware: {platform}")
    except SystemExit as message:
        print(message)
    scope.dis()
    target.dis()
    return 0


def _firmware_path(args, platform: str) -> Path:
    path = Path(args.firmware) if args.firmware else FIRMWARE_DIR / f"simpleserial-aes-{platform}.hex"
    if not path.exists():
        sys.exit(f"No existe {path}. Compílalo con firmware/build.sh {platform}")
    return path


def cmd_program(args) -> int:
    cw, scope, target = connect()
    platform = detect_platform(scope, args.platform)
    firmware = _firmware_path(args, platform)
    print(f"Programando {firmware.name} en {platform}...")
    programmer = getattr(cw.programmers, PROGRAMMERS[platform])
    cw.program_target(scope, programmer, str(firmware))
    reset_target(scope, platform)
    print("Hecho.")
    scope.dis()
    target.dis()
    return 0


def _random_plaintexts(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).integers(0, 256, size=(n, 16), dtype=np.uint8)


def _capture_real(args, key: bytes, plaintexts: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    cw, scope, target = connect()
    platform = detect_platform(scope, args.platform)
    scope.adc.samples = args.samples
    if args.programar:
        firmware = _firmware_path(args, platform)
        cw.program_target(scope, getattr(cw.programmers, PROGRAMMERS[platform]), str(firmware))
    reset_target(scope, platform)

    round_keys = aes.key_expansion(key)
    traces = np.empty((len(plaintexts), args.samples), dtype=np.float32)
    ciphertexts = np.empty_like(plaintexts)
    trig_counts = []
    start = time.monotonic()
    i = 0
    timeouts = 0
    while i < len(plaintexts):
        pt = bytearray(plaintexts[i].tobytes())
        trace = cw.capture_trace(scope, target, pt, bytearray(key), as_int=False)
        if trace is None:
            timeouts += 1
            if timeouts > 10:
                sys.exit("Demasiados timeouts seguidos: ¿firmware cargado? Prueba `programar`.")
            reset_target(scope, platform)
            continue
        timeouts = 0
        expected = aes.encrypt_block(bytes(pt), round_keys)
        if bytes(trace.textout) != expected:
            sys.exit(
                f"Traza {i}: el target devolvió {bytes(trace.textout).hex()} y AES-128 da "
                f"{expected.hex()}. El firmware o la clave no son los esperados."
            )
        traces[i] = trace.wave[: args.samples]
        ciphertexts[i] = np.frombuffer(expected, dtype=np.uint8)
        count = _try(lambda: scope.adc.trig_count)
        if isinstance(count, int):
            trig_counts.append(count)
        i += 1
        if i % 100 == 0 or i == len(plaintexts):
            rate = i / (time.monotonic() - start)
            print(f"  {i}/{len(plaintexts)} trazas ({rate:.1f} trazas/s)", flush=True)

    metadata = {
        "instrumento": scope_metadata(scope),
        "plataforma": platform,
        "segundos": round(time.monotonic() - start, 1),
    }
    if trig_counts:
        # Ciclos de ADC con el trigger alto: duración del AES vista por el scope.
        metadata["trig_count_mediana"] = int(np.median(trig_counts))
    if args.programar or args.firmware:
        firmware = _firmware_path(args, platform)
        metadata["firmware"] = {
            "fichero": firmware.name,
            "sha256": hashlib.sha256(firmware.read_bytes()).hexdigest(),
        }
    scope.dis()
    target.dis()
    return traces, ciphertexts, metadata


def _capture_simulated(args, key: bytes, plaintexts: np.ndarray):
    from analisis.config import SimulationConfig
    from analisis.simulate import simulate_from_texts

    config = SimulationConfig(key=key, snr=args.snr, seed=args.seed)
    synthetic = simulate_from_texts(plaintexts, config)
    metadata = {
        "simulada": True,
        "instrumento": {"tipo": "analisis.simulate"},
        "snr": args.snr,
    }
    return synthetic.traces, synthetic.ciphertexts, metadata


def cmd_capture(args) -> int:
    key = bytes.fromhex(args.key)
    if len(key) != 16:
        sys.exit("La clave debe tener 16 bytes (32 caracteres hex)")
    plaintexts = _random_plaintexts(args.n, args.seed)
    capture = _capture_simulated if args.simular else _capture_real
    traces, ciphertexts, metadata = capture(args, key, plaintexts)

    stamp = datetime.now(timezone.utc).astimezone()
    name = args.nombre or ("sim" if args.simular else "cw")
    base = DATA_DIR / f"{stamp:%Y%m%d-%H%M%S}-{name}"
    metadata.update({
        "fecha": stamp.isoformat(timespec="seconds"),
        "commit": campana.repo_commit(),
        "semilla_textos": args.seed,
        "clave_hex": key.hex(),
        "firmware_fuente": "newaetech/chipwhisperer simpleserial-aes, CRYPTO_TARGET=TINYAES128C",
        "notas": args.notas,
    })
    npz, meta = campana.save(base, campana.Campaign(
        traces=traces, plaintexts=plaintexts, ciphertexts=ciphertexts,
        key=np.frombuffer(key, dtype=np.uint8), metadata=metadata,
    ))
    print(f"Guardado: {npz.relative_to(campana.REPO)} y {meta.name}")
    print(f"Siguiente paso: uv run python -m analisis.real {base.relative_to(campana.REPO)}")
    return 0


# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--platform", help="CWNANO, CWLITEARM o CWLITEXMEGA (el Nano se detecta solo)")
    parser.add_argument("--firmware", help="ruta al .hex (por defecto firmware/build/simpleserial-aes-<PLATFORM>.hex)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("info", help="conecta y muestra el estado del scope").set_defaults(func=cmd_info)
    sub.add_parser("programar", help="carga el firmware en el target").set_defaults(func=cmd_program)

    cap = sub.add_parser("capturar", help="captura una campaña de trazas")
    cap.add_argument("-n", type=int, default=1000, help="número de trazas (1000)")
    cap.add_argument("--samples", type=int, default=5000,
                     help="muestras por traza (5000; el Nano admite hasta 50 000)")
    cap.add_argument("--key", default=LAB_KEY.hex(), help="clave de laboratorio en hex")
    cap.add_argument("--seed", type=int, default=20261110, help="semilla de los textos claros")
    cap.add_argument("--nombre", help="sufijo del nombre de la campaña")
    cap.add_argument("--notas", default="", help="texto libre que va al JSON")
    cap.add_argument("--programar", action="store_true", help="programa el firmware antes de capturar")
    cap.add_argument("--simular", action="store_true", help="sin hardware: trazas sintéticas")
    cap.add_argument("--snr", type=float, default=0.1, help="SNR de --simular (0,1)")
    cap.set_defaults(func=cmd_capture)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
