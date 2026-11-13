"""Figuras y números de las medidas reales (fases 4 a 6).

    uv run python -m analisis.reales                 # figuras en figuras/ y números
    uv run python -m analisis.reales --rapido        # menos ordenaciones (prueba)

Solo lee las campañas versionadas en `datos/` (recortes de las de
`datos/brutos/`, hechos con `python -m captura.campana`), así que cualquiera
puede regenerar las figuras sin la placa. Los números van a
`analisis/salida/reales.json` y las figuras a `figuras/real-*.pdf`. La única
excepción es la campaña completa con retardos, que no cabe en el repositorio:
si está en `datos/brutos/`, se ataca entera y se anota en el JSON; si no, esas
claves se omiten y el resto sale igual.

Las curvas de éxito frente a N no salen de una sola ordenación de las trazas:
se repite el CPA sobre `--ordenaciones` permutaciones aleatorias (semilla fija)
de cada campaña y se cuenta en cuántas queda la clave completa en rango 1.
Como las permutaciones comparten trazas, los ensayos no son independientes;
es la forma habitual de estimar la tasa de éxito con una sola campaña.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from captura import campana

from . import aes, attacks
from .figures import FIG_WIDTH, _COLORS, _save, _style, plt
from .real import incremental_cpa

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "datos"
SEED = 20261113

#: Campañas versionadas que usa este módulo.
CAMPAIGNS = {
    "tinyaes": "20261113-nano-tinyaes-respaldo",
    "spa": "20261113-spa",
    "fijo": "20261113-texto-fijo",
    "cm-base": "20261113-cm-base",
    "cm-barajado": "20261113-cm-barajado",
    "cm-retardos": "20261113-cm-retardos",
}

#: Campaña completa con retardos. Son 20 000 trazas × 5000 muestras (85 MB), así
#: que solo está en `datos/brutos/` (ignorado por git) en el portátil que la
#: capturó; si no está, las claves que dependen de ella no se calculan.
FULL_DELAY_CAMPAIGN = "20261113-184736-cm-retardos"

#: Muestras de la campaña completa que se atacan: el cifrado con retardos dura
#: como mucho unos pocos miles de ciclos.
FULL_DELAY_SAMPLES = 3000

#: Anchuras (en muestras) de las ventanas de integración con las que se intenta
#: compensar los retardos antes de correlar.
DELAY_WINDOWS = (100, 300)

MEASURED_TAG = "Medidas reales: ChipWhisperer-Nano, 7,5 MHz, 1 muestra por ciclo"

HW = np.array([bin(i).count("1") for i in range(256)], dtype=np.float64)


def _load(name: str) -> campana.Campaign | None:
    path = DATA / CAMPAIGNS[name]
    return campana.load(path) if path.with_suffix(".npz").exists() else None


def _tag(axis) -> None:
    axis.text(0.5, -0.32, MEASURED_TAG, transform=axis.transAxes,
              ha="center", va="top", fontsize=6.5, color="#555555")


def _correct_correlation(traces: np.ndarray, values: np.ndarray) -> np.ndarray:
    """|ρ| entre HW(values[:, b]) y cada muestra, para los 16 bytes: (16, S)."""
    t = traces - traces.mean(axis=0)
    t_norm = np.sqrt((t * t).sum(axis=0))
    h = HW[values] - HW[values].mean(axis=0)
    h_norm = np.sqrt((h * h).sum(axis=0))
    with np.errstate(divide="ignore", invalid="ignore"):
        rho = (h.T @ t) / np.outer(h_norm, t_norm)
    return np.abs(np.nan_to_num(rho))


def success_curve(data: campana.Campaign, steps: list[int], orderings: int,
                  seed: int = SEED) -> dict:
    """Tasa de éxito y rango frente a N sobre `orderings` permutaciones."""
    traces = data.traces.astype(np.float64)
    key = data.key.astype(np.intp)
    rng = np.random.default_rng(seed)
    ranks = np.empty((orderings, len(steps), 16), dtype=int)
    for i in range(orderings):
        order = rng.permutation(len(traces))
        _, ranks[i] = incremental_cpa(traces[order], data.plaintexts[order], key, steps)
    full_key = (ranks == 1).all(axis=2)                       # (orderings, steps)
    success = full_key.mean(axis=0)

    def first_n(threshold: float) -> int | None:
        hits = np.nonzero(success >= threshold)[0]
        return int(steps[hits[0]]) if len(hits) else None

    # N a partir del cual cada ordenación tiene la clave completa hasta el final.
    per_ordering = []
    for row in full_key:
        bad = np.nonzero(~row)[0]
        per_ordering.append(steps[0] if len(bad) == 0 else
                            (None if bad[-1] == len(steps) - 1 else steps[bad[-1] + 1]))
    reached = [n for n in per_ordering if n is not None]
    return {
        "pasos": steps,
        "ordenaciones": orderings,
        "exito_clave_completa": success.tolist(),
        "fraccion_bytes_rango1": (ranks == 1).mean(axis=(0, 2)).tolist(),
        "rango_medio": ranks.mean(axis=(0, 2)).tolist(),
        "n_50": first_n(0.5),
        "n_90": first_n(0.9),
        "n_100": first_n(1.0),
        "n_estable_mediana": float(np.median(reached)) if len(reached) == orderings else None,
        "ordenaciones_sin_clave_al_final": int(orderings - len(reached)),
    }


def attack_summary(data: campana.Campaign) -> dict:
    """CPA con todas las trazas de la campaña: clave, picos y SNR equivalente."""
    scores = attacks.cpa_scores(data.traces.astype(np.float64), data.plaintexts)
    key = data.key.astype(np.intp)
    peaks = np.abs(scores)
    recovered = attacks.winning_key(scores)
    best_t = peaks[np.arange(16), key].argmax(axis=1)
    rho = peaks[np.arange(16), key, best_t]
    best_wrong = np.array([np.delete(peaks[b].max(axis=1), key[b]).max() for b in range(16)])
    return {
        "n_traces": int(len(data.traces)),
        "bytes_correctos": int((recovered == key).sum()),
        "clave_obtenida": bytes(recovered.astype(np.uint8)).hex(),
        "pico_correcto": rho.round(4).tolist(),
        "mejor_falso": best_wrong.round(4).tolist(),
        "muestra_pico": best_t.tolist(),
        # SNR que daría ese pico en el modelo de la simulación: ρ = √(SNR/(1+SNR)).
        "snr_equivalente": (rho**2 / (1 - rho**2)).round(3).tolist(),
    }


def alignment_shifts(traces: np.ndarray, max_shift: int = 5) -> dict:
    """Desplazamiento que mejor alinea cada traza con la media (texto fijo).

    Devuelve cuántas trazas tienen cada desplazamiento óptimo entre
    `-max_shift` y `max_shift` muestras: si el muestreo está sincronizado con
    el disparo, todas deberían quedar en 0.
    """
    mean = traces.mean(axis=0)
    mean = mean - mean.mean()
    shifts = np.arange(-max_shift, max_shift + 1)
    centred = traces - traces.mean(axis=1, keepdims=True)
    scores = np.stack([np.roll(centred, k, axis=1) @ mean for k in shifts], axis=1)
    best = shifts[scores.argmax(axis=1)]
    values, counts = np.unique(best, return_counts=True)
    return {str(int(v)): int(c) for v, c in zip(values, counts)}


def delay_integration(data: campana.Campaign, windows: tuple[int, ...] = DELAY_WINDOWS) -> dict:
    """CPA sobre ventanas integradas, para compensar los retardos.

    Sumar `w` muestras consecutivas (una media móvil sin normalizar) y correlar
    sobre la suma es la forma más simple de tolerar que cada traza llegue
    desplazada: mientras el byte esté dentro de la ventana, su fuga entra en la
    suma. Se muestrea una ventana de cada `w/5` para que las columnas no estén
    casi repetidas.
    """
    traces = data.traces.astype(np.float64)
    key = data.key.astype(np.intp)
    cumulative = np.cumsum(np.pad(traces, ((0, 0), (1, 0))), axis=1)
    output: dict = {}
    for width in windows:
        step = max(1, width // 5)
        windowed = (cumulative[:, width:] - cumulative[:, :-width])[:, ::step]
        scores = np.abs(attacks.cpa_scores(windowed, data.plaintexts))
        peaks = scores.max(axis=2)
        correct = peaks[np.arange(16), key]
        ranks = [(peaks[b] > correct[b]).sum() + 1 for b in range(16)]
        output[str(width)] = {
            "ancho": width,
            "salto": step,
            "bytes_correctos": int((attacks.winning_key(scores) == key).sum()),
            "rango_correcto": [int(r) for r in ranks],
            "pico_correcto": correct.round(4).tolist(),
            "muestra_pico": [int(scores[b, key[b]].argmax() * step) for b in range(16)],
        }
    return output


# ──────────────────────────────── Figuras ────────────────────────────────

def figure_spa(spa: campana.Campaign, out: Path, png: Path | None = None) -> tuple[Path, dict]:
    """Traza media del cifrado completo y dónde fugan la primera y la última ronda."""
    _style()
    traces = spa.traces.astype(np.float64)
    mean = traces.mean(axis=0)
    first = _correct_correlation(traces, np.asarray(aes.SBOX, dtype=np.uint8)[spa.plaintexts ^ spa.key])
    k10 = np.asarray(aes.key_expansion(bytes(spa.key))[10], dtype=np.uint8)
    last = _correct_correlation(traces, spa.ciphertexts ^ k10)

    # Periodo de las rondas: autocorrelación de la traza media en el cifrado.
    end = int(np.nonzero(last.max(axis=0) > 0.6)[0].max()) + 1
    centred = mean[:end] - mean[:end].mean()
    auto = np.correlate(centred, centred, "full")[end - 1:]
    period = int(600 + np.argmax(auto[600:1500]))

    def span(curve):
        idx = np.nonzero(curve.max(axis=0) > 0.6)[0]
        return int(idx.min()), int(idx.max())

    figure, (top, bottom) = plt.subplots(2, 1, figsize=(FIG_WIDTH, 3.6), sharex=True,
                                         gridspec_kw={"hspace": 0.12})
    top.plot(mean, linewidth=0.25, color="#444444")
    top.set_ylabel("traza media")
    top.set_title(f"Cifrado completo: traza media de {len(traces)} trazas")
    bottom.plot(first.max(axis=0), linewidth=0.5, color=_COLORS["correct"],
                label=r"ronda 1: HW(SBox($p \oplus k$))")
    bottom.plot(last.max(axis=0), linewidth=0.5, color=_COLORS["last"],
                label=r"ronda 10: HW($c \oplus K_{10}$)")
    bottom.set_ylabel(r"$\max_j |\rho|$")
    bottom.set_xlabel("muestra (= ciclo de reloj del STM32)")
    bottom.legend(loc="upper center", ncols=2, framealpha=0.9)
    bottom.set_ylim(0, 1)
    _tag(bottom)
    if png is not None:
        png.parent.mkdir(parents=True, exist_ok=True)
        figure.savefig(png, format="png", dpi=150, metadata={"Software": None})
    numbers = {
        "periodo_ronda_muestras": period,
        "ronda1_rho_gt_0_6": span(first),
        "ronda10_rho_gt_0_6": span(last),
        "fin_cifrado_aprox": end,
    }
    return _save(figure, out, "real-spa"), numbers


def figure_correlation(data: campana.Campaign, out: Path) -> Path:
    """CPA sobre la víctima sin proteger: candidato correcto frente al mejor falso."""
    _style()
    traces = data.traces.astype(np.float64)
    scores = np.abs(attacks.cpa_scores(traces, data.plaintexts))
    key = data.key.astype(np.intp)
    figure, (top, bottom) = plt.subplots(2, 1, figsize=(FIG_WIDTH, 3.6), sharex=True,
                                         gridspec_kw={"hspace": 0.12})
    top.plot(traces.mean(axis=0), linewidth=0.4, color="#444444")
    top.set_ylabel("traza media")
    top.set_title(f"CPA de la primera ronda con {len(traces)} trazas medidas")
    best_wrong = np.max([np.delete(scores[b], key[b], axis=0).max(axis=0) for b in range(16)], axis=0)
    bottom.plot(best_wrong, linewidth=0.5, color="#777777", zorder=3,
                label="mejor candidato falso (16 bytes)")
    for b in range(16):
        bottom.plot(scores[b, key[b]], linewidth=0.5, color=_COLORS["correct"], alpha=0.7,
                    label="candidato correcto (cada byte)" if b == 0 else None)
    bottom.set_ylabel(r"$|\rho|$")
    bottom.set_xlabel("muestra (= ciclo de reloj del STM32)")
    bottom.legend(loc="upper right", framealpha=0.9)
    _tag(bottom)
    return _save(figure, out, "real-cpa-correlacion")


def figure_candidates(data: campana.Campaign, out: Path) -> Path:
    """Pico de los 256 candidatos de cada byte."""
    _style()
    scores = np.abs(attacks.cpa_scores(data.traces.astype(np.float64), data.plaintexts))
    best = scores.max(axis=2)
    key = data.key.astype(np.intp)
    figure, axis = plt.subplots(figsize=(FIG_WIDTH, 2.4))
    for b in range(16):
        axis.scatter(np.full(255, b), np.delete(best[b], key[b]), s=3,
                     color=_COLORS["wrong"], label="255 candidatos falsos" if b == 0 else None)
        axis.scatter(b, best[b, key[b]], s=14, color=_COLORS["correct"],
                     label="candidato correcto" if b == 0 else None)
    axis.set_xticks(range(16))
    axis.set_ylim(0, 1)
    axis.set_xlabel("byte de la clave")
    axis.set_ylabel(r"$\max_t |\rho|$")
    axis.set_title(f"Pico de cada candidato ({len(data.traces)} trazas)")
    axis.legend(loc="upper right", ncols=2, framealpha=0.9)
    _tag(axis)
    return _save(figure, out, "real-candidatos")


def figure_rank(curve: dict, out: Path) -> Path:
    """Rango medio y tasa de éxito de la clave completa frente a N."""
    _style()
    steps = np.asarray(curve["pasos"])
    figure, (left, right) = plt.subplots(1, 2, figsize=(FIG_WIDTH, 2.9),
                                         gridspec_kw={"wspace": 0.3})
    left.plot(steps, curve["rango_medio"], marker="o", markersize=2.5,
              linewidth=1.0, color=_COLORS["correct"])
    left.set_xscale("log")
    left.set_yscale("log")
    left.axhline(1.0, color=_COLORS["theory"], linewidth=0.8, linestyle="--")
    left.set_xlabel("número de trazas $N$")
    left.set_ylabel("rango medio del byte correcto")
    left.set_title("Rango medio")
    right.plot(steps, curve["exito_clave_completa"], marker="s", markersize=2.5,
               linewidth=1.0, color=_COLORS["last"], label="clave completa")
    right.plot(steps, curve["fraccion_bytes_rango1"], linewidth=0.8, linestyle="--",
               color=_COLORS["correct"], label="bytes en rango 1")
    right.set_xscale("log")
    right.set_ylim(-0.04, 1.06)
    right.set_xlabel("número de trazas $N$")
    right.set_ylabel(f"fracción de {curve['ordenaciones']} ordenaciones")
    right.set_title("Éxito del ataque")
    right.legend(loc="lower right", framealpha=0.9)
    _tag(right)
    return _save(figure, out, "real-rango")


VARIANTS = [
    ("cm-base", "sin contramedida", _COLORS["correct"]),
    ("cm-barajado", "SubBytes barajado", _COLORS["accent"]),
    ("cm-retardos", "retardos aleatorios", _COLORS["theory"]),
]


def figure_countermeasures(datasets: dict, curves: dict, out: Path) -> Path:
    """Fase 6: éxito frente a N y correlación en el tiempo de las tres variantes."""
    _style()
    figure, (left, right) = plt.subplots(1, 2, figsize=(FIG_WIDTH, 2.9),
                                         gridspec_kw={"wspace": 0.3})
    for name, label, color in VARIANTS:
        if name not in curves:
            continue
        curve = curves[name]
        left.plot(curve["pasos"], curve["exito_clave_completa"], marker=".", markersize=3,
                  linewidth=1.0, color=color, label=label)
        data = datasets[name]
        sbox = np.asarray(aes.SBOX, dtype=np.uint8)
        n = min(len(data.traces), 1000)
        rho = _correct_correlation(data.traces[:n].astype(np.float64),
                                   sbox[data.plaintexts[:n] ^ data.key])
        right.plot(rho.max(axis=0), linewidth=0.5, color=color, alpha=0.85, label=label)
    left.set_xscale("log")
    left.set_ylim(-0.04, 1.06)
    left.set_xlabel("número de trazas $N$")
    left.set_ylabel("clave completa (fracción)")
    left.set_title("Éxito del CPA")
    left.legend(loc="upper left", framealpha=0.9, fontsize=7)
    right.set_xlabel("muestra")
    right.set_ylabel(r"$\max_j |\rho|$, clave correcta")
    right.set_title("Correlación con 1000 trazas")
    right.set_ylim(0, 1)
    _tag(right)
    return _save(figure, out, "real-contramedidas")


def export_web(data: campana.Campaign, web_dir: Path, n: int = 400,
               start: int = 440, stop: int = 740) -> Path:
    """Campaña en JSON para `<cpa-live src=...>` de la web.

    Las trazas van como códigos enteros del convertidor (0 a 255): la
    correlación no cambia con una transformación afín y el fichero ocupa la
    cuarta parte que con decimales.
    """
    codes = np.rint((data.traces[:n, start:stop].astype(np.float64) + 0.5) * 256).astype(int)
    payload = {
        "synthetic": False,
        "key": bytes(data.key).hex(),
        "plaintexts": [bytes(p).hex() for p in data.plaintexts[:n]],
        "traces": codes.tolist(),
        "meta": {
            "origen": CAMPAIGNS["tinyaes"],
            "muestras": [start, stop],
            "unidades": "códigos del ADC de 8 bits (0 a 255)",
            "instrumento": "ChipWhisperer-Nano, 7,5 MHz, una muestra por ciclo",
        },
    }
    web_dir.mkdir(parents=True, exist_ok=True)
    path = web_dir / "nano-tinyaes.json"
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    return path


# ──────────────────────────────── Programa ───────────────────────────────

def _geometric_steps(n: int, start: int = 5, count: int = 24) -> list[int]:
    return sorted({int(round(x)) for x in np.geomspace(start, n, count)})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--figuras", type=Path, default=REPO / "figuras")
    parser.add_argument("--resultados", type=Path, default=REPO / "analisis" / "salida" / "reales.json")
    parser.add_argument("--web", type=Path, default=REPO / "web" / "data",
                        help="dónde dejar el JSON y el PNG de la web")
    parser.add_argument("--ordenaciones", type=int, default=100)
    parser.add_argument("--rapido", action="store_true", help="10 ordenaciones")
    args = parser.parse_args(argv)
    orderings = 10 if args.rapido else args.ordenaciones

    results: dict = {"semilla": SEED, "campanas": CAMPAIGNS}
    written = []

    tiny = _load("tinyaes")
    results["tinyaes"] = attack_summary(tiny)
    written += [figure_correlation(tiny, args.figuras), figure_candidates(tiny, args.figuras)]
    curve = success_curve(tiny, _geometric_steps(300, 5, 26), orderings)
    results["tinyaes"]["curva"] = curve
    written.append(figure_rank(curve, args.figuras))

    path, numbers = figure_spa(_load("spa"), args.figuras, png=args.web / "real-spa.png")
    results["spa"] = numbers
    written += [path, args.web / "real-spa.png", export_web(tiny, args.web)]

    fixed = _load("fijo")
    std = fixed.traces.astype(np.float64).std(axis=0)
    results["ruido_texto_fijo"] = {
        "n_traces": int(len(fixed.traces)),
        "desviacion_mediana": round(float(np.median(std)), 5),
        "desviacion_p99": round(float(np.percentile(std, 99)), 5),
        "escalon_adc": 1 / 256,
        "desplazamientos": alignment_shifts(fixed.traces.astype(np.float64)),
    }
    raw = tiny.traces
    results["saturacion"] = {
        "minimo": float(raw.min()),
        "maximo": float(raw.max()),
        "muestras_en_el_minimo": int((raw <= -0.5).sum()),
        "muestras_totales": int(raw.size),
        "trazas_afectadas": int((raw <= -0.5).any(axis=1).sum()),
    }

    datasets, curves = {}, {}
    limits = {"cm-base": 300, "cm-barajado": 2000, "cm-retardos": None}
    for name, _, _ in VARIANTS:
        data = _load(name)
        if data is None:
            continue
        datasets[name] = data
        results[name] = attack_summary(data)
        top = limits[name] or len(data.traces)
        curves[name] = success_curve(data, _geometric_steps(min(top, len(data.traces)), 5, 26),
                                     orderings)
        results[name]["curva"] = curves[name]
    written.append(figure_countermeasures(datasets, curves, args.figuras))

    # La campaña completa con retardos no cabe en el repositorio: si está en
    # datos/brutos/, se ataca entera, que es la prueba de que el CPA ingenuo no
    # la recupera con 20 000 trazas, y se prueba a compensarla con ventanas.
    full = DATA / "brutos" / FULL_DELAY_CAMPAIGN
    if full.with_suffix(".npz").exists():
        whole = campana.load(full)
        whole.traces = whole.traces[:, :FULL_DELAY_SAMPLES]
        results["cm-retardos-completa"] = {
            "fuente": f"datos/brutos/{FULL_DELAY_CAMPAIGN} (no versionada), "
                      f"muestras 0 a {FULL_DELAY_SAMPLES}",
            **attack_summary(whole),
            "ventanas": delay_integration(whole),
        }

    args.resultados.parent.mkdir(parents=True, exist_ok=True)
    args.resultados.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n")
    for path in written:
        print(f"Figura: {path}")
    print(f"Resultados: {args.resultados}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
