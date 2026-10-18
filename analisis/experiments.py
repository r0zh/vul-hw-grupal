"""Experimentos de la fase 1: campaña de referencia y barrido de ruido.

Cada función devuelve diccionarios serializables (números de Python, listas y
cadenas), pensados para volcarse a JSON y para que las figuras y la memoria se
construyan a partir de esos mismos números, sin copiarlos a mano.

El atacante (`attacks.py`) nunca ve la clave. La clave real solo se usa aquí
para medir en qué puesto queda la hipótesis correcta y cuántos bits se
recuperan, que es lo que se reporta.
"""

from __future__ import annotations

import time

import numpy as np

from . import aes, attacks, simulate, statistics
from .config import ExperimentConfig, SimulationConfig, trace_checkpoints

#: Identificador de las trazas y los resultados de esta fase.
PHASE_LABEL = "fase 1 (simulación)"


def _jsonable(value):
    """Convierte arrays y tipos de numpy en algo que `json` sabe escribir."""
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, np.ndarray):
        return _jsonable(value.tolist())
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def analyse_campaign(campaign: simulate.SyntheticTraces,
                     config: SimulationConfig | None = None,
                     prefix: str = "") -> dict[str, object]:
    """Ejecuta CPA y DPA sobre una campaña y resume los resultados.

    Parámetros
    ----------
    campaign
        Campaña sintética.
    config
        Configuración de la simulación que la generó (para la metadata).
    prefix
        Prefijo de las claves del diccionario, para poder encadenar varias
        campañas en un mismo resultado.
    """
    started = time.perf_counter()
    key = campaign.key.astype(np.intp)
    results: dict[str, object] = {}

    for target, texts in (("first", campaign.plaintexts),
                          ("last", campaign.ciphertexts)):
        scores = attacks.cpa_scores(campaign.traces, texts, target=target)
        recovered = attacks.winning_key(scores)
        peaks = np.abs(scores).max(axis=2)
        correct_peaks = peaks[np.arange(16), key]
        ranks = statistics.ranks_of(scores, key)
        margins = [
            statistics.detection_margin(scores[byte], int(key[byte]))
            for byte in range(16)
        ]
        elapsed = time.perf_counter() - started
        results[f"{prefix}cpa_{target}"] = {
            "recovered_key_hex": recovered.tobytes().hex(),
            "correct_key_hex": campaign.key.tobytes().hex(),
            "bits_recovered": int((recovered == campaign.key).sum() * 8),
            "bytes_recovered": int((recovered == campaign.key).sum()),
            "mean_rank": float(ranks.mean()),
            "median_rank": float(np.median(ranks)),
            "worst_rank": int(ranks.max()),
            "mean_correct_peak": float(correct_peaks.mean()),
            "min_correct_peak": float(correct_peaks.min()),
            "mean_margin": float(np.mean(margins)),
            "rms_correlation": float(np.sqrt(np.mean(scores**2))),
            "seconds": float(elapsed),
        }
        results[f"{prefix}ranks_{target}"] = ranks.astype(int).tolist()
        results[f"{prefix}correct_peaks_{target}"] = correct_peaks.tolist()
    return results


def run_baseline(config: ExperimentConfig) -> dict[str, object]:
    """Campaña de referencia: recuperación de la clave y detalle del CPA.

    Genera `n_traces` trazas a la SNR de referencia, ataca con CPA la primera y
    la última ronda y guarda además la curva de escalado del candidato correcto
    frente al número de trazas.
    """
    simulation = config.simulation
    campaign = simulate.simulate_traces(simulation)
    results = analyse_campaign(campaign, simulation)

    # Escalado de la correlación del candidato correcto al crecer el número de
    # trazas. Se calcula sobre los mismos instantes de control del barrido.
    checkpoints = trace_checkpoints(simulation.n_traces)
    growth = _correlation_growth(campaign, checkpoints)
    results["growth"] = growth
    results["checkpoints"] = checkpoints
    results["baseline"] = {
        "n_traces": int(simulation.n_traces),
        "n_samples": int(simulation.n_samples),
        "snr": float(simulation.snr),
        "noise_sigma": float(campaign.noise_sigma),
        "signal_hw_std": float(campaign.signal_hw_std),
        "theoretical_ceiling": float(
            simulate.theoretical_correlation_ceiling(
                campaign.signal_hw_std, simulation.snr
            )
        ),
        "ceiling_with_offset": float(
            simulate.theoretical_correlation_ceiling(
                campaign.signal_hw_std, simulation.snr,
                trace_offset_std=simulation.trace_offset_std,
            )
        ),
        "first_round_centers": simulation.first_round_centers,
        "last_round_centers": simulation.last_round_centers,
    }
    return results


