"""Regenera todos los resultados y las figuras de la fase 1.

    uv run python -m analisis.run_all            # análisis completo
    uv run python -m analisis.run_all --fast     # versión rápida de humo
    uv run python -m analisis.run_all --no-sweep # sin barrido de ruido

Todo lo que produce son **datos simulados** con el modelo de fuga del peso de
Hamming: no hay ninguna medida real todavía (fase 2 y siguientes). La semilla
está fijada en `analisis/config.py`, así que dos ejecuciones con los mismos
parámetros dan exactamente el mismo resultado.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from . import figures
from .config import ExperimentConfig, SimulationConfig


def _fast_config() -> ExperimentConfig:
    """Configuración reducida para comprobar que todo funciona."""
    simulation = SimulationConfig(n_traces=600, snr=0.1)
    return ExperimentConfig(
        simulation=simulation,
        snr_levels=(1.0, 0.2, 0.05),
        figure_snr_levels=(1.0, 0.2, 0.05),
        sweep_traces=600,
        sweep_trials=6,
        dpa_traces=600,
    )


def _no_sweep_config() -> ExperimentConfig:
    """Configuración completa salvo el barrido de ruido (mucho más rápida).

    El barrido se sustituye por un único nivel de SNR con pocos ensayos, de
    modo que las figuras que dependen de él se generan igualmente pero con
    menos estadística. El JSON de resultados lo indica en `config`.
    """
    full = ExperimentConfig()
    return ExperimentConfig(
        simulation=full.simulation,
        snr_levels=(full.simulation.snr,),
        figure_snr_levels=(full.simulation.snr,),
        sweep_traces=full.sweep_traces,
        sweep_trials=4,
        dpa_traces=full.dpa_traces,
    )


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada de la línea de órdenes."""
    parser = argparse.ArgumentParser(
        description="Regenera los resultados y las figuras de la fase 1 "
                    "(simulación).",
    )
    parser.add_argument(
        "--figuras", default="figuras", type=Path,
        help="directorio de salida de las figuras (por defecto: figuras/)",
    )
    parser.add_argument(
        "--resultados", default="analisis/salida/resultados.json", type=Path,
        help="ruta del JSON de resultados (por defecto: "
             "analisis/salida/resultados.json)",
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--fast", action="store_true",
        help="ejecución reducida, para comprobar que todo funciona",
    )
    group.add_argument(
        "--no-sweep", action="store_true",
        help="omite el barrido de ruido (figuras con menos estadística)",
    )
    args = parser.parse_args(argv)

    if args.fast:
        config = _fast_config()
    elif args.no_sweep:
        config = _no_sweep_config()
    else:
        config = ExperimentConfig()

    started = time.perf_counter()
    written, results = figures.build_analysis(
        config, output_dir=args.figuras, results_path=args.resultados
    )
    elapsed = time.perf_counter() - started

    print("Fase 1 — análisis CPA/DPA sobre trazas simuladas")
    print(f"  simulación: {config.simulation.n_traces} trazas, "
          f"{config.simulation.n_samples} muestras, "
          f"SNR = {config.simulation.snr:g}, semilla {config.simulation.seed}")
    print(f"  barrido: {len(config.snr_levels)} niveles de SNR × "
          f"{config.sweep_trials} ensayos × {config.sweep_traces} trazas")
    baseline = results["baseline"]["cpa_first"]
    print(f"  CPA (1.ª ronda): {baseline['bytes_recovered']}/16 bytes, "
          f"{baseline['bits_recovered']}/128 bits; "
          f"pico medio {baseline['mean_correct_peak']:.3f}")
    print(f"  resultados: {args.resultados}")
    for path in written:
        print(f"  figura: {path}")
    print(f"  tiempo total: {elapsed:.1f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
