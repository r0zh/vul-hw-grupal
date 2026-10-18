"""Demo en vivo del CPA: la clave aparece byte a byte a medida que crece N.

    uv run python -m analisis.demo                 # terminal, SNR = 0,1
    uv run python -m analisis.demo --plot          # además, ventana con ρ(t)
    uv run python -m analisis.demo --snr 0.02      # más ruido, hacen falta más trazas

**Son datos simulados**, con el mismo modelo de fuga y la misma semilla que la
fase 1 (`config.py`). No escribe ningún fichero: está pensada para enseñarse,
no para producir resultados. Los números de la memoria salen de `run_all`.

El ataque (`attacks.cpa_scores` y `attacks.winning_key`) no ve la clave. La
demo sí la usa, pero solo para pintar cada byte en verde o en rojo y para
calcular el puesto del candidato correcto, igual que `experiments.py`.
"""

from __future__ import annotations

import argparse
import sys
import time

import numpy as np

from . import attacks, simulate, statistics
from .config import SimulationConfig

#: Números de trazas que se muestran, de pocas a muchas.
CHECKPOINTS: tuple[int, ...] = (
    10, 20, 30, 50, 75, 100, 150, 200, 300, 400, 500, 650, 800, 1000,
    1250, 1500, 2000, 2500, 3000, 4000,
)

#: Aviso que acompaña a toda la salida de la demo.
SIMULATION_NOTICE = "DATOS SIMULADOS: modelo de fuga HW + ruido gaussiano, sin medidas reales"

_GREEN = "\033[1;32m"
_RED = "\033[31m"
_DIM = "\033[2m"
_BOLD = "\033[1m"
_RESET = "\033[0m"


def _paint(text: str, color: str, enabled: bool) -> str:
    """Envuelve `text` en un código de color ANSI si la salida es una terminal."""
    return f"{color}{text}{_RESET}" if enabled else text


def _key_line(recovered: np.ndarray, key: np.ndarray, color: bool) -> str:
    """Clave recuperada en hexadecimal, con los bytes acertados en verde."""
    parts = []
    for guess, correct in zip(recovered, key):
        text = f"{guess:02x}"
        parts.append(_paint(text, _GREEN if guess == correct else _RED, color))
    return " ".join(parts)


def _checkpoints(n_traces: int) -> list[int]:
    """Puntos de `CHECKPOINTS` que caben en la campaña, terminando en `n_traces`."""
    points = [n for n in CHECKPOINTS if n < n_traces]
    return points + [n_traces]


class _LivePlot:
    """Ventana con la correlación de un byte, actualizada en cada paso."""

    def __init__(self, n_samples: int, byte: int, correct: int,
                 centers: list[int]) -> None:
        import matplotlib.pyplot as plt

        # Matplotlib elige el primer backend con ventana que funcione (Qt, GTK,
        # Tk...) y, si no hay ninguno, cae en silencio a `agg`.
        if plt.get_backend().lower() == "agg":
            raise SystemExit(
                "--plot: matplotlib no encuentra ningún backend con ventana. "
                "Si es el Tk del Python de uv, prueba `uv python upgrade "
                "--reinstall`; si no, instala PyQt6 o usa la demo sin --plot."
            )

        self._plt = plt
        self.byte = byte
        self.correct = correct
        plt.ion()
        self.figure, (self.top, self.bottom) = plt.subplots(
            2, 1, figsize=(9, 6.5), gridspec_kw={"hspace": 0.45},
        )
        self.figure.canvas.manager.set_window_title("CPA sobre AES-128 (simulación)")
        self.figure.text(0.5, 0.01, SIMULATION_NOTICE, ha="center",
                         fontsize=8, color="#555555")

        samples = np.arange(n_samples)
        self.top.axvspan(centers[byte] - 1.5, centers[byte] + 1.5,
                         color="#e07b39", alpha=0.18, linewidth=0,
                         label="S-box del byte atacado")
        self.wrong_lines = [
            self.top.plot(samples, np.zeros(n_samples), color="#b0b0b0",
                          linewidth=0.5, alpha=0.5)[0]
            for _ in range(attacks.N_CANDIDATES - 1)
        ]
        self.correct_line, = self.top.plot(
            samples, np.zeros(n_samples), color="#1b6ca8", linewidth=1.6,
            label=f"candidato correcto (0x{correct:02x})",
        )
        self.top.set_xlim(0, n_samples - 1)
        self.top.set_ylim(0, 0.5)
        self.top.set_xlabel("muestra dentro de la traza")
        self.top.set_ylabel(r"$|\rho(k, t)|$")
        self.top.legend(loc="upper right", fontsize=8)

        candidates = np.arange(attacks.N_CANDIDATES)
        colors = ["#b0b0b0"] * attacks.N_CANDIDATES
        colors[correct] = "#1b6ca8"
        self.bars = self.bottom.bar(candidates, np.zeros(attacks.N_CANDIDATES),
                                    width=1.0, color=colors)
        self.bottom.set_xlim(-1, attacks.N_CANDIDATES)
        self.bottom.set_ylim(0, 0.5)
        self.bottom.set_xlabel("candidato de clave k")
        self.bottom.set_ylabel(r"$\max_t |\rho(k, t)|$")

    def update(self, scores: np.ndarray, n: int, rank: int) -> None:
        """Redibuja con las correlaciones `(256, n_samples)` del byte atacado."""
        values = np.abs(scores)
        others = [k for k in range(attacks.N_CANDIDATES) if k != self.correct]
        for line, k in zip(self.wrong_lines, others):
            line.set_ydata(values[k])
        self.correct_line.set_ydata(values[self.correct])
        peaks = values.max(axis=1)
        for bar, peak in zip(self.bars, peaks):
            bar.set_height(peak)
        top = max(0.1, float(peaks.max()) * 1.15)
        self.top.set_ylim(0, top)
        self.bottom.set_ylim(0, top)
        self.top.set_title(f"Byte {self.byte} de la clave: correlación frente al tiempo, "
                           f"N = {n}")
        self.bottom.set_title(f"Pico por candidato: el correcto está en el puesto {rank}")
        self.figure.canvas.draw_idle()
        self._plt.pause(0.05)

    def hold(self) -> None:
        """Deja la ventana abierta hasta que se cierre."""
        self._plt.ioff()
        self._plt.show()