def _correlation_growth(campaign: simulate.SyntheticTraces,
                        checkpoints: list[int]) -> dict[str, object]:
    """Correlación del candidato correcto frente al número de trazas."""
    rms_values: list[float] = []
    peak_values: list[float] = []
    for count in checkpoints:
        scores = attacks.correct_hypothesis_correlation(
            campaign.traces[:count], campaign.plaintexts[:count], campaign.key
        )
        rms_values.append(float(statistics.rms(scores, axis=None)))
        peak_values.append(float(np.abs(scores).max()))
    return {
        "traces": [int(count) for count in checkpoints],
        "rms_first_round": rms_values,
        "peak_first_round": peak_values,
    }


def run_noise_sweep(config: ExperimentConfig) -> dict[str, object]:
    """Barrido de ruido: rango del candidato correcto y aciertos por SNR.

    Para cada nivel de SNR y cada ensayo se genera una clave y un conjunto de
    textos claros nuevos, se simulan `sweep_traces` trazas y se ejecuta el CPA
    completo en los instantes de control. Se guarda el rango del byte correcto
    de cada posición (lo que permite calcular el rango medio, la probabilidad
    de recuperar los 256 bits y el número de trazas que hacen falta), el pico
    del candidato correcto y la correlación eficaz (RMS).

    Es la parte cara del análisis: alrededor de un minuto por nivel de SNR en
    un equipo de sobremesa.
    """
    rng = np.random.default_rng(config.seed_for("noise_sweep"))
    checkpoints = config.trace_checkpoints
    levels = np.asarray(config.snr_levels, dtype=np.float64)

    ranks = np.full(
        (len(levels), config.sweep_trials, 16, len(checkpoints)), np.nan
    )
    final_peaks = np.full((len(levels), config.sweep_trials, 16), np.nan)
    recovered_traces = np.full((len(levels), config.sweep_trials), np.nan)

    for level_index, snr in enumerate(levels):
        for trial in range(config.sweep_trials):
            key = bytes(rng.integers(0, 256, size=16, dtype=np.uint8))
            texts = rng.integers(
                0, 256, size=(config.sweep_traces, 16), dtype=np.uint8
            )
            simulation = config.simulation.with_overrides(
                n_traces=config.sweep_traces, key=key, snr=float(snr)
            )
            campaign = simulate.simulate_from_texts(texts, simulation)
            hypotheses = attacks.hamming_weight(
                attacks.first_round_hypotheses(campaign.plaintexts)
            )                                        # (n, 16, 256)
            correct = campaign.key.astype(np.intp)

            for step, count in enumerate(checkpoints):
                scores = attacks._correlate_hypotheses(
                    hypotheses[:count], campaign.traces[:count]
                )
                ranks[level_index, trial, :, step] = statistics.ranks_of(
                    scores, correct
                )
                if count == checkpoints[-1]:
                    final_peaks[level_index, trial] = np.abs(scores).max(
                        axis=2
                    )[np.arange(16), correct]

            # Primer instante de control en el que los 16 bytes son correctos.
            all_correct = (ranks[level_index, trial] == 1).all(axis=0)
            if all_correct.any():
                recovered_traces[level_index, trial] = checkpoints[
                    int(np.argmax(all_correct))
                ]

    return {
        "snr_levels": levels.tolist(),
        "checkpoints": [int(count) for count in checkpoints],
        "trials": int(config.sweep_trials),
        "traces_per_trial": int(config.sweep_traces),
        "ranks": ranks,
        "final_peaks": final_peaks,
        "recovered_traces": recovered_traces,
    }


def summarise_sweep(sweep: dict[str, object]) -> dict[str, object]:
    """Resume un barrido de ruido: rango medio, aciertos y trazas necesarias."""
    levels = np.asarray(sweep["snr_levels"], dtype=np.float64)
    snr_values = levels
    checkpoints = np.asarray(sweep["checkpoints"], dtype=int)
    ranks = np.asarray(sweep["ranks"], dtype=np.float64)       # (L, T, 16, C)
    recovered = np.asarray(sweep["recovered_traces"], dtype=np.float64)
    trials = ranks.shape[1]

    summary: dict[str, object] = {
        "snr_levels": levels.tolist(),
        "checkpoints": checkpoints.tolist(),
        "trials": int(trials),
    }
    mean_rank = ranks.mean(axis=(1, 2))                        # (L, C)
    success = (ranks == 1).all(axis=2).mean(axis=1)            # (L, C)
    summary["mean_rank"] = mean_rank
    summary["success_rate"] = success
    summary["success_error"] = [
        [
            statistics.binomial_standard_error(float(rate), trials)
            for rate in row
        ]
        for row in success
    ]

    # Trazas necesarias para que la media de los ensayos recupere los 16 bytes,
    # y mediana del primer instante de control con la clave completa.
    traces_needed = np.full(len(levels), np.nan)
    intersection = np.full(len(levels), np.nan)
    for index in range(len(snr_values)):
        mask = success[index] >= 0.9
        if mask.any():
            traces_needed[index] = checkpoints[int(np.argmax(mask))]
        valid = recovered[index][~np.isnan(recovered[index])]
        if valid.size:
            intersection[index] = float(np.median(valid))
    summary["traces_for_90_percent"] = traces_needed
    summary["median_recovered_traces"] = intersection
    summary["mean_correct_peak"] = np.asarray(
        sweep["final_peaks"]
    ).mean(axis=(1, 2))
    return summary


