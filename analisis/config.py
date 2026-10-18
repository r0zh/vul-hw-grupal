"""Parámetros de la simulación y de los experimentos de la fase 1.

Todos los valores de este módulo son **parámetros de una simulación**: no
describen el montaje real, que todavía no existe (fase 2 en adelante). Están
aquí, y no repartidos por los scripts, para que la reproducibilidad se pueda
comprobar de un vistazo: con la misma semilla y estos números, la salida es
idéntica.

El modelo de fuga es el de AGENTS.md: peso de Hamming del valor intermedio
`SBox(p_j ^ k_j)` de la primera ronda, con ruido gaussiano aditivo. Además se
simula el mismo tipo de fuga en la última ronda, porque es el otro punto de
ataque habitual del CPA y conviene tenerlo validado antes de medir.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# ───────────────────────── Semilla y tamaños ─────────────────────────────

#: Semilla maestra. Todas las secuencias aleatorias derivan de ella.
SEED: int = 20261018

#: Número de trazas de la campaña sintética de referencia.
N_TRACES: int = 4000

#: Número de muestras por traza (la ventana cubre las diez rondas de AES).
N_SAMPLES: int = 96

# ──────────────────────────── Clave de laboratorio ───────────────────────

#: Clave de laboratorio de la simulación. No protege nada real.
LAB_KEY: bytes = bytes.fromhex("2b7e151628aed2a6abf7158809cf4f3c")

# ────────────── Regiones de fuga: dónde ocurre cada operación ────────────
#
# En el ATmega328P el AES software recorre el estado byte a byte, así que cada
# byte de la S-box ocupa su propia ventana temporal. El instante central de
# cada ventana se guarda en la metadata de las trazas para poder comprobar si
# el ataque acierta también en el tiempo.

#: Primera muestra de la ventana de la primera ronda.
FIRST_ROUND_START: int = 15

#: Separación entre los centros de dos bytes consecutivos (primera ronda).
FIRST_ROUND_SPACING: int = 2

#: Primera muestra de la ventana de la última ronda.
LAST_ROUND_START: int = 60

#: Separación entre los centros de dos bytes consecutivos (última ronda).
LAST_ROUND_SPACING: int = 2

#: Amplitud de la fuga de la primera ronda (unidades arbitrarias).
FIRST_ROUND_GAIN: float = 1.0

#: Amplitud de la fuga de la última ronda, algo menor que la de la primera.
LAST_ROUND_GAIN: float = 0.8

#: Pesos de las muestras vecinas: la operación no es instantánea.
#: El peso central es 1.0 y los laterales, 0.5.
LEAKAGE_KERNEL: tuple[float, ...] = (0.5, 1.0, 0.5)

# ──────────────────────────────── Ruido ──────────────────────────────────

#: Relación señal-ruido de referencia, definida sobre la potencia de la fuga de
#: la primera ronda: `SNR = Var(g_1 · HW(SBox(p ⊕ k))) / Var(ruido)`. La última
#: ronda tiene menos amplitud y por tanto una SNR efectiva menor.
DEFAULT_SNR: float = 0.1

#: Desviación típica del desplazamiento vertical de cada traza (ganancia y
#: offset del amplificador). Al ser constante dentro de una traza, la
#: correlación de Pearson lo elimina: no degrada el ataque, pero está en la
#: traza y se ve en las figuras.
TRACE_OFFSET_STD: float = 2.0

#: Deriva lenta dentro de una traza, como fracción del ruido blanco. Se ata a
#: la SNR para que no domine la perturbación total en las SNR altas: la SNR
#: nominal describe entonces el canal que ataca el CPA.
TRACE_DRIFT_RATIO: float = 0.05

#: Frecuencia (normalizada) de la deriva lenta dentro de una traza.
TRACE_DRIFT_FREQ: float = 0.35

# ────────────────────── Barrido de ruido y de trazas ─────────────────────

#: Valores de SNR del barrido de ruido (escala logarítmica).
SNR_LEVELS: tuple[float, ...] = (2.0, 1.0, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005)

#: SNRs que alimentan las figuras de recuperación frente al ruido y la tabla
#: de trazas necesarias.
FIGURE_SNR_LEVELS: tuple[float, ...] = (1.0, 0.2, 0.05, 0.02)

#: Número de trazas de cada ensayo del barrido de ruido.
SWEEP_TRACES: int = 3000

#: Número de claves (y de conjuntos de textos claros) del barrido.
SWEEP_TRIALS: int = 60

#: Número de trazas de la campaña de referencia que se analiza en detalle.
BASELINE_TRACES: int = 1000

#: Número de trazas de la comparación entre DPA y CPA.
DPA_TRACES: int = 2000

#: Bits del valor intermedio que prueba la comparación de DPA.
DPA_BITS: tuple[int, ...] = tuple(range(8))


@dataclass(frozen=True)
class SimulationConfig:
    """Configuración completa de una campaña sintética."""

    seed: int = SEED
    n_traces: int = N_TRACES
    n_samples: int = N_SAMPLES
    key: bytes = LAB_KEY
    snr: float = DEFAULT_SNR
    first_round_start: int = FIRST_ROUND_START
    first_round_spacing: int = FIRST_ROUND_SPACING
    last_round_start: int = LAST_ROUND_START
    last_round_spacing: int = LAST_ROUND_SPACING
    first_round_gain: float = FIRST_ROUND_GAIN
    last_round_gain: float = LAST_ROUND_GAIN
    leakage_kernel: tuple[float, ...] = LEAKAGE_KERNEL
    trace_offset_std: float = TRACE_OFFSET_STD
    trace_drift_ratio: float = TRACE_DRIFT_RATIO
    trace_drift_freq: float = TRACE_DRIFT_FREQ

    def __post_init__(self) -> None:
        if self.n_traces < 1 or self.n_samples < 1:
            raise ValueError("n_traces y n_samples deben ser positivos")
        if len(self.key) != 16:
            raise ValueError("la clave debe tener 16 bytes")
        if self.snr <= 0:
            raise ValueError("la SNR debe ser positiva")
        if len(self.leakage_kernel) % 2 == 0:
            raise ValueError("el núcleo de fuga debe tener un centro definido")

    @property
    def first_round_centers(self) -> list[int]:
        """Instante central de la operación de cada byte en la primera ronda."""
        return [
            self.first_round_start + self.first_round_spacing * j for j in range(16)
        ]

    @property
    def last_round_centers(self) -> list[int]:
        """Instante central de la operación de cada byte en la última ronda."""
        return [
            self.last_round_start + self.last_round_spacing * j for j in range(16)
        ]

    def as_dict(self) -> dict[str, object]:
        """Representación serializable (para el JSON de metadatos)."""
        return {
            "seed": self.seed,
            "n_traces": self.n_traces,
            "n_samples": self.n_samples,
            "key_hex": self.key.hex(),
            "snr": self.snr,
            "first_round_start": self.first_round_start,
            "first_round_spacing": self.first_round_spacing,
            "last_round_start": self.last_round_start,
            "last_round_spacing": self.last_round_spacing,
            "first_round_gain": self.first_round_gain,
            "last_round_gain": self.last_round_gain,
            "leakage_kernel": list(self.leakage_kernel),
            "trace_offset_std": self.trace_offset_std,
            "trace_drift_ratio": self.trace_drift_ratio,
            "trace_drift_freq": self.trace_drift_freq,
        }

    def with_overrides(self, **overrides) -> "SimulationConfig":
        """Copia la configuración cambiando solo los campos indicados."""
        unknown = set(overrides) - set(self.__dict__)
        if unknown:
            raise TypeError(f"parámetros no reconocidos: {sorted(unknown)}")
        return SimulationConfig(**{**self.__dict__, **overrides})


def trace_checkpoints(n_traces: int = SWEEP_TRACES) -> list[int]:
    """Lista ordenada de números de trazas usados en las curvas de rango.

    Es densa al principio, donde el rango del candidato correcto cambia
    deprisa, y más espaciada al final.
    """
    points = {1, 2, 4, 8, 12, 16}
    value = 20
    while value <= n_traces:
        points.add(value)
        value = int(round(value * 1.4))
    points.add(n_traces)
    return sorted(p for p in points if p <= n_traces)


@dataclass(frozen=True)
class ExperimentConfig:
    """Experimentos a ejecutar y su coste."""

    simulation: SimulationConfig = field(default_factory=SimulationConfig)
    snr_levels: tuple[float, ...] = SNR_LEVELS
    figure_snr_levels: tuple[float, ...] = FIGURE_SNR_LEVELS
    sweep_traces: int = SWEEP_TRACES
    sweep_trials: int = SWEEP_TRIALS
    baseline_traces: int = BASELINE_TRACES
    dpa_traces: int = DPA_TRACES
    dpa_bits: tuple[int, ...] = DPA_BITS
    checkpoints: tuple[int, ...] = ()

    def __post_init__(self) -> None:
        if not 0 < self.baseline_traces <= self.simulation.n_traces:
            raise ValueError(
                "baseline_traces debe estar entre 1 y n_traces de la simulación"
            )
        for level in self.figure_snr_levels:
            if level not in self.snr_levels:
                raise ValueError(
                    f"la SNR {level} de las figuras no está en el barrido"
                )

    @property
    def trace_checkpoints(self) -> list[int]:
        """Puntos de control del barrido (por defecto, hasta `sweep_traces`)."""
        return list(self.checkpoints) or trace_checkpoints(self.sweep_traces)

    def seed_for(self, name: str) -> int:
        """Semilla derivada y estable para una etapa concreta del análisis.

        Se usa un desplazamiento distinto por nombre para que las etapas no
        compartan la misma secuencia aleatoria, manteniendo la reproducibilidad.
        """
        offset = int.from_bytes(name.encode("utf-8"), "little") % 100_000
        return self.simulation.seed + offset

    def as_dict(self) -> dict[str, object]:
        """Representación serializable de los parámetros de los experimentos."""
        return {
            "simulation": self.simulation.as_dict(),
            "snr_levels": list(self.snr_levels),
            "figure_snr_levels": list(self.figure_snr_levels),
            "sweep_traces": self.sweep_traces,
            "sweep_trials": self.sweep_trials,
            "baseline_traces": self.baseline_traces,
            "dpa_traces": self.dpa_traces,
            "dpa_bits": list(self.dpa_bits),
            "trace_checkpoints": self.trace_checkpoints,
        }
