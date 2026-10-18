"""Comprobaciones rápidas de la fase 1, sin dependencias de pytest.

Se ejecutan con:

    uv run python -m analisis.tests

Cubren lo que puede invalidar el análisis en silencio:

1. AES-128 contra los ejemplos de FIPS-197 [nist2023fips197] y otros
   vectores contrastados con OpenSSL, en la versión directa y en la
   vectorizada, más los valores intermedios de la primera y la última ronda
   y la inversión de la expansión de clave.
2. La fórmula del ataque contra un caso conocido: correlación igual a la
   teórica sin ruido y recuperación de la clave.
3. Que la SNR nominal es la que ve el ataque, con el offset por traza y la
   deriva incluidos en el ruido.
4. Robustez del CPA: una ganancia y un offset comunes a todas las trazas no
   cambian la correlación, y un offset por traza no impide el ataque.
5. Coherencia de las utilidades estadísticas (rango, margen, error típico).
"""

from __future__ import annotations

import numpy as np

from . import aes, attacks, simulate, statistics
from .config import SimulationConfig


def test_aes_vectors() -> None:
    """Los vectores de prueba de AES coinciden en cifrado y descifrado."""
    for index, (key, plaintext, expected) in enumerate(aes.aes_test_vectors(), start=1):
        round_keys = aes.key_expansion(key)
        ciphertext = aes.encrypt_block(plaintext, round_keys)
        assert ciphertext == expected, f"vector {index}: cifrado incorrecto"
        assert aes.decrypt_block(ciphertext, round_keys) == plaintext, (
            f"vector {index}: descifrado incorrecto"
        )


def test_aes_batch_matches_scalar() -> None:
    """La versión vectorizada reproduce la versión directa, byte a byte."""
    rng = np.random.default_rng(7)
    plaintexts = rng.integers(0, 256, size=(64, 16), dtype=np.uint8)
    key = bytes(rng.integers(0, 256, size=16, dtype=np.uint8))
    round_keys = aes.key_expansion(key)
    batch = aes.encrypt_batch(plaintexts, aes.key_expansion_batch(key))
    for row, plaintext in enumerate(plaintexts):
        expected = aes.encrypt_block(bytes(plaintext), round_keys)
        assert bytes(batch[row]) == expected, f"fila {row}: el lote no coincide"
    # Los valores intermedios tienen que ser los del cifrado real.
    intermediates = aes.cipher_intermediates(plaintexts, key)
    box = np.asarray(aes.SBOX, dtype=np.uint8)
    key_array = np.frombuffer(key, dtype=np.uint8)
    assert np.array_equal(
        intermediates["first_sbox"], box[plaintexts ^ key_array]
    ), "salida de la S-box de la primera ronda incorrecta"
    # Última ronda: c = ShiftRows(SBox(x)) ^ K10, con x la entrada de la S-box.
    round_key_10 = aes.key_expansion_batch(key)[10]
    last_input = intermediates["last_sbox_input"]
    assert np.array_equal(
        box[last_input][:, aes.SHIFT_ROWS_INDEX] ^ round_key_10, batch
    ), "la entrada de la S-box de la última ronda no reproduce el criptograma"
    # Y la hipótesis del atacante, en orden del criptograma, es ese mismo valor.
    assert np.array_equal(
        aes.last_round_sbox_inputs(batch, round_key_10),
        last_input[:, aes.SHIFT_ROWS_INDEX],
    ), "la hipótesis de la última ronda no coincide con el valor intermedio"


def test_invert_key_schedule() -> None:
    """La clave maestra se recupera a partir de la subclave 10."""
    # FIPS-197, apéndice A.1: la última subclave de 2b7e1516... es d014f9a8...
    key = bytes.fromhex("2b7e151628aed2a6abf7158809cf4f3c")
    round_key_10 = aes.key_expansion_batch(key)[10].tobytes()
    assert round_key_10.hex() == "d014f9a8c9ee2589e13f0cc8b6630ca6", (
        f"subclave 10 incorrecta: {round_key_10.hex()}"
    )
    assert aes.invert_key_schedule(round_key_10) == key
    rng = np.random.default_rng(11)
    for _ in range(20):
        key = bytes(rng.integers(0, 256, size=16, dtype=np.uint8))
        round_key_10 = aes.key_expansion_batch(key)[10]
        assert aes.invert_key_schedule(round_key_10) == key, (
            f"no se invierte la expansión de {key.hex()}"
        )


def test_cpa_recovers_key_without_noise() -> None:
    """Sin ruido, el CPA recupera la clave entera y el pico es la cota teórica."""
    config = SimulationConfig(
        n_traces=400,
        snr=1e6,                     # ruido despreciable frente a la fuga
        trace_offset_ratio=0.0,
        trace_drift_ratio=0.0,
    )
    campaign = simulate.simulate_traces(config)
    scores = attacks.cpa_scores(campaign.traces, campaign.plaintexts)
    recovered = attacks.winning_key(scores)
    assert np.array_equal(recovered, campaign.key), (
        f"clave mal recuperada: {recovered.tobytes().hex()}"
    )
    # El pico del candidato correcto debe caer dentro de la ventana de la
    # S-box del byte correspondiente (el núcleo de fuga ocupa tres muestras).
    centers = np.array(config.first_round_centers)
    peaks = np.abs(scores).argmax(axis=2)
    for byte in range(16):
        assert abs(int(peaks[byte, campaign.key[byte]]) - centers[byte]) <= 2, (
            f"el pico del byte {byte} no cae en su ventana"
        )
    # Con ruido despreciable, la correlación del candidato correcto en su
    # propio instante tiene que coincidir con la cota teórica. Es la
    # comprobación de que la convención de la SNR es la que ve el ataque.
    centers = np.array(config.first_round_centers)
    rows = np.arange(16)
    at_center = np.abs(scores[rows, campaign.key.astype(np.intp), centers])
    ceiling = simulate.theoretical_correlation_ceiling(1e6)
    assert abs(float(at_center.mean()) - ceiling) < 0.01, (
        f"correlación {at_center.mean():.4f} frente a la cota {ceiling:.4f}"
    )


