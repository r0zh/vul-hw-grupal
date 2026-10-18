"""Ataques CPA y DPA sobre trazas de consumo.

Este módulo es el **atacante**: solo recibe las trazas, los textos claros, los
criptogramas y el número de muestras. No ve la clave en ningún momento; la
clave real solo se usa en los experimentos de `experiments.py` para medir en
qué puesto queda la hipótesis correcta.

Convenciones:

- Las funciones devuelven `(16, 256, n_samples)`: byte de clave, candidato e
  instante. La matriz de puntuaciones de un byte suelto es
  `(n_candidates, n_samples)`.
- `0x00..0xff` es el orden de las hipótesis, así que la hipótesis correcta del
  byte `j` es `key[j]`.

Referencias: CPA según Brier et al. [brier2004cpa]; DPA de partición por un bit
según Kocher et al. [kocher1999dpa] y el capítulo 6 de Mangard et al.
[mangard2007power].
"""

from __future__ import annotations

import numpy as np

from . import aes
from .simulate import BIT_COUNT
from .statistics import pearson_correlation

#: Número de hipótesis por byte de clave.
N_CANDIDATES: int = 256

#: Número de bytes de la clave.
N_KEY_BYTES: int = 16

#: Candidatos procesados en cada llamada a la correlación. No cambia el
#: resultado; solo acota la memoria de los temporales intermedios.
CANDIDATE_BLOCK: int = 64


def _hypothesis_tables() -> tuple[np.ndarray, np.ndarray]:
    """Tablas de consulta con las 4096 hipótesis, indexadas por el texto.

    Cada tabla tiene forma `(16, 256, 256)` y se indexa así:

        table[byte][valor_de_entrada][candidato_de_clave] = valor intermedio

    que es `SBox(entrada ^ k)` para la primera ronda e `InvSBox(c ^ k)` para la
    última. Indexar con un array `(n, 16)` de textos devuelve `(n, 16, 256)`,
    es decir, todos los candidatos de todos los bytes sin bucles en Python.
    """
    box = np.asarray(aes.SBOX, dtype=np.uint8)
    inv_box = np.asarray(aes.INV_SBOX, dtype=np.uint8)
    inputs = np.arange(256, dtype=np.uint8)
    keys = np.arange(256, dtype=np.uint8)[:, None]           # (candidato, 1)
    first = box[inputs[None, :] ^ keys]                      # (candidato, entrada)
    last = inv_box[inputs[None, :] ^ keys]
    # Se replica para los 16 bytes del estado y se deja (byte, entrada, candidato).
    return (np.tile(first, (16, 1, 1)), np.tile(last, (16, 1, 1)))


_FIRST_TABLE, _LAST_TABLE = _hypothesis_tables()


def first_round_hypotheses(plaintexts: np.ndarray) -> np.ndarray:
    """`SBox(p_j ^ k)` para todos los candidatos: forma `(n, 16, 256)`.

    El eje 1 es el byte del estado y el eje 2, el candidato de clave.
    """
    plaintexts = np.asarray(plaintexts, dtype=np.uint8)
    return _FIRST_TABLE[np.arange(16)[None, :], plaintexts, :]


def last_round_hypotheses(ciphertexts: np.ndarray) -> np.ndarray:
    """`InvSBox(c_j ^ k)` para todos los candidatos: forma `(n, 16, 256)`."""
    ciphertexts = np.asarray(ciphertexts, dtype=np.uint8)
    return _LAST_TABLE[np.arange(16)[None, :], ciphertexts, :]


def _first_round_candidates(plaintexts: np.ndarray) -> np.ndarray:
    """`(n, 256, 16)`: valor intermedio de la primera ronda por candidato.

    Es la vista transpuesta de `first_round_hypotheses`, para las rutinas que
    trabajan byte a byte.
    """
    return np.transpose(first_round_hypotheses(plaintexts), (0, 2, 1))


def _last_round_candidates(ciphertexts: np.ndarray) -> np.ndarray:
    """`(n, 256, 16)`: entrada de la S-box de la última ronda por candidato."""
    return np.transpose(last_round_hypotheses(ciphertexts), (0, 2, 1))


def hamming_weight(values: np.ndarray) -> np.ndarray:
    """Peso de Hamming de un array de bytes, conservando la forma.

    Vale tanto para los valores intermedios reales como para las hipótesis de
    cualquier forma `(n, ...)`.
    """
    return BIT_COUNT[values]


def _correlate_hypotheses(levels: np.ndarray, traces: np.ndarray) -> np.ndarray:
    """Correlación de todas las hipótesis de todos los bytes de clave.

    Parámetros
    ----------
    levels
        `(n, 16, 256)` con la fuga predicha (peso de Hamming o un bit). Se
        indexa como `levels[trazas, byte, candidato]`.
    traces
        `(n, n_samples)`.

    Devuelve
    --------
    `(16, 256, n_samples)`. El bucle sobre bytes y bloques de candidatos solo
    reparte el trabajo entre llamadas a `pearson_correlation`, así que el
    resultado es idéntico al de calcularlo todo de una vez, pero sin crear
    copias grandes de la fuga.
    """
    n, n_bytes, n_candidates = levels.shape
    scores = np.empty((n_bytes, n_candidates, traces.shape[1]), dtype=np.float64)
    for byte in range(n_bytes):
        level = levels[:, byte, :]
        for start in range(0, n_candidates, CANDIDATE_BLOCK):
            stop = min(start + CANDIDATE_BLOCK, n_candidates)
            signal = level[:, start:stop].astype(np.float64)
            scores[byte, start:stop] = pearson_correlation(signal, traces)
    return scores