def run_dpa_comparison(config: ExperimentConfig) -> dict[str, object]:
    """Compara DPA (partición por un bit) con CPA sobre la misma campaña.

    Prueba los ocho bits del valor intermedio, mide cuántos bytes acierta cada
    uno y se queda con el mejor para la figura. La comparación es deliberada:
    el DPA clásico usa una partición de un bit, así que aprovecha mucha menos
    información de la fuga que el modelo de peso de Hamming del CPA.
    """
    simulation = config.simulation.with_overrides(
        n_traces=config.dpa_traces, seed=config.seed_for("dpa")
    )
    campaign = simulate.simulate_traces(simulation)
    key = campaign.key
    correct = key.astype(np.intp)

    cpa = attacks.cpa_scores(campaign.traces, campaign.plaintexts)
    per_bit = []
    for bit in config.dpa_bits:
        scores = attacks.dpa_scores(campaign.traces, campaign.plaintexts, bit=bit)
        per_bit.append({
            "bit": int(bit),
            "bytes_recovered": int((attacks.winning_key(scores) == key).sum()),
            "bits_recovered": int((attacks.winning_key(scores) == key).sum() * 8),
            "mean_rank": float(statistics.ranks_of(scores, correct).mean()),
            "mean_margin": float(np.mean([
                statistics.detection_margin(scores[byte], int(correct[byte]))
                for byte in range(16)
            ])),
        })
    best = max(per_bit, key=lambda item: (item["bytes_recovered"], -item["bit"]))
    dpa = attacks.dpa_scores(
        campaign.traces, campaign.plaintexts, bit=int(best["bit"])
    )
    return {
        "n_traces": int(config.dpa_traces),
        "snr": float(simulation.snr),
        "bytes_recovered_cpa": int((attacks.winning_key(cpa) == key).sum()),
        "bytes_recovered_dpa": int(best["bytes_recovered"]),
        "best_bit": int(best["bit"]),
        "per_bit": per_bit,
        "cpa_correct_peak": float(np.abs(cpa).max()),
        "dpa_correct_peak": float(np.abs(dpa).max()),
        "cpa_mean_margin": float(np.mean([
            statistics.detection_margin(cpa[byte], int(correct[byte]))
            for byte in range(16)
        ])),
        "dpa_mean_margin": float(best["mean_margin"]),
        "correct_key_hex": key.tobytes().hex(),
        "recovered_key_cpa_hex": attacks.winning_key(cpa).tobytes().hex(),
        "recovered_key_dpa_hex": attacks.winning_key(dpa).tobytes().hex(),
    }


def run_all(config: ExperimentConfig | None = None) -> dict[str, object]:
    """Ejecuta la fase 1 completa y devuelve los resultados consolidados.

    Incluye la comprobación de los vectores de FIPS-197, la campaña de
    referencia, el barrido de ruido (con su resumen) y la comparación DPA/CPA.
    """
    if config is None:
        config = ExperimentConfig()
    started = time.perf_counter()

    fips = []
    for index, (key, plaintext, expected) in enumerate(aes.fips197_vectors(), start=1):
        ciphertext = aes.encrypt_block_with_key(plaintext, key)
        fips.append({
            "vector": index,
            "key_hex": key.hex(),
            "plaintext_hex": plaintext.hex(),
            "ciphertext_hex": ciphertext.hex(),
            "expected_hex": expected.hex(),
            "ok": ciphertext == expected,
        })

    baseline = run_baseline(config)
    sweep = run_noise_sweep(config)
    dpa = run_dpa_comparison(config)

    results = {
        "phase": PHASE_LABEL,
        "synthetic": True,
        "notice": (
            "Resultados de una SIMULACIÓN con el modelo de fuga del peso de "
            "Hamming y ruido gaussiano. No son medidas de ningún montaje real."
        ),
        "config": config.as_dict(),
        "fips197": fips,
        "baseline": baseline,
        "sweep": {
            "snr_levels": sweep["snr_levels"],
            "checkpoints": sweep["checkpoints"],
            "trials": sweep["trials"],
            "traces_per_trial": sweep["traces_per_trial"],
            "summary": _jsonable(summarise_sweep(sweep)),
        },
        "dpa_comparison": dpa,
        "seconds": float(time.perf_counter() - started),
    }
    results["sweep"]["mean_rank"] = _jsonable(
        np.asarray(results["sweep"]["summary"]["mean_rank"])
    )
    results["sweep"]["success_rate"] = _jsonable(
        np.asarray(results["sweep"]["summary"]["success_rate"])
    )
    return _jsonable(results)