def test_cpa_invariant_to_global_gain() -> None:
    """Una ganancia y un offset comunes a todas las trazas no cambian el CPA.

    Es lo que hace que la correlación de Pearson valga para una medida con
    amplificador: no hace falta calibrar la escala ni el cero.
    """
    config = SimulationConfig(n_traces=300, snr=0.5)
    campaign = simulate.simulate_traces(config)
    altered = campaign.traces * 3.0 + 10.0
    reference = attacks.cpa_scores(campaign.traces, campaign.plaintexts)
    shifted = attacks.cpa_scores(altered, campaign.plaintexts)
    # Las trazas se guardan en float32 (como en una campaña real), así que la
    # igualdad es hasta precisión de float32 y no exacta.
    assert np.allclose(reference, shifted, atol=1e-6), (
        "la correlación cambia con una ganancia o un offset comunes"
    )


def test_snr_is_what_the_attack_sees() -> None:
    """Con el offset y la deriva incluidos, la SNR nominal es la que ve el CPA.

    El offset por traza cambia de una traza a otra, así que no lo elimina la
    correlación: es ruido. Si no estuviera en el presupuesto de la SNR, la
    correlación medida quedaría por debajo de `sqrt(SNR/(1+SNR))`.
    """
    for snr in (2.0, 0.1):
        config = SimulationConfig(n_traces=40000, snr=snr)
        campaign = simulate.simulate_traces(config)
        scores = attacks.correct_hypothesis_correlation(
            campaign.traces, campaign.plaintexts, campaign.key
        )
        centers = np.array(config.first_round_centers)
        measured = float(np.abs(scores[np.arange(16), centers]).mean())
        ceiling = simulate.theoretical_correlation_ceiling(snr)
        assert abs(measured - ceiling) < 0.01, (
            f"SNR {snr}: correlación {measured:.4f} frente a {ceiling:.4f}"
        )


def test_cpa_survives_per_trace_offset() -> None:
    """Un offset distinto en cada traza no impide recuperar la clave."""
    config = SimulationConfig(n_traces=600, snr=0.5)
    campaign = simulate.simulate_traces(config)
    assert campaign.config.trace_offset_ratio > 0, (
        "el caso de prueba necesita un offset por traza"
    )
    scores = attacks.cpa_scores(campaign.traces, campaign.plaintexts)
    assert np.array_equal(attacks.winning_key(scores), campaign.key), (
        "el offset por traza impide recuperar la clave"
    )


def test_last_round_target_recovers_key() -> None:
    """El CPA sobre la última ronda recupera la subclave 10 y, de ella, la clave."""
    config = SimulationConfig(n_traces=800, snr=0.3)
    campaign = simulate.simulate_traces(config)
    scores = attacks.cpa_scores(
        campaign.traces, campaign.ciphertexts, target="last"
    )
    recovered = attacks.winning_key(scores)
    round_key_10 = aes.key_expansion_batch(campaign.key)[10]
    assert np.array_equal(recovered, round_key_10), (
        "la última ronda no recupera la subclave 10"
    )
    assert aes.invert_key_schedule(recovered) == campaign.key.tobytes(), (
        "la subclave 10 recuperada no lleva a la clave maestra"
    )


def test_dpa_and_cpa_share_the_correct_answer() -> None:
    """DPA y CPA recuperan la clave entera cuando el ruido es despreciable.

    Hacen falta bastantes trazas incluso sin ruido: el DPA elige el máximo
    sobre 256 candidatos y 96 muestras, así que con pocas trazas un candidato
    falso puede colarse por azar (sesgo de selección).
    """
    config = SimulationConfig(n_traces=1200, snr=1e6, trace_offset_ratio=0.0,
                              trace_drift_ratio=0.0)
    campaign = simulate.simulate_traces(config)
    for bit in range(8):
        dpa = attacks.dpa_scores(campaign.traces, campaign.plaintexts, bit=bit)
        assert np.array_equal(attacks.winning_key(dpa), campaign.key), (
            f"el DPA no recupera la clave sin ruido con el bit {bit}"
        )


def test_statistics_helpers() -> None:
    """Rango, margen y error típico se comportan como se espera."""
    rng = np.random.default_rng(3)
    score = rng.normal(size=(256, 10))
    score[7, 4] = 5.0
    assert statistics.rank_of(score, 7) == 1
    assert statistics.detection_margin(score, 7) > 0
    assert statistics.rank_of(score, 8) > 1
    ranks = statistics.ranks_of(score[None, :, :], np.array([7]))
    assert ranks[0] == 1
    assert statistics.binomial_standard_error(0.5, 100) == 0.05
    # El rango de la hipótesis correcta debe ser 1 cuando su pico es el mayor.
    identical = np.tile(score[None, :, :], (16, 1, 1))
    assert np.array_equal(statistics.ranks_of(identical, np.full(16, 7)),
                          np.ones(16, dtype=int))


def main() -> None:
    """Ejecuta todas las comprobaciones y resume el resultado."""
    tests = [value for name, value in sorted(globals().items())
             if name.startswith("test_") and callable(value)]
    for test in tests:
        test()
        print(f"ok  {test.__name__}")
    print(f"\n{len(tests)} comprobaciones correctas")


if __name__ == "__main__":
    main()
