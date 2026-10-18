"""Generación de las figuras de la fase 1 en PDF vectorial.

Todas las figuras se guardan en `figuras/` y llevan la etiqueta «datos
simulados» en el propio PDF, porque **no son medidas de ningún montaje**: salen
de `analisis/simulate.py`. El estilo es común a todas (tamaño, fuentes, colores
y rejilla) para que la memoria y la presentación las puedan mezclar sin
retocar nada a mano.

Cada figura corresponde a un script distinto del análisis, y así se anota en el
comentario que acompaña a cada `\\includegraphics` de la memoria.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

# Matplotlib necesita un directorio de caché escribible. En entornos con el
# sistema de ficheros restringido (o sin HOME), se usa uno dentro del repo.
os.environ.setdefault(
    "MPLCONFIGDIR", str(Path(__file__).resolve().parent.parent / ".matplotlib")
)

import matplotlib

matplotlib.use("Agg")                      # sin ventana: se ejecuta en scripts

import matplotlib.pyplot as plt
import numpy as np

from . import attacks, simulate, statistics
from .config import ExperimentConfig

#: Ancho de las figuras en pulgadas (ajustado al ancho de caja de la memoria).
FIG_WIDTH = 6.3

#: Etiqueta que marca el origen simulado de todas las figuras.
SIMULATION_TAG = "Datos simulados (sin medidas reales)"

_COLORS = {
    "correct": "#1b6ca8",
    "wrong": "#b0b0b0",
    "last": "#2e8b57",
    "theory": "#d1495b",
    "accent": "#e07b39",
}


def _style() -> None:
    """Estilo común de las figuras (fuente sans, rejilla suave, sin LaTeX)."""
    plt.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["DejaVu Sans"],
        "mathtext.fontset": "dejavusans",
        "font.size": 9,
        "axes.titlesize": 10,
        "axes.labelsize": 9,
        "legend.fontsize": 8,
        "xtick.labelsize": 8,
        "ytick.labelsize": 8,
        "axes.grid": True,
        "grid.alpha": 0.25,
        "grid.linewidth": 0.5,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "figure.autolayout": False,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.02,
        "pdf.fonttype": 42,       # fuentes vectoriales, no rasterizadas
        "ps.fonttype": 42,
    })


def _tag(axis: plt.Axes) -> None:
    """Marca la figura como simulación, debajo del eje y centrada."""
    axis.text(
        0.5, -0.32, SIMULATION_TAG, transform=axis.transAxes,
        ha="center", va="top", fontsize=6.5, color="#555555",
    )


#: Fecha que se escribe en el PDF. Fija, para que la misma figura dé siempre el
#: mismo fichero: así se puede comprobar en la CI que las figuras del
#: repositorio coinciden con lo que producen los scripts.
PDF_DATE = "D:20260101000000+00'00'"


def _save(figure: plt.Figure, output_dir: Path, name: str) -> Path:
    """Guarda la figura como PDF vectorial en `figuras/`."""
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{name}.pdf"
    figure.savefig(path, format="pdf")
    plt.close(figure)
    _freeze_pdf_date(path)
    return path


def _freeze_pdf_date(path: Path) -> None:
    """Sustituye la fecha de creación que Matplotlib escribe en el PDF.

    Matplotlib pone la hora actual, de modo que dos ejecuciones idénticas
    producen ficheros distintos byte a byte. El contenido es el mismo, pero
    fijar la fecha permite comparar ficheros y detectar figuras desactualizadas.
    """
    content = path.read_bytes()
    frozen = re.sub(rb"/(CreationDate|ModDate)\s*\([^)]*\)",
                    rb"/\1 (" + PDF_DATE.encode() + rb")", content)
    if frozen != content:
        path.write_bytes(frozen)


def _span_regions(axis: plt.Axes, centers: list[int], color: str,
                  label: str | None = None) -> None:
    """Sombrea la ventana temporal de cada byte del estado."""
    for index, center in enumerate(centers):
        axis.axvspan(center - 0.5, center + 0.5, color=color, alpha=0.18,
                     linewidth=0, label=label if index == 0 else None)


# ───────────────────────── Figuras del análisis ──────────────────────────

def figure_synthetic_traces(campaign: simulate.SyntheticTraces,
                            output_dir: Path, n_show: int = 15) -> Path:
    """Figura 1: aspecto de las trazas sintéticas y dónde está la fuga.

    Arriba, varias trazas superpuestas con un desplazamiento vertical para
    verlas por separado; abajo, la media de la campaña, donde la fuga de cada
    byte del estado aparece como un escalón de la altura del peso de Hamming
    medio. Las bandas marcan las ventanas de la primera y la última ronda.
    """
    _style()
    config = campaign.config
    figure, (top, bottom) = plt.subplots(
        2, 1, figsize=(FIG_WIDTH, 4.5), sharex=True,
        gridspec_kw={"height_ratios": [1.4, 1.0], "hspace": 0.14},
    )
    samples = np.arange(campaign.traces.shape[1])
    offset_step = 9.0
    for index in range(min(n_show, campaign.traces.shape[0])):
        top.plot(samples, campaign.traces[index] + index * offset_step,
                 linewidth=0.6, color="#3d6b99")
    _span_regions(top, config.first_round_centers, _COLORS["correct"],
                  label="S-box de la 1.ª ronda")
    _span_regions(top, config.last_round_centers, _COLORS["last"],
                  label="S-box de la última ronda")
    top.set_ylabel("consumo + desplazamiento (u. a.)")
    top.set_title(f"{min(n_show, campaign.traces.shape[0])} trazas sintéticas, "
                  f"SNR = {config.snr:g}")
    top.legend(loc="upper right", framealpha=0.9)

    bottom.plot(samples, campaign.traces.mean(axis=0), linewidth=1.1,
                color="#333333", label="media de la campaña")
    _span_regions(bottom, config.first_round_centers, _COLORS["correct"])
    _span_regions(bottom, config.last_round_centers, _COLORS["last"])
    bottom.set_ylabel("consumo medio (u. a.)")
    bottom.set_xlabel("muestra dentro de la traza")
    bottom.set_xlim(0, campaign.traces.shape[1] - 1)
    bottom.legend(loc="upper right", framealpha=0.9)
    _tag(bottom)
    return _save(figure, output_dir, "sim-trazas")


def figure_correlation_over_time(
    traces: np.ndarray,
    plaintexts: np.ndarray,
    key: np.ndarray,
    centers: list[int],
    snr: float,
    n_traces: int,
    output_dir: Path,
) -> Path:
    """Figura 2: correlación del CPA frente al tiempo, byte a byte.

    Arriba se dibuja el candidato correcto de los 16 bytes y abajo el mejor
    candidato falso. La separación entre ambos es lo que decide el ataque.
    """
    _style()
    key = np.asarray(key, dtype=np.intp)
    scores = attacks.cpa_scores(traces, plaintexts)
    peaks = np.abs(scores)
    rows = np.arange(16)
    correct = peaks[rows, key]
    wrong = np.delete(peaks, key, axis=1).max(axis=1)

    figure, (top, bottom) = plt.subplots(
        2, 1, figsize=(FIG_WIDTH, 4.6), sharex=True,
        gridspec_kw={"hspace": 0.14},
    )
    samples = np.arange(scores.shape[2])
    for byte in range(16):
        top.plot(samples, correct[byte], linewidth=0.7,
                 color=_COLORS["correct"], alpha=0.7,
                 label="hipótesis correcta (16 bytes)" if byte == 0 else None)
    top.set_ylabel(r"$|\rho|$ del candidato correcto")
    top.set_title(f"CPA sobre {n_traces} trazas simuladas, SNR = {snr:g}")
    top.legend(loc="upper left", framealpha=0.9)

    for byte in range(16):
        bottom.plot(samples, wrong[byte], linewidth=0.7,
                    color=_COLORS["wrong"], alpha=0.9,
                    label="mejor candidato falso" if byte == 0 else None)
    bottom.plot(samples, correct.max(axis=0), linewidth=1.0,
                color=_COLORS["correct"], label="correcta (máximo)")
    _span_regions(bottom, centers, _COLORS["accent"])
    bottom.set_xlabel("muestra dentro de la traza")
    bottom.set_ylabel(r"$|\rho|$ máxima por instante")
    bottom.legend(loc="upper left", framealpha=0.9)
    bottom.set_xlim(0, scores.shape[2] - 1)
    _tag(bottom)
    return _save(figure, output_dir, "sim-cpa-correlacion")


def figure_rank_curve(results: dict, output_dir: Path,
                      level_index: int = 0) -> Path:
    """Figura 3: rango del candidato correcto frente al número de trazas.

    Izquierda, el rango medio de los 16 bytes de la clave; derecha, la
    proporción de ensayos en los que se recuperan los 256 bits. Las barras de
    error de la derecha son el error típico binomial del número de ensayos.
    """
    _style()
    summary = results["sweep"]["summary"]
    checkpoints = np.asarray(summary["checkpoints"], dtype=float)
    mean_rank = np.asarray(summary["mean_rank"], dtype=float)
    success = np.asarray(summary["success_rate"], dtype=float)
    errors = np.asarray(summary["success_error"], dtype=float)
    snr_levels = np.asarray(summary["snr_levels"], dtype=float)
    trials = int(summary["trials"])

    figure, (left, right) = plt.subplots(
        1, 2, figsize=(FIG_WIDTH, 2.9), gridspec_kw={"wspace": 0.3}
    )
    left.plot(checkpoints, mean_rank[level_index], marker="o", markersize=3,
              linewidth=1.0, color=_COLORS["correct"])
    left.set_xscale("log")
    left.set_yscale("log")
    left.set_xlabel("número de trazas $N$")
    left.set_ylabel("rango medio del byte correcto")
    left.set_title(f"Rango medio (SNR = {snr_levels[level_index]:g})")
    left.axhline(1.0, color=_COLORS["theory"], linewidth=0.8, linestyle="--")
    left.annotate("rango 1 = acierto", xy=(checkpoints[2], 1.0), xytext=(0, 6),
                  textcoords="offset points", fontsize=7,
                  color=_COLORS["theory"])

    right.errorbar(checkpoints, success[level_index], yerr=errors[level_index],
                   marker="s", markersize=3, linewidth=1.0, capsize=2,
                   color=_COLORS["last"])
    right.set_xscale("log")
    right.set_ylim(-0.04, 1.06)
    right.set_xlabel("número de trazas $N$")
    right.set_ylabel(f"ensayos con la clave completa (de {trials})")
    right.set_title("Clave completa recuperada")
    _tag(right)
    return _save(figure, output_dir, "sim-rango")


def figure_noise_scaling(results: dict, output_dir: Path) -> Path:
    """Figura 4: escalado de la correlación y coste en trazas frente al ruido.

    Izquierda: cota teórica de `|rho|` para cada nivel de ruido,
    `rho_max(N) = sqrt(N·SNR/(1+N·SNR))`, con el valor medido en la campaña de
    referencia marcado con un punto. Derecha: trazas necesarias medidas en el
    barrido para recuperar los 256 bits en el 90 % de los ensayos.
    """
    _style()
    summary = results["sweep"]["summary"]
    snr_levels = np.asarray(summary["snr_levels"], dtype=float)
    checkpoints = np.asarray(summary["checkpoints"], dtype=float)
    needed = np.asarray(summary["traces_for_90_percent"], dtype=float)
    baseline = results["baseline"]
    reference = baseline["baseline"]
    n_traces = int(results["sweep"]["traces_per_trial"])

    figure, (left, right) = plt.subplots(
        1, 2, figsize=(FIG_WIDTH, 2.9), gridspec_kw={"wspace": 0.32}
    )
    grid = np.logspace(0, np.log10(n_traces), 200)
    for level_index in range(0, len(snr_levels), 2):
        snr = snr_levels[level_index]
        curve = [
            simulate.theoretical_correlation_ceiling(1.0, snr * step)
            for step in grid
        ]
        left.plot(grid, curve, linewidth=1.0, label=f"SNR = {snr:g}")
    # Con el desplazamiento por traza de la campaña de referencia, la cota baja.
    with_offset = [
        simulate.theoretical_correlation_ceiling(
            1.0, reference["snr"] * step,
            trace_offset_std=reference["simulation"]["trace_offset_std"],
        )
        for step in grid
    ]
    left.plot(grid, with_offset, linewidth=1.0, linestyle="--",
              color="#666666",
              label="con el offset por traza de la referencia")
    left.plot(
        [reference["n_traces"]], [baseline["cpa_first"]["mean_correct_peak"]],
        marker="o", markersize=5, color=_COLORS["accent"], linestyle="none",
        label="medido en la campaña de referencia",
    )
    left.set_xscale("log")
    left.set_xlabel("número de trazas $N$")
    left.set_ylabel(r"cota de $|\rho|$ del candidato correcto")
    left.set_title("Correlación alcanzable frente a $N$")
    left.legend(loc="lower right", framealpha=0.9, fontsize=7)

    valid = ~np.isnan(needed)
    right.plot(snr_levels[valid], needed[valid], marker="o", markersize=4,
               linewidth=1.0, color=_COLORS["accent"])
    right.set_xscale("log")
    right.set_yscale("log")
    right.set_xlabel("SNR de la simulación")
    right.set_ylabel("trazas para el 90 % de aciertos")
    right.set_title("Coste en trazas frente al ruido")
    right.axhline(n_traces, color=_COLORS["theory"], linewidth=0.8,
                  linestyle="--")
    right.annotate(f"tope simulado ({n_traces})",
                   xy=(snr_levels[valid][0], n_traces), xytext=(0, 5),
                   textcoords="offset points", fontsize=7,
                   color=_COLORS["theory"])
    for level_index in np.flatnonzero(~valid):
        right.annotate("no llega", xy=(snr_levels[level_index], n_traces),
                       xytext=(0, -10), textcoords="offset points", fontsize=7,
                       ha="center", color=_COLORS["theory"])
    _tag(right)
    return _save(figure, output_dir, "sim-ruido")


def figure_dpa_vs_cpa(results: dict, output_dir: Path) -> Path:
    """Figura 5: comparación entre CPA (peso de Hamming) y DPA (un bit).

    Izquierda, bytes recuperados con la misma campaña por el DPA de cada bit y
    por el CPA; derecha, el puesto medio de la hipótesis correcta. El DPA usa
    una partición de un solo bit, así que aprovecha mucha menos información de
    la fuga que el modelo de peso de Hamming del CPA.
    """
    _style()
    comparison = results["dpa_comparison"]
    per_bit = comparison["per_bit"]
    bits = [item["bit"] for item in per_bit]
    recovered = [item["bytes_recovered"] for item in per_bit]
    ranks = [item["mean_rank"] for item in per_bit]

    figure, (left, right) = plt.subplots(
        1, 2, figsize=(FIG_WIDTH, 2.9), gridspec_kw={"wspace": 0.3}
    )
    left.bar([bit - 0.2 for bit in bits], recovered, width=0.4,
             color=_COLORS["accent"], label="DPA por bit")
    left.bar([bit + 0.2 for bit in bits],
             [comparison["bytes_recovered_cpa"]] * len(bits), width=0.4,
             color=_COLORS["correct"], label="CPA (peso de Hamming)")
    left.set_xlabel("bit del valor intermedio usado por el DPA")
    left.set_ylabel("bytes de clave recuperados (de 16)")
    left.set_ylim(0, 16.8)
    left.set_xticks(bits)
    left.set_title(f"{comparison['n_traces']} trazas, "
                   f"SNR = {comparison['snr']:g}")
    left.legend(loc="upper left", framealpha=0.9)

    right.plot(bits, ranks, marker="o", markersize=4, linewidth=1.0,
               color=_COLORS["accent"], label="DPA por bit")
    right.axhline(1.0, color=_COLORS["correct"], linewidth=1.0, linestyle="--",
                  label="CPA (rango 1 = acierto)")
    right.set_yscale("log")
    right.set_xlabel("bit del valor intermedio usado por el DPA")
    right.set_ylabel("rango medio del byte correcto")
    right.set_xticks(bits)
    right.set_title("Puesto de la hipótesis correcta")
    right.legend(loc="upper right", framealpha=0.9)
    _tag(right)
    return _save(figure, output_dir, "sim-dpa-cpa")


def figure_peaks_per_candidate(
    traces: np.ndarray,
    plaintexts: np.ndarray,
    key: np.ndarray,
    output_dir: Path,
) -> Path:
    """Figura 6: pico de correlación de los 256 candidatos, byte a byte.

    Es la comprobación de que el candidato correcto no solo gana, sino que lo
    hace con un margen visible sobre los 255 restantes.
    """
    _style()
    key = np.asarray(key, dtype=np.intp)
    scores = attacks.cpa_scores(traces, plaintexts)
    peaks = np.abs(scores).max(axis=2)                      # (16, 256)
    order = np.argsort(-peaks, axis=1)
    mean_curve = np.sort(peaks, axis=1)[:, ::-1].mean(axis=0)

    figure, (left, right) = plt.subplots(
        1, 2, figsize=(FIG_WIDTH, 2.9), gridspec_kw={"wspace": 0.34}
    )
    for byte in range(16):
        ranked = peaks[byte, order[byte]]
        left.plot(np.arange(256), ranked, linewidth=0.8,
                  color=_COLORS["wrong"], alpha=0.8,
                  label="un byte de clave" if byte == 0 else None)
    left.plot(np.arange(256), mean_curve, linewidth=1.3, color="#444444",
              label="media de los 16 bytes")
    left.annotate("candidato correcto", xy=(1.0, mean_curve[1]),
                  xytext=(28, 0), textcoords="offset points", fontsize=7,
                  arrowprops={"arrowstyle": "->", "linewidth": 0.6},
                  color=_COLORS["correct"])
    left.set_xlabel("puesto del candidato (1 = ganador)")
    left.set_ylabel(r"$|\rho|$ máxima")
    left.set_title("Pico de los 256 candidatos")
    left.legend(loc="upper right", framealpha=0.9)

    positions = np.array([
        int(np.flatnonzero(order[byte] == key[byte])[0]) for byte in range(16)
    ])
    right.stem(np.arange(16), positions, basefmt=" ")
    right.set_xlabel("byte de la clave")
    right.set_ylabel("puesto del candidato correcto")
    right.set_xticks(np.arange(16))
    right.set_ylim(0, max(3.0, positions.max() + 0.6))
    right.set_title("Puesto del byte correcto")
    _tag(right)
    return _save(figure, output_dir, "sim-candidatos")


def build_analysis(config: ExperimentConfig | None = None,
                   output_dir: str | Path = "figuras",
                   results_path: str | Path | None = "analisis/salida/resultados.json"):
    """Ejecuta la fase 1 y regenera todas las figuras.

    Devuelve `(lista de PDF escritos, resultados)`. Es lo que llama
    `analisis/run_all.py`.
    """
    from .experiments import run_all

    experiment = config or ExperimentConfig()
    output_dir = Path(output_dir)
    results = run_all(experiment)
    if results_path is not None:
        results_path = Path(results_path)
        results_path.parent.mkdir(parents=True, exist_ok=True)
        results_path.write_text(
            json.dumps(results, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    campaign = simulate.simulate_traces(experiment.simulation)
    written = [
        figure_synthetic_traces(campaign, output_dir),
        figure_correlation_over_time(
            campaign.traces, campaign.plaintexts, campaign.key,
            experiment.simulation.first_round_centers,
            experiment.simulation.snr, campaign.traces.shape[0], output_dir,
        ),
        figure_rank_curve(results, output_dir),
        figure_noise_scaling(results, output_dir),
        figure_dpa_vs_cpa(results, output_dir),
        figure_peaks_per_candidate(
            campaign.traces, campaign.plaintexts, campaign.key, output_dir
        ),
    ]
    return written, results