def main(argv: list[str] | None = None) -> int:
    """Punto de entrada de la línea de órdenes."""
    parser = argparse.ArgumentParser(
        description="Demo en vivo del CPA sobre AES-128 con trazas simuladas.",
    )
    parser.add_argument("--snr", type=float, default=SimulationConfig.snr,
                        help="relación señal-ruido de la fuga (por defecto: %(default)g)")
    parser.add_argument("--traces", type=int, default=SimulationConfig.n_traces,
                        help="número máximo de trazas (por defecto: %(default)d)")
    parser.add_argument("--seed", type=int, default=SimulationConfig.seed,
                        help="semilla de la simulación (por defecto: %(default)d)")
    parser.add_argument("--key", default=SimulationConfig.key.hex(),
                        help="clave de laboratorio en hexadecimal")
    parser.add_argument("--delay", type=float, default=0.4,
                        help="pausa entre pasos, en segundos (por defecto: %(default)g)")
    parser.add_argument("--plot", action="store_true",
                        help="abre una ventana con la correlación de un byte")
    parser.add_argument("--byte", type=int, default=0,
                        help="byte que se dibuja con --plot (por defecto: %(default)d)")
    args = parser.parse_args(argv)

    if not 0 <= args.byte < attacks.N_KEY_BYTES:
        parser.error("--byte debe estar entre 0 y 15")
    try:
        key_bytes = bytes.fromhex(args.key)
        config = SimulationConfig(seed=args.seed, n_traces=args.traces,
                                  key=key_bytes, snr=args.snr)
    except ValueError as error:
        parser.error(str(error))

    color = sys.stdout.isatty()
    campaign = simulate.simulate_traces(config)
    key = campaign.key
    plot = (_LivePlot(config.n_samples, args.byte, int(key[args.byte]),
                      config.first_round_centers) if args.plot else None)

    print(_paint(SIMULATION_NOTICE, _DIM, color))
    print(f"AES-128, CPA sobre HW(SBox(p ⊕ k)) de la 1.ª ronda; "
          f"SNR = {config.snr:g}, {config.n_samples} muestras por traza")
    print(f"clave real:       {' '.join(f'{b:02x}' for b in key)}\n")
    # ρ correcto y ρ falso son medias de los 16 bytes. Con pocas trazas el mejor
    # candidato falso correla más que el bueno: es ruido y baja como 1/√N,
    # mientras que el correcto se queda en el valor que fija la SNR.
    print(f"{'N':>6}  {'clave recuperada':<47}  bytes  ρ correcto  ρ falso  peor puesto")

    # Primer N a partir del cual los 16 bytes se mantienen: el acierto no es
    # monótono con pocas trazas.
    first_full = None
    for n in _checkpoints(config.n_traces):
        started = time.perf_counter()
        scores = attacks.cpa_scores(campaign.traces[:n], campaign.plaintexts[:n])
        recovered = attacks.winning_key(scores)
        elapsed = time.perf_counter() - started

        ranks = statistics.ranks_of(scores, key.astype(np.intp))
        hits = int((recovered == key).sum())
        peaks = np.abs(scores).max(axis=2)                       # (16, 256)
        correct_peaks = peaks[np.arange(16), key]
        wrong_peaks = np.where(np.arange(256) == key[:, None], 0.0, peaks).max(axis=1)
        if hits < 16:
            first_full = None
        elif first_full is None:
            first_full = n
        print(f"{n:>6}  {_key_line(recovered, key, color)}  {hits:>2}/16  "
              f"{correct_peaks.mean():>10.3f}  {wrong_peaks.mean():>7.3f}  "
              f"{int(ranks.max()):>11}"
              + _paint(f"  ({elapsed * 1000:.0f} ms)", _DIM, color))
        if plot is not None:
            plot.update(scores[args.byte], n, int(ranks[args.byte]))
        time.sleep(args.delay)

    print()
    if first_full is not None:
        print(_paint(f"Clave completa (128 bits) desde {first_full} trazas.",
                     _BOLD, color))
    else:
        print(f"Con {config.n_traces} trazas no se recuperan los 16 bytes: "
              f"hacen falta más trazas o menos ruido.")
    print(_paint(f"Recordatorio: {SIMULATION_NOTICE}. El montaje real aún no existe.",
                 _DIM, color))
    if plot is not None:
        plot.hold()
    return 0


if __name__ == "__main__":
    sys.exit(main())
