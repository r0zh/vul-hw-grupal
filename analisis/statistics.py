"""Utilidades estadísticas comunes al CPA y al DPA.

Todas las funciones trabajan con `numpy` y con arrays de forma
`(n_candidates, n_samples)`, donde las filas son las hipótesis de un byte de
clave. Identificadores en inglés y comentarios en español, como el resto del
repositorio.
"""

from __future__ import annotations

import numpy as np

#: Número de trazas por bloque al calcular correlaciones. `None` significa
#: usar todas las trazas de una vez, que es lo que hace falta cuando hay que
#: comparar la correlación de subconjuntos distintos: la correlación de
#: Pearson no es lineal y promediar bloques no da el mismo número.
CHUNK_SIZE: int | None = None


def pearson_correlation(signal: np.ndarray, traces: np.ndarray) -> np.ndarray:
    """Correlación de Pearson entre cada columna de `signal` y cada traza.

    Es el `corr(HW(SBox(p_i ^ k)), T_i[t])` de AGENTS.md, calculado para todas
    las hipótesis de un byte a la vez.

    Parámetros
    ----------
    signal
        Array `(n, n_candidates)` con la fuga predicha para cada hipótesis.
    traces
        Array `(n, n_samples)` con el consumo medido o simulado.

    Devuelve
    --------
    Array `(n_candidates, n_samples)` con el coeficiente de correlación.
    Las hipótesis constantes producen cero (no aportan información) en lugar
    de `nan`.
    """
    signal = np.asarray(signal, dtype=np.float64)
    traces = np.asarray(traces, dtype=np.float64)
    if signal.ndim == 1:
        signal = signal[:, None]                # una sola hipótesis
    if signal.shape[0] != traces.shape[0]:
        raise ValueError("signal y traces deben tener el mismo número de filas")

    n = signal.shape[0]
    centered_signal = signal - signal.mean(axis=0, keepdims=True)
    # Se deja la fuga como (candidatos, [niveles], trazas) para que el producto
    # matricial funcione tanto si `signal` es 2-D `(n, candidatos)` como 3-D
    # `(n, candidatos, niveles)`.
    if centered_signal.ndim == 2:
        prediction = centered_signal.T                      # (candidatos, n)
    else:
        prediction = np.transpose(centered_signal, (1, 2, 0))
    energy = np.sqrt((centered_signal**2).sum(axis=0))      # (candidatos, [niveles])
    signal_energy = energy[..., None]

    step = CHUNK_SIZE if CHUNK_SIZE else n
    blocks = []
    for start in range(0, n, step):
        block = traces[start:start + step]
        centered_block = block - block.mean(axis=0, keepdims=True)
        if centered_signal.ndim == 2:
            numerator = prediction[:, start:start + step] @ centered_block
        else:
            numerator = prediction[..., start:start + step] @ centered_block
        trace_energy = np.sqrt(np.sum(centered_block**2, axis=0))[None, :]
        with np.errstate(divide="ignore", invalid="ignore"):
            blocks.append(numerator / (signal_energy * trace_energy))

    correlation = np.concatenate(blocks, axis=1) if len(blocks) > 1 else blocks[0]
    return np.nan_to_num(correlation, nan=0.0, posinf=0.0, neginf=0.0)


def peak_absolute(score: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Máximo del valor absoluto de `score` (n_candidates, n_samples).

    Devuelve `(pico, instante)` para cada hipótesis. Es la métrica con la que
    se elige el candidato ganador según AGENTS.md: `max_t |rho(k, t)|`.
    """
    index = np.argmax(np.abs(score), axis=1)
    rows = np.arange(score.shape[0])
    return np.abs(score[rows, index]), index


def rank_of(score: np.ndarray, correct: int) -> int:
    """Posición (1 = mejor) de la hipótesis correcta según `|score|`."""
    peaks, _ = peak_absolute(score)
    order = np.argsort(-peaks, kind="stable")
    return int(np.flatnonzero(order == correct)[0]) + 1


def ranks_of(score: np.ndarray, correct_indices: np.ndarray) -> np.ndarray:
    """Rango de la hipótesis correcta en cada byte (vectorizado).

    `score` tiene forma `(n_bytes, n_candidates, n_samples)` y
    `correct_indices[j]` es la hipótesis correcta del byte `j`. Devuelve un
    array `(n_bytes,)` con los rangos (1 = mejor).
    """
    peaks, _ = peak_absolute(score.reshape(-1, score.shape[-1]))
    peaks = peaks.reshape(score.shape[0], score.shape[1])
    order = np.argsort(-peaks, axis=1, kind="stable")
    positions = np.argmax(order == correct_indices[:, None], axis=1)
    return positions + 1


def detection_margin(score: np.ndarray, correct: int) -> float:
    """Ventaja del candidato correcto sobre el mejor candidato falso.

    Es una medida de confianza del atacante: un valor negativo o muy pequeño
    significa que el ataque no distingue la clave correcta con esas trazas.
    """
    peaks, _ = peak_absolute(score)
    others = np.delete(peaks, correct)
    if others.size == 0:
        return float("nan")
    return float(peaks[correct] - others.max())


def rms(values: np.ndarray, axis: int | None = 0) -> np.ndarray | float:
    """Raíz de la media de los cuadrados.

    Con `axis=None` devuelve un `float`; es la «correlación eficaz» de una
    matriz de puntuaciones completa (RMS de `|rho|` sobre candidatos e
    instantes), que crece con el número de trazas y sirve para ver el efecto
    del ruido.
    """
    values = np.asarray(values, dtype=np.float64)
    if axis is None:
        return float(np.sqrt(np.mean(values**2)))
    return np.sqrt(np.mean(values**2, axis=axis))


def binomial_standard_error(probability: float, n: int) -> float:
    """Error típico de una proporción estimada con `n` ensayos."""
    if n <= 0:
        return float("nan")
    return float(np.sqrt(max(probability * (1.0 - probability), 0.0) / n))
