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
    """Ejecuta el CPA sobre la primera y la última ronda y resume el resultado.

    La primera ronda recupera la clave maestra directamente. La última
    recupera la subclave 10, y de ella se obtiene la clave maestra invirtiendo
    la expansión de clave.

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
    round_key_10 = aes.key_expansion_batch(campaign.key)[10]
    results: dict[str, object] = {}

    for target, texts, correct_key in (
        ("first", campaign.plaintexts, campaign.key),
        ("last", campaign.ciphertexts, round_key_10),
    ):
        key = correct_key.astype(np.intp)
        scores = attacks.cpa_scores(campaign.traces, texts, target=target)
        recovered = attacks.winning_key(scores)
        peaks = np.abs(scores).max(axis=2)                    # (16, 256)
        correct_peaks = peaks[np.arange(16), key]
        wrong_peaks = np.where(np.arange(256) == key[:, None], 0.0, peaks)
        best_wrong = wrong_peaks.max(axis=1)
        ranks = statistics.ranks_of(scores, key)
        margins = correct_peaks - best_wrong
        elapsed = time.perf_counter() - started
        summary = {
            "recovered_key_hex": recovered.tobytes().hex(),
            "correct_key_hex": correct_key.tobytes().hex(),
            "bits_recovered": int((recovered == correct_key).sum() * 8),
            "bytes_recovered": int((recovered == correct_key).sum()),
            "mean_rank": float(ranks.mean()),
            "median_rank": float(np.median(ranks)),
            "worst_rank": int(ranks.max()),
            "mean_correct_peak": float(correct_peaks.mean()),
            "min_correct_peak": float(correct_peaks.min()),
            "mean_best_wrong_peak": float(best_wrong.mean()),
            "max_wrong_peak": float(best_wrong.max()),
            "mean_margin": float(margins.mean()),
            "rms_correlation": float(np.sqrt(np.mean(scores**2))),
            "seconds": float(elapsed),
        }
        if target == "last":
            # Lo recuperado es la subclave 10: la clave maestra sale de
            # invertir la expansión de clave.
            master = aes.invert_key_schedule(recovered.tobytes())
            summary["master_key_from_round_key_hex"] = master.hex()
            summary["master_key_recovered"] = master == campaign.key.tobytes()
        results[f"{prefix}cpa_{target}"] = summary
        results[f"{prefix}ranks_{target}"] = ranks.astype(int).tolist()
        results[f"{prefix}correct_peaks_{target}"] = correct_peaks.tolist()
    return results


def run_baseline(config: ExperimentConfig) -> dict[str, object]:
    """Campaña de referencia: recuperación de la clave y detalle del CPA.

    Genera `n_traces` trazas a la SNR de referencia, ataca con CPA la primera y
    la última ronda y guarda además cómo evolucionan, al crecer el número de
    trazas, el pico del candidato correcto y el del mejor candidato falso.
    """
    simulation = config.simulation
    campaign = simulate.simulate_traces(simulation)
    results = analyse_campaign(campaign, simulation)

    checkpoints = trace_checkpoints(simulation.n_traces)
    results["growth"] = _peak_growth(campaign, checkpoints)
    results["checkpoints"] = checkpoints
    results["baseline"] = {
        "simulation": simulation.as_dict(),
        "n_traces": int(simulation.n_traces),
        "n_samples": int(simulation.n_samples),
        "snr": float(simulation.snr),
        "noise_sigma": float(campaign.noise_sigma),
        "signal_hw_std": float(campaign.signal_hw_std),
        "theoretical_ceiling": simulate.theoretical_correlation_ceiling(
            simulation.snr
        ),
        "first_round_centers": simulation.first_round_centers,
        "last_round_centers": simulation.last_round_centers,
    }
    return results


def _peak_growth(campaign: simulate.SyntheticTraces,
                 checkpoints: list[int]) -> dict[str, object]:
    """Pico del candidato correcto y del mejor falso frente al número de trazas.

    Es la curva que explica el CPA: el pico del correcto se queda en torno a
    su valor teórico, mientras que el del mejor falso baja como 1/√N. La clave
    sale cuando el segundo cae por debajo del primero.
    """
    key = campaign.key.astype(np.intp)
    correct_values: list[float] = []
    wrong_values: list[float] = []
    for count in checkpoints:
        scores = attacks.cpa_scores(campaign.traces[:count],
                                    campaign.plaintexts[:count])
        peaks = np.abs(scores).max(axis=2)
        correct_values.append(float(peaks[np.arange(16), key].mean()))
        wrong = np.where(np.arange(256) == key[:, None], 0.0, peaks)
        wrong_values.append(float(wrong.max(axis=1).mean()))
    return {
        "traces": [int(count) for count in checkpoints],
        "mean_correct_peak": correct_values,
        "mean_best_wrong_peak": wrong_values,
    }


def run_noise_sweep(config: ExperimentConfig) -> dict[str, object]:
    """Barrido de ruido: rango del candidato correcto y aciertos por SNR.

    Para cada nivel de SNR y cada ensayo se genera una clave y un conjunto de
    textos claros nuevos, se simulan `sweep_traces` trazas y se ejecuta el CPA
    completo en los instantes de control. Se guarda el rango del byte correcto
    de cada posición (lo que permite calcular el rango medio, la probabilidad
    de recuperar los 128 bits y el número de trazas que hacen falta), el pico
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

    # Primer instante de control en el que al menos el 90 % de los ensayos
    # tiene la clave completa, y mediana del primer instante con la clave
    # completa de cada ensayo. Los ensayos que no la recuperan cuentan como
    # «más que el tope»: si son la mitad o más, la mediana queda indefinida.
    traces_needed = np.full(len(levels), np.nan)
    intersection = np.full(len(levels), np.nan)
    for index in range(len(snr_values)):
        mask = success[index] >= 0.9
        if mask.any():
            traces_needed[index] = checkpoints[int(np.argmax(mask))]
        first = np.where(np.isnan(recovered[index]), np.inf, recovered[index])
        median = float(np.median(first))
        if np.isfinite(median):
            intersection[index] = median
    summary["traces_for_90_percent"] = traces_needed
    summary["median_recovered_traces"] = intersection
    summary["mean_correct_peak"] = np.asarray(
        sweep["final_peaks"]
    ).mean(axis=(1, 2))
    return summary


def run_dpa_comparison(config: ExperimentConfig) -> dict[str, object]:
    """Compara DPA (partición por un bit) con CPA sobre la misma campaña.

    Prueba los ocho bits del valor intermedio y mide cuántos bytes acierta
    cada uno y en qué puesto queda el byte correcto. El «mejor bit» se elige
    conociendo la clave, lo que favorece al DPA: un atacante real no sabría
    cuál escoger. El margen del DPA se guarda en unidades de la traza
    (diferencia de medias) y no se puede comparar con el del CPA, que es una
    correlación.
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
            "mean_margin_trace_units": float(np.mean([
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
        "cpa_mean_rank": float(statistics.ranks_of(cpa, correct).mean()),
        "dpa_mean_rank": float(best["mean_rank"]),
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
    for index, (key, plaintext, expected) in enumerate(aes.aes_test_vectors(), start=1):
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
        "aes_vectors": fips,
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
