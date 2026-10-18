"""Simulación de trazas de consumo con fuga por peso de Hamming.

**Esto es una simulación, no una medida.** Genera trazas sintéticas con el
modelo de fuga de AGENTS.md (peso de Hamming del valor intermedio del AES más
ruido gaussiano) para validar el ataque antes de tener el montaje real. El
generador conoce la clave porque la usa para construir la fuga; el atacante de
`attacks.py` no la recibe en ningún momento.

Modelo de una traza, en unidades arbitrarias:

    T_i[t] = b_i                                  (offset por traza)
           + d_i · s[t]                           (deriva lenta dentro de la traza)
           + w_i[t]                               (ruido blanco)
           + Σ_j g_1 · HW(SBox(p_ij ^ k_j)) · h[t - t1_j]     (1.ª ronda)
           + Σ_j g_10 · HW(x_ij) · h[t - t10_j]               (última ronda)

con `h` el núcleo `(0.5, 1.0, 0.5)` centrado en cada ventana y `x_ij` la
entrada de la S-box de la última ronda en la posición de estado `j`, que
depende de la subclave 10. Cada byte del estado ocupa su propia ventana
temporal, separadas dos muestras, que es lo que cabría esperar de un recorrido
byte a byte del estado en el ATmega328P.

La relación señal-ruido se define sobre la fuga de la primera ronda y sobre
**todo** el ruido que ve el CPA en un instante, porque la correlación se
calcula entre trazas: el offset `b_i` cambia de una traza a otra y la deriva
también, así que para el ataque son ruido igual que el blanco.

    SNR = Var(g_1 · HW(V^(1))) / σ²,     σ² = Var(b) + Var(d)·s[t]² + Var(w[t])

El offset y la deriva se fijan como fracciones de `σ` (`trace_offset_ratio` y
`trace_drift_ratio`) y el ruido blanco completa el resto en cada instante, de
modo que la varianza total del ruido es `σ²` en todas las muestras. La varianza
de la fuga se calcula dentro de cada byte del estado y se promedia entre los 16
(`pooled_signal_std`).
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
    last_sbox_input: np.ndarray            # (N, 16) uint8, orden de estado (subclave 10)
    noise_sigma: float                     # desv. típica total del ruido por muestra
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

    # La SNR se define sobre la fuga de la **primera** ronda, que es el valor
    # intermedio que ataca AGENTS.md, y sobre el ruido total de un instante.
    signal_hw_std = pooled_signal_std(first_signal)
    noise_sigma = float(signal_hw_std / np.sqrt(config.snr))

    # Presupuesto del ruido: el offset y la deriva son fracciones fijas de σ y
    # el ruido blanco pone el resto en cada muestra, así que la varianza total
    # es σ² en todos los instantes y la SNR nominal es la que ve el CPA.
    drift_shape = np.sin(
        2.0 * np.pi * config.trace_drift_freq
        * np.arange(config.n_samples) / config.n_samples
    )
    offset_std = config.trace_offset_ratio * noise_sigma
    drift_std = config.trace_drift_ratio * noise_sigma
    white_std = noise_sigma * np.sqrt(
        1.0 - config.trace_offset_ratio**2
        - (config.trace_drift_ratio * drift_shape) ** 2
    )
    traces = np.zeros((n, config.n_samples), dtype=np.float64)
    traces += rng.normal(0.0, offset_std, size=(n, 1))
    traces += rng.normal(0.0, drift_std, size=(n, 1)) * drift_shape
    traces += rng.normal(0.0, 1.0, size=traces.shape) * white_std

    regions = {
        "first_round": config.first_round_centers,
        "last_round": config.last_round_centers,
    }
    for byte in range(16):
        _add_leakage(traces, first_signal[:, byte],
                     config.first_round_centers[byte], config.leakage_kernel)
        # En la última ronda, `byte` es la posición de estado que procesa la
        # S-box en ese instante, no la posición del criptograma.
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


def theoretical_correlation_ceiling(snr: float) -> float:
    """Correlación esperada del candidato correcto en su instante de fuga.

    Con `T = HW·g + n`, `Var(g·HW) = v²` y `Var(n) = v²/SNR`:

        rho = sqrt(SNR / (1 + SNR))

    No depende del número de trazas: con más trazas la **estimación** de `rho`
    es más precisa y los candidatos falsos se acercan a cero (≈ 1/√N), pero el
    valor del correcto no crece.
    """
    if snr <= 0:
        return 0.0
    return float(np.sqrt(snr / (1.0 + snr)))
