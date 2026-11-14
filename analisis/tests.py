"""Comprobaciones rápidas del análisis, sin dependencias de pytest.

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
6. El CPA incremental de `real.py`: mismos resultados que el CPA completo y
   rango 1 en los 16 bytes sin ruido.
7. La curva de rango estable de `real.py` y la curva de éxito de `reales.py`.
8. El análisis de desalineación y la correlación de la hipótesis correcta de
   `reales.py`, que son las que dan los números de las medidas.
9. La ida y vuelta y el recorte del formato de campaña de `captura/campana.py`.
10. Los JSON que `reales.py` deja para la web: misma forma que los datos y los
    mismos números que los resultados.
11. La medida de hasta dónde llega la fuga de la primera ronda (`leak_tail`).
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np

from captura import campana

from . import aes, attacks, real, reales, simulate, statistics
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


def test_incremental_cpa_matches_full_cpa() -> None:
    """El CPA incremental da las mismas puntuaciones que el CPA completo.

    Los estadísticos acumulados de `real.incremental_cpa` tienen que llegar al
    mismo resultado que `attacks.cpa_scores` sobre las mismas trazas, y sin
    ruido dejar el rango de la clave correcta en 1 en los 16 bytes.
    """
    config = SimulationConfig(
        n_traces=150,
        snr=1e6,                     # ruido despreciable: el rango tiene que ser 1
        trace_offset_ratio=0.0,
        trace_drift_ratio=0.0,
    )
    campaign = simulate.simulate_traces(config)
    traces = campaign.traces.astype(np.float64)
    key = campaign.key.astype(np.intp)
    steps = [10, 30, 75, len(traces)]
    scores, ranks = real.incremental_cpa(traces, campaign.plaintexts, key, steps)
    assert scores.shape == (16, 256, traces.shape[1]), (
        f"forma de las puntuaciones inesperada: {scores.shape}"
    )
    assert ranks.shape == (len(steps), 16), (
        f"forma de los rangos inesperada: {ranks.shape}"
    )
    # Las puntuaciones devueltas son las del último paso, es decir, las de las
    # primeras `steps[-1]` trazas (aquí, todas).
    reference = attacks.cpa_scores(
        traces[:steps[-1]], campaign.plaintexts[:steps[-1]]
    )
    assert np.allclose(scores, reference, rtol=0.0, atol=1e-9), (
        "el CPA incremental no coincide con el completo: diferencia máxima "
        f"{np.abs(scores - reference).max():.3e}"
    )
    assert np.array_equal(ranks[-1], np.ones(16, dtype=int)), (
        f"sin ruido el rango final no es 1 en los 16 bytes: {ranks[-1]}"
    )
    assert np.array_equal(attacks.winning_key(scores), campaign.key), (
        "el CPA incremental no recupera la clave sin ruido"
    )


def test_stable_traces() -> None:
    """`stable_traces` da el primer N con rango 1 hasta el final, o `None`.

    Se construyen los rangos a mano: lo que se comprueba es la definición
    («rango 1 desde ese N hasta el final»), no el CPA que los produce.
    """
    steps = [10, 25, 50, 100]
    ranks = np.ones((len(steps), 16), dtype=int)
    # Byte 0: siempre en rango 1, así que está estable desde el primer paso.
    # Byte 1: se estabiliza a mitad (desde N = 50 ya no vuelve a fallar).
    ranks[:, 1] = [4, 2, 1, 1]
    # Byte 2: nunca llega a rango 1 en el último paso.
    ranks[:, 2] = [3, 2, 4, 2]
    # Byte 3: falla una vez después de haber estado bien; cuenta el último fallo.
    ranks[:, 3] = [1, 5, 1, 1]
    # Byte 4: se estabiliza justo en el último paso.
    ranks[:, 4] = [2, 2, 2, 1]

    needed = real.stable_traces(ranks, steps)
    assert len(needed) == 16, f"se esperaban 16 valores, no {len(needed)}"
    assert needed[0] == steps[0], (
        f"un byte siempre en rango 1 debería estabilizarse en {steps[0]}, "
        f"no en {needed[0]}"
    )
    assert needed[1] == steps[2], (
        f"el byte que se estabiliza a mitad debería dar {steps[2]}, no {needed[1]}"
    )
    assert needed[2] is None, (
        f"un byte que no llega a rango 1 al final debería dar None, no {needed[2]}"
    )
    assert needed[3] == steps[2], (
        "el byte que vuelve a rango 1 tras fallar debería contar el último "
        f"fallo ({steps[2]}), no {needed[3]}"
    )
    assert needed[4] == steps[-1], (
        f"el byte que se estabiliza en el último paso debería dar {steps[-1]}, "
        f"no {needed[4]}"
    )
    assert needed[5:] == [steps[0]] * 11, (
        f"los bytes siempre en rango 1 no dan {steps[0]}: {needed[5:]}"
    )


def test_alignment_shifts() -> None:
    """`alignment_shifts` recupera el desplazamiento de cada traza frente a la media.

    El signo es el de `np.roll`: el valor devuelto `s` es el que habría que
    aplicar a la traza para alinearla, `np.roll(traza, s)`. Por eso una traza
    retardada `k` muestras (`np.roll(base, k)`) aparece como `-k`, y una
    adelantada, como `+k`. Las claves del diccionario son texto (`"-3"`) y los
    valores, cuántas trazas tienen ese desplazamiento.
    """
    rng = np.random.default_rng(23)
    n_samples, n_traces = 64, 10
    base = rng.normal(size=n_samples)
    # Trazas iguales salvo un ruido pequeño: no hay nada que alinear.
    traces = base[None, :] + rng.normal(0.0, 0.02, size=(n_traces, n_samples))
    shifts = reales.alignment_shifts(traces)
    assert shifts == {"0": n_traces}, (
        f"trazas alineadas con ruido pequeño no dan todas 0: {shifts}"
    )

    # Una parte de las trazas se retrasa 3 muestras; el resto sigue alineado.
    delayed = traces.copy()
    delayed[[1, 4, 9]] = np.roll(traces[[1, 4, 9]], 3, axis=1)
    shifts = reales.alignment_shifts(delayed)
    assert shifts == {"-3": 3, "0": n_traces - 3}, (
        f"un retraso de 3 muestras debería aparecer como -3: {shifts}"
    )

    # Y una parte se adelanta 2: el desplazamiento sale con el signo contrario.
    advanced = traces.copy()
    advanced[[0, 6]] = np.roll(traces[[0, 6]], -2, axis=1)
    shifts = reales.alignment_shifts(advanced)
    assert shifts == {"2": 2, "0": n_traces - 2}, (
        f"un adelanto de 2 muestras debería aparecer como +2: {shifts}"
    )


def test_correct_correlation_matches_pearson() -> None:
    """`_correct_correlation` es la correlación de Pearson, en valor absoluto.

    La función de `reales.py` se usa para los números de las medidas, así que
    tiene que coincidir con `statistics.pearson_correlation`, que es la que
    valida el resto del análisis.
    """
    rng = np.random.default_rng(31)
    n_traces, n_samples = 40, 6
    traces = rng.normal(size=(n_traces, n_samples))
    # Valores intermedios de los 16 bytes, con la forma (N, 16) que usa `reales.py`.
    values = rng.integers(0, 256, size=(n_traces, 16), dtype=np.uint8)
    rho = reales._correct_correlation(traces, values)
    assert rho.shape == (16, n_samples), (
        f"forma inesperada de la correlación: {rho.shape}"
    )
    byte = 3
    samples = [0, 2, 5]
    levels = simulate.hamming_weight(values[:, byte]).astype(np.float64)[:, None]
    reference = np.abs(statistics.pearson_correlation(levels, traces)[0])
    assert np.allclose(rho[byte, samples], reference[samples], rtol=0.0,
                       atol=1e-12), (
        "la correlación de la hipótesis correcta no coincide con la de "
        f"Pearson: {rho[byte, samples]} frente a {reference[samples]}"
    )


def test_success_curve_reaches_full_key() -> None:
    """Con SNR alta la tasa de éxito de la clave completa acaba en 1.

    La curva se estima con 3 permutaciones de la misma campaña, como en
    `reales.py`. Los valores de los pasos intermedios dependen del azar; lo
    que se exige es que el último paso no empeore y que la clave entera quede
    en rango 1, de modo que `n_100` exista.
    """
    config = SimulationConfig(
        n_traces=120,
        snr=10.0,
        trace_offset_ratio=0.0,
        trace_drift_ratio=0.0,
    )
    synthetic = simulate.simulate_traces(config)
    data = campana.Campaign(
        traces=synthetic.traces,
        plaintexts=synthetic.plaintexts,
        ciphertexts=synthetic.ciphertexts,
        key=synthetic.key,
    )
    steps = [5, 10, 20, 120]
    curve = reales.success_curve(data, steps, 3)
    success = curve["exito_clave_completa"]
    assert curve["pasos"] == steps, f"pasos inesperados: {curve['pasos']}"
    assert curve["ordenaciones"] == 3, (
        f"se esperaban 3 ordenaciones, no {curve['ordenaciones']}"
    )
    assert len(success) == len(steps), (
        f"la curva de éxito tiene {len(success)} puntos y no {len(steps)}"
    )
    assert success[-1] >= success[-2], (
        f"la tasa de éxito baja en el último paso: {success}"
    )
    assert success[-1] == 1.0, (
        f"la clave completa no se recupera al final: {success}"
    )
    assert curve["n_100"] is not None, (
        "no se anota el N con éxito total aunque la tasa final sea 1"
    )
    assert curve["n_100"] in steps, (
        f"n_100 debería ser uno de los pasos, no {curve['n_100']}"
    )


def test_campaign_round_trip_and_trim() -> None:
    """El formato de campaña conserva los arrays y el recorte queda anotado."""
    rng = np.random.default_rng(41)
    campaign = campana.Campaign(
        traces=rng.normal(size=(8, 12)).astype(np.float32),
        plaintexts=rng.integers(0, 256, size=(8, 16), dtype=np.uint8),
        ciphertexts=rng.integers(0, 256, size=(8, 16), dtype=np.uint8),
        key=rng.integers(0, 256, size=16, dtype=np.uint8),
        metadata={
            "simulada": True,
            "instrumento": {"tipo": "simulada"},
            "fecha": "2026-01-01",
            "nota": "prueba de ida y vuelta",
        },
    )
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        npz, meta = campana.save(root / "origen", campaign)
        assert npz.exists() and meta.exists(), "save no ha escrito los dos ficheros"

        # La ida y vuelta es exacta: mismos dtypes, mismos valores y los
        # metadatos originales más los dos campos que añade `save`.
        loaded = campana.load(root / "origen")
        for name in ("traces", "plaintexts", "ciphertexts", "key"):
            original = getattr(campaign, name)
            restored = getattr(loaded, name)
            assert restored.dtype == original.dtype, (
                f"{name} cambia de dtype al guardar: {restored.dtype}"
            )
            assert np.array_equal(restored, original), (
                f"{name} no se recupera igual tras guardar y cargar"
            )
        expected = dict(campaign.metadata)
        expected["n_traces"], expected["n_samples"] = 8, 12
        assert loaded.metadata == expected, (
            f"los metadatos no se recuperan igual: {loaded.metadata}"
        )
        assert loaded.simulated, "la marca de campaña simulada se pierde"
        # Cargar con la extensión también vale (`_base` quita el sufijo).
        assert np.array_equal(campana.load(npz).traces, campaign.traces), (
            "cargar la ruta con extensión .npz da otra campaña"
        )

        # El recorte guarda las trazas y las muestras pedidas y anota el origen.
        trimmed_npz, trimmed_meta = campana.trim(
            root / "origen", root / "recorte", n_traces=5, start=2, stop=9,
            extra={"uso": "prueba"},
        )
        assert trimmed_npz.exists() and trimmed_meta.exists(), (
            "trim no ha escrito los dos ficheros"
        )
        trimmed = campana.load(root / "recorte")
        assert np.array_equal(trimmed.traces, campaign.traces[:5, 2:9]), (
            "trim no recorta las trazas como se le pide"
        )
        assert np.array_equal(trimmed.plaintexts, campaign.plaintexts[:5]), (
            "trim no recorta los textos claros como se le pide"
        )
        assert np.array_equal(trimmed.ciphertexts, campaign.ciphertexts[:5]), (
            "trim no recorta los criptogramas como se le pide"
        )
        assert np.array_equal(trimmed.key, campaign.key), (
            "trim no conserva la clave"
        )
        on_disk = json.loads(trimmed_meta.read_text())
        assert on_disk["recorte"] == {
            "origen": "origen", "trazas": [0, 5], "muestras": [2, 9],
        }, f"la anotación del recorte no es la esperada: {on_disk['recorte']}"
        assert on_disk["uso"] == "prueba", "trim no añade los metadatos extra"
        assert (on_disk["n_traces"], on_disk["n_samples"]) == (5, 7), (
            "trim no actualiza el tamaño de la campaña recortada"
        )
        assert trimmed.simulated, "trim pierde la marca de campaña simulada"


def test_leak_tail_finds_last_leaking_sample() -> None:
    """`leak_tail` da la última muestra en la que fuga la S-box de la primera ronda.

    Se fabrican trazas de ruido en las que la salida de la S-box de dos bytes
    fuga en dos muestras conocidas: la función tiene que devolver la más tardía,
    sea del byte que sea, y `None` si ninguna muestra supera el umbral.
    """
    rng = np.random.default_rng(61)
    n_traces, n_samples = 400, 30
    key = rng.integers(0, 256, size=16, dtype=np.uint8)
    plaintexts = rng.integers(0, 256, size=(n_traces, 16), dtype=np.uint8)
    leak = simulate.hamming_weight(np.asarray(aes.SBOX, dtype=np.uint8)[plaintexts ^ key])
    traces = rng.normal(0.0, 1.0, size=(n_traces, n_samples))
    traces[:, 7] += 2.0 * leak[:, 0]       # el byte 0 fuga en la muestra 7
    traces[:, 19] += 2.0 * leak[:, 5]      # y el byte 5, más tarde, en la 19
    data = campana.Campaign(
        traces=traces.astype(np.float32), plaintexts=plaintexts,
        ciphertexts=np.zeros_like(plaintexts), key=key,
    )
    tail = reales.leak_tail(data)
    assert tail == {"umbral": reales.LEAK_TAIL_THRESHOLD, "ultima_muestra": 19}, (
        f"la última muestra con fuga debería ser la 19: {tail}"
    )
    # Con un umbral que nadie alcanza no hay última muestra.
    assert reales.leak_tail(data, threshold=0.999)["ultima_muestra"] is None, (
        "un umbral inalcanzable debería dar None"
    )


def test_web_exports() -> None:
    """Los JSON de la web no cambian los números: solo los redondean y los renombran.

    `export_web_spa` guarda la traza media en décimas de código del convertidor
    y las correlaciones en milésimas; `export_web_curves` copia las curvas de
    éxito de los resultados. La web lee esos ficheros tal cual, así que un
    cambio de escala o de nombre aquí la dejaría enseñando otra cosa.
    """
    rng = np.random.default_rng(53)
    n_samples = 40
    mean = rng.uniform(-0.5, 0.1, size=n_samples)
    first = rng.uniform(0.0, 0.7, size=n_samples)
    last = rng.uniform(0.0, 0.7, size=n_samples)
    analysis = {
        "n_traces": 7, "mean": mean, "first": first, "last": last,
        "numbers": {"periodo_ronda_muestras": 12, "ronda1_rho_gt_0_6": (3, 9),
                    "ronda10_rho_gt_0_6": (30, 36), "fin_cifrado_aprox": 37},
    }
    spa = campana.Campaign(
        traces=np.zeros((7, n_samples), dtype=np.float32),
        plaintexts=np.zeros((7, 16), dtype=np.uint8),
        ciphertexts=np.zeros((7, 16), dtype=np.uint8),
        key=np.zeros(16, dtype=np.uint8),
        metadata={"instrumento": {"adc_hz": 7.5e6}},
    )
    curve = {"pasos": [5, 10, 20], "ordenaciones": 4, "exito_clave_completa": [0.0, 0.25, 1.0],
             "fraccion_bytes_rango1": [0.015625, 0.5, 1.0], "n_50": 20, "n_90": 20, "n_100": 20}
    results = {"tinyaes": {"n_traces": 30, "bytes_correctos": 16, "curva": curve},
               "cm-retardos": {"n_traces": 30, "bytes_correctos": 0,
                               "curva": {**curve, "exito_clave_completa": [0.0, 0.0, 0.0],
                                         "n_50": None, "n_90": None, "n_100": None}}}
    with tempfile.TemporaryDirectory() as tmp:
        payload = json.loads(reales.export_web_spa(spa, analysis, Path(tmp)).read_text())
        assert payload["synthetic"] is False, "la traza de la web debe ir marcada como medida"
        assert payload["meta"]["trazas"] == 7 and payload["meta"]["adc_hz"] == 7.5e6, (
            f"metadatos inesperados: {payload['meta']}"
        )
        assert payload["rondas"] == {"periodo": 12, "ronda1": [3, 9], "ronda10": [30, 36], "fin": 37}, (
            f"los números de las rondas no son los del análisis: {payload['rondas']}"
        )
        for name in ("mean", "rho1", "rho10"):
            assert len(payload[name]) == n_samples, f"{name} no tiene una entrada por muestra"
            assert all(isinstance(v, int) for v in payload[name]), f"{name} no va en enteros"
        # Deshacer la escala devuelve la traza con el error de redondeo esperado.
        restored = np.asarray(payload["mean"]) / 2560 - 0.5
        assert np.abs(restored - mean).max() <= 0.5 / 2560 + 1e-12, (
            "la traza media no se recupera a media décima de código"
        )
        assert np.abs(np.asarray(payload["rho1"]) / 1000 - first).max() <= 0.0005 + 1e-12, (
            "la correlación de la primera ronda no se recupera a media milésima"
        )

        curves = json.loads(reales.export_web_curves(results, Path(tmp)).read_text())
        assert curves["ordenaciones"] == 4, f"ordenaciones inesperadas: {curves['ordenaciones']}"
        assert list(curves["series"]) == ["tinyaes", "cm-retardos"], (
            f"series inesperadas o desordenadas: {list(curves['series'])}"
        )
        tiny = curves["series"]["tinyaes"]
        assert tiny["pasos"] == curve["pasos"] and tiny["exito"] == curve["exito_clave_completa"], (
            "la curva de éxito de la web no es la de los resultados"
        )
        assert tiny["bytes"] == [0.0156, 0.5, 1.0], f"fracción de bytes mal redondeada: {tiny['bytes']}"
        assert (tiny["n50"], tiny["n90"], tiny["n100"], tiny["trazas"]) == (20, 20, 20, 30), (
            "los puntos del 50, 90 y 100 % no se copian"
        )
        assert curves["series"]["cm-retardos"]["n90"] is None, (
            "una variante que no recupera la clave debe quedar sin N para el 90 %"
        )


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