def cpa_scores(
    traces: np.ndarray,
    texts: np.ndarray,
    target: str = "first",
) -> np.ndarray:
    """CPA sobre la salida de la S-box de la primera o de la última ronda.

    Calcula `corr(HW(SBox(p_i ^ k)), T_i[t])` para los 256 candidatos de cada
    uno de los 16 bytes, que es la fórmula de AGENTS.md.

    Parámetros
    ----------
    traces
        `(n, n_samples)` con el consumo.
    texts
        `(n, 16)` con los textos claros (`target="first"`) o los criptogramas
        (`target="last"`).
    target
        `"first"` para la primera ronda, `"last"` para la última.

    Devuelve
    --------
    `(16, 256, n_samples)` con la correlación de cada hipótesis. Con
    `target="last"` los candidatos son bytes de la subclave 10, en el orden
    del criptograma; la clave maestra se obtiene con
    `aes.invert_key_schedule`.
    """
    traces = np.asarray(traces, dtype=np.float64)
    if target == "first":
        hypotheses = first_round_hypotheses(texts)
    elif target == "last":
        hypotheses = last_round_hypotheses(texts)
    else:
        raise ValueError("target debe ser 'first' o 'last'")
    levels = hamming_weight(hypotheses)            # (n, 16, 256)
    return _correlate_hypotheses(levels, traces)


def dpa_scores(
    traces: np.ndarray,
    texts: np.ndarray,
    target: str = "first",
    bit: int = 0,
) -> np.ndarray:
    """DPA de diferencia de medias con partición por un bit del intermedio.

    Para cada candidato `k`, las trazas se separan en dos grupos según el bit
    `bit` de `SBox(p_j ^ k)` (o de `InvSBox(c_j ^ k)` en la última ronda) y se
    calcula la diferencia de las medias de consumo. Es el ataque original de
    Kocher et al. [kocher1999dpa], usado aquí como comparación con el CPA.

    Devuelve `(16, 256, n_samples)` con la diferencia de medias, en las mismas
    unidades que las trazas (no es un coeficiente de correlación).
    """
    traces = np.asarray(traces, dtype=np.float64)
    if target == "first":
        candidates = _first_round_candidates(texts)
    elif target == "last":
        candidates = _last_round_candidates(texts)
    else:
        raise ValueError("target debe ser 'first' o 'last'")
    if not 0 <= bit <= 7:
        raise ValueError("el bit debe estar entre 0 y 7")

    bits = (candidates >> bit) & np.uint8(1)                 # (n, 256, 16)
    n_bytes = bits.shape[2]
    scores = np.zeros((n_bytes, N_CANDIDATES, traces.shape[1]), dtype=np.float64)
    n = traces.shape[0]
    for byte in range(n_bytes):
        indicator = bits[:, :, byte].astype(np.float64)      # (n, 256)
        count_ones = indicator.sum(axis=0)
        count_zeros = n - count_ones
        sums = indicator.T @ traces                          # (256, n_samples)
        with np.errstate(divide="ignore", invalid="ignore"):
            mean_ones = sums / count_ones[:, None]
            mean_zeros = (traces.sum(axis=0)[None, :] - sums) / count_zeros[:, None]
        difference = mean_ones - mean_zeros
        scores[byte] = np.nan_to_num(difference, nan=0.0)
    return scores


def correct_hypothesis_correlation(
    traces: np.ndarray,
    texts: np.ndarray,
    key: np.ndarray,
    target: str = "first",
) -> np.ndarray:
    """Correlación de la hipótesis correcta, sin probar los 256 candidatos.

    Devuelve `(16, n_samples)` con `corr(HW(SBox(p_i ^ k_j)), T_i[t])` para el
    byte correcto `k_j` de cada posición. Se usa en los barridos, donde lo que
    interesa es cómo crece la correlación del candidato bueno con el número de
    trazas y no qué candidato gana (eso ya lo mide el CPA completo).

    La clave se recibe como argumento, así que esta función **sí conoce la
    clave**: es una herramienta de medida, no un ataque. Con `target="last"`,
    `key` es la subclave 10, que es lo que ataca la última ronda.
    """
    traces = np.asarray(traces, dtype=np.float64)
    key = aes._as_bytes_array(key)
    if target == "first":
        intermediate = aes.first_round_sbox_outputs(texts, key)
    elif target == "last":
        intermediate = aes.last_round_sbox_inputs(texts, key)
    else:
        raise ValueError("target debe ser 'first' o 'last'")

    levels = hamming_weight(intermediate)
    scores = np.empty((16, traces.shape[1]), dtype=np.float64)
    for byte in range(16):
        signal = levels[:, byte].astype(np.float64)[:, None]
        correlation = pearson_correlation(signal, traces)     # (1, n_samples)
        scores[byte] = correlation[0]
    return scores


def winning_key(scores: np.ndarray) -> np.ndarray:
    """Byte de clave que gana en cada posición: `argmax_k max_t |score(k, t)|`."""
    peaks = np.abs(scores).max(axis=2)                       # (16, 256)
    return peaks.argmax(axis=1).astype(np.uint8)

