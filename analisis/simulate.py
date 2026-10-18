"""Simulación de trazas de consumo con fuga por peso de Hamming.

**Esto es una simulación, no una medida.** Genera trazas sintéticas con el
modelo de fuga de AGENTS.md (peso de Hamming del valor intermedio del AES más
ruido gaussiano) para validar el ataque antes de tener el montaje real. El
generador conoce la clave porque la usa para construir la fuga; el atacante de
`attacks.py` no la recibe en ningún momento.

Modelo de una traza, en unidades arbitrarias:

    T_i[t] = b_i                                  (offset y ganancia por traza)
           + d_i[t]                               (deriva lenta dentro de la traza)
           + n_i[t] ~ N(0, sigma²)                (ruido electrónico)
           + sum_r g_r · HW(V_i^(r)) · k[t - t_r] (fuga de la operación r)

con `k` el núcleo `(0.5, 1.0, 0.5)` centrado en cada ventana. Cada byte del
estado ocupa su propia ventana temporal, separadas dos muestras, que es lo que
cabría esperar de un recorrido byte a byte del estado en el ATmega328P.

La relación señal-ruido se define sobre la **potencia de la señal de fuga**,
de modo que el valor de `snr` que se usa en las figuras es el mismo en todas
las campañas:

    SNR = Var(g_1 · HW(V^(1))) / sigma²

donde la varianza de la fuga se calcula **dentro** de cada byte del estado y se
promedia entre los 16 (`pooled_signal_std`), que es lo que ve el CPA al atacar
un byte cada vez. La varianza es una propiedad del conjunto de textos claros y
de la clave, y se mide en lugar de suponerse. La SNR se define sobre la
primera ronda; como la última ronda tiene menos amplitud (`last_round_gain`),
su SNR efectiva es proporcionalmente menor y por eso su pico de correlación
también lo es.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import aes
from .config import SimulationConfig


@dataclass
class SyntheticTraces:
    """Campaña sintética y los datos que hacen falta para analizarla."""

    traces: np.ndarray                     # (N, S) float32
    plaintexts: np.ndarray                 # (N, 16) uint8
    ciphertexts: np.ndarray                # (N, 16) uint8
    key: np.ndarray                        # (16,) uint8
    config: SimulationConfig
    first_sbox: np.ndarray                 # (N, 16) uint8, valor intermedio real
    last_sbox_input: np.ndarray            # (N, 16) uint8, valor intermedio real
    noise_sigma: float                     # desviación típica del ruido añadido
    signal_hw_std: float                   # desv. típica de la fuga de la 1.ª ronda
    leakage_regions: dict[str, list[int]] = field(default_factory=dict)
    metadata: dict[str, object] = field(default_factory=dict)

    def save(self, npz_path, json_path=None) -> None:
        """Guarda la campaña en el formato de AGENTS.md.

        El `.npz` lleva `traces`, `plaintexts`, `ciphertexts` y `key`; el
        `.json`, los metadatos (frecuencia de muestreo, etc. no aplican aquí:
        es una simulación, y así queda anotado).
        """
        import json
        from pathlib import Path

        npz_path = Path(npz_path)
        npz_path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            npz_path,
            traces=self.traces,
            plaintexts=self.plaintexts,
            ciphertexts=self.ciphertexts,
            key=self.key,
        )
        if json_path is not None:
            json_path = Path(json_path)
            payload = {
                "synthetic": True,
                "aviso": (
                    "Trazas SIMULADAS por analisis/simulate.py con el modelo de "
                    "fuga del peso de Hamming. No son medidas de ningún montaje."
                ),
                "simulation": self.config.as_dict(),
                "noise_sigma": self.noise_sigma,
                "signal_hw_std": self.signal_hw_std,
                "leakage_regions": self.leakage_regions,
                **self.metadata,
            }
            json_path.write_text(
                json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )


def _leakage_levels(intermediates: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """Peso de Hamming de cada valor intermedio, por byte del estado."""
    return {
        "first": hamming_weight(intermediates["first_sbox"]),
        "last": hamming_weight(intermediates["last_sbox_input"]),
    }


#: Tabla de pesos de Hamming de los 256 valores de un byte. Indexar con ella
#: es la forma rápida de calcular `HW(x)` para un array entero.
BIT_COUNT: np.ndarray = np.array(
    [bin(value).count("1") for value in range(256)], dtype=np.uint8
)


def hamming_weight(values: np.ndarray) -> np.ndarray:
    """Peso de Hamming de un array de bytes, conservando la forma."""
    return BIT_COUNT[np.asarray(values, dtype=np.uint8)]


def simulate_traces(config: SimulationConfig | None = None,
                    **overrides) -> SyntheticTraces:
    """Genera una campaña de trazas sintéticas.

    Parámetros
    ----------
    config
        Configuración base. Si se omite, se usan los valores de `config.py`.
    **overrides
        Cualquier campo de `SimulationConfig` se puede sobrescribir aquí
        (`n_traces=200`, `snr=0.01`, ...), que es como lo usan los barridos.

    Devuelve
    --------
    `SyntheticTraces` con las trazas y los valores intermedios reales.
    """
    if config is None:
        config = SimulationConfig()
    if overrides:
        config = _replace_config(config, overrides)

    rng = np.random.default_rng(config.seed)
    plaintexts = rng.integers(0, 256, size=(config.n_traces, 16), dtype=np.uint8)
    return simulate_from_texts(plaintexts, config)


def simulate_from_texts(plaintexts: np.ndarray,
                        config: SimulationConfig | None = None) -> SyntheticTraces:
    """Igual que `simulate_traces`, pero con los textos claros ya fijados.

    Lo usan los barridos, que eligen los textos con su propia secuencia
    aleatoria para poder variar la clave y el ruido por separado.
    """
    if config is None:
        config = SimulationConfig()
    plaintexts = np.asarray(plaintexts, dtype=np.uint8)
    if plaintexts.ndim != 2 or plaintexts.shape[1] != 16:
        raise ValueError("plaintexts debe tener forma (n, 16)")
    n = plaintexts.shape[0]
    rng = np.random.default_rng(config.seed)

    intermediates = aes.cipher_intermediates(plaintexts, config.key)
    ciphertexts = intermediates["ciphertexts"]
    levels = _leakage_levels(intermediates)
    first_signal = config.first_round_gain * levels["first"].astype(np.float64)
    last_signal = config.last_round_gain * levels["last"].astype(np.float64)
    signal = first_signal + last_signal

    # La SNR se define sobre la fuga de la **primera** ronda, que es el valor
    # intermedio que ataca AGENTS.md. El ruido se escala con ella y no con la
    # potencia total de la traza: si se escalara con la suma de las dos rondas,
    # la SNR que se reporta no sería la que ve el ataque de la primera ronda.
    signal_hw_std = pooled_signal_std(first_signal)
    noise_sigma = float(signal_hw_std / np.sqrt(config.snr))

    # La deriva lenta se ata a ese fondo (una fracción pequeña) para que la SNR
    # nominal describa el canal que ataca el CPA y no quede ahogada por la
    # deriva en las SNR altas. El desplazamiento vertical de cada traza no
    # entra en esta cuenta: al ser constante dentro de la traza, la correlación
    # de Pearson lo elimina. Está en la traza porque un montaje real lo tiene,
    # no porque estorbe.
    noise_drift_std = config.trace_drift_ratio * noise_sigma

    drift_shape = np.sin(
        2.0 * np.pi * config.trace_drift_freq
        * np.arange(config.n_samples) / config.n_samples
    )
    traces = np.zeros((n, config.n_samples), dtype=np.float64)
    traces += rng.normal(0.0, config.trace_offset_std, size=(n, 1))
    traces += rng.normal(0.0, noise_drift_std, size=(n, 1)) * drift_shape
    traces += rng.normal(0.0, noise_sigma, size=traces.shape)

    regions = {
        "first_round": config.first_round_centers,
        "last_round": config.last_round_centers,
    }
    for byte in range(16):
        _add_leakage(traces, first_signal[:, byte],
                     config.first_round_centers[byte], config.leakage_kernel)
        _add_leakage(traces, last_signal[:, byte],
                     config.last_round_centers[byte], config.leakage_kernel)

    return SyntheticTraces(
        traces=traces.astype(np.float32),
        plaintexts=plaintexts,
        ciphertexts=ciphertexts,
        key=np.frombuffer(config.key, dtype=np.uint8).copy(),
        config=config,
        first_sbox=intermediates["first_sbox"],
        last_sbox_input=intermediates["last_sbox_input"],
        noise_sigma=noise_sigma,
        signal_hw_std=signal_hw_std,
        leakage_regions=regions,
        metadata={
            "n_traces": int(n),
            "n_samples": int(config.n_samples),
            "seed": int(config.seed),
        },
    )


def pooled_signal_std(signal: np.ndarray) -> float:
    """Desviación típica de la fuga **dentro** de cada byte del estado.

    `signal` tiene forma `(n, 16)`. La varianza se calcula byte a byte y se
    promedia (varianza combinada). Se hace así y no sobre los 16 bytes juntos
    porque el CPA ataca un byte cada vez: la dispersión *entre* bytes no es
    ruido para el ataque, es señal. Tomar la desviación típica global
    sobreestimaría el ruido y la SNR que se reporta no sería la que ve el
    ataque.
    """
    signal = np.asarray(signal, dtype=np.float64)
    per_byte_variance = signal.var(axis=0)
    return float(np.sqrt(per_byte_variance.mean()))


def _replace_config(config: SimulationConfig, overrides: dict) -> SimulationConfig:
    """Copia una `SimulationConfig` cambiando solo los campos indicados."""
    fields = {**config.__dict__, **overrides}
    unknown = set(overrides) - set(config.__dict__)
    if unknown:
        raise TypeError(f"parámetros no reconocidos: {sorted(unknown)}")
    return SimulationConfig(**fields)


def _add_leakage(traces: np.ndarray, signal: np.ndarray, center: int,
                 kernel: tuple[float, ...]) -> None:
    """Suma la fuga de un byte del estado centrada en `center`."""
    half = len(kernel) // 2
    for offset, weight in enumerate(kernel):
        sample = center - half + offset
        if 0 <= sample < traces.shape[1]:
            traces[:, sample] += weight * signal


def theoretical_correlation_ceiling(signal_hw_std: float, snr: float,
                                   trace_offset_std: float = 0.0) -> float:
    """Cota superior de la correlación de Pearson con el modelo de fuga.

    Con `T = A·HW + n`, `Var(HW) = v²` y `Var(n) = v²/SNR`:

        rho_max = SNR_amplitud / sqrt(1 + SNR_amplitud)

    donde `SNR_amplitud = v²/σ²` es la relación de potencias `snr`. Si se pasa
    `trace_offset_std`, se tiene en cuenta que el desplazamiento vertical de
    cada traza engorda el denominador (la varianza total de la traza) aunque
    no afecte al numerador: la correlación medida es entonces algo menor que
    esta cota.
    """
    if snr <= 0:
        return 0.0
    signal_variance = signal_hw_std**2
    noise_variance = signal_variance / snr
    effective_noise = noise_variance + trace_offset_std**2
    if effective_noise <= 0:
        return 1.0
    amplitude_snr = signal_variance / effective_noise
    return float(np.sqrt(amplitude_snr / (1.0 + amplitude_snr)))

