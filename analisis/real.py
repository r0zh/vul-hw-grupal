"""CPA sobre una campaña guardada (trazas del ChipWhisperer o simuladas).

    uv run python -m analisis.real datos/brutos/20261110-120000-nano
    uv run python -m analisis.real <campaña> --ventana 0:2000 --pasos 25,50,100,200

Imprime la clave recuperada, el rango y la correlación del candidato correcto
de cada byte, y el número de trazas a partir del cual cada byte queda en rango
1 de forma estable. Guarda las figuras en `analisis/salida/<campaña>/` (no en
`figuras/`: se copian allí solo cuando se decida qué campaña va a la memoria).

La clave real del JSON solo se usa para medir rangos; el ataque no la ve.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np

from captura import campana

from . import attacks, statistics

OUTPUT = Path(__file__).resolve().parent / "salida"


def _checkpoints(n: int, requested: str | None) -> list[int]:
    if requested:
        steps = sorted({int(x) for x in requested.split(",") if int(x) <= n})
    else:
        steps = sorted({int(round(x)) for x in np.geomspace(10, n, 14)})
    return steps if steps and steps[-1] == n else [*steps, n]


def incremental_cpa(traces: np.ndarray, plaintexts: np.ndarray, key: np.ndarray,
                    steps: list[int]) -> tuple[np.ndarray, np.ndarray]:
    """CPA en una pasada con estadísticos suficientes acumulados.

    Da la misma correlación que `attacks.cpa_scores` sobre las primeras `N`
    trazas para cada `N` de `steps`, sin repetir el ataque desde cero en cada
    punto de la curva de rango. Devuelve las puntuaciones con todas las
    trazas, `(16, 256, S)`, y los rangos `(len(steps), 16)`.
    """
    levels = attacks.hamming_weight(attacks.first_round_hypotheses(plaintexts))
    levels = levels.reshape(len(plaintexts), -1).astype(np.float64)   # (n, 4096)
    n_samples = traces.shape[1]
    sum_h = np.zeros(levels.shape[1])
    sum_h2 = np.zeros(levels.shape[1])
    sum_t = np.zeros(n_samples)
    sum_t2 = np.zeros(n_samples)
    sum_ht = np.zeros((levels.shape[1], n_samples))
    ranks = np.empty((len(steps), 16), dtype=int)
    done = 0
    for i, step in enumerate(steps):
        h, t = levels[done:step], traces[done:step]
        sum_h += h.sum(axis=0)
        sum_h2 += (h * h).sum(axis=0)
        sum_t += t.sum(axis=0)
        sum_t2 += (t * t).sum(axis=0)
        sum_ht += h.T @ t
        done = step
        cov = sum_ht - np.outer(sum_h, sum_t) / step
        var_h = sum_h2 - sum_h**2 / step
        var_t = sum_t2 - sum_t**2 / step
        with np.errstate(divide="ignore", invalid="ignore"):
            rho = cov / np.sqrt(np.outer(var_h, var_t))
        scores = np.nan_to_num(rho).reshape(16, 256, n_samples)
        ranks[i] = statistics.ranks_of(scores, key)
    return scores, ranks


def stable_traces(ranks: np.ndarray, steps: list[int]) -> list[int | None]:
    """Primer N a partir del cual el byte queda en rango 1 hasta el final."""
    result = []
    for byte_ranks in ranks.T:
        bad = np.nonzero(byte_ranks != 1)[0]
        if len(bad) == 0:
            result.append(steps[0])
        elif bad[-1] == len(steps) - 1:
            result.append(None)
        else:
            result.append(steps[bad[-1] + 1])
    return result


def _figures(scores, mean_trace, key, steps, ranks, title, tag, out: Path) -> list[Path]:
    os.environ.setdefault("MPLCONFIGDIR", str(OUTPUT.parent.parent / ".matplotlib"))
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out.mkdir(parents=True, exist_ok=True)
    paths = []
    rows = np.arange(16)
    peaks = np.abs(scores)

    fig, (top, bottom) = plt.subplots(2, 1, figsize=(6.3, 4.6), sharex=True)
    top.plot(mean_trace, linewidth=0.6, color="#444")
    top.set_ylabel("traza media")
    top.set_title(title)
    for byte in range(16):
        bottom.plot(peaks[byte, key[byte]], linewidth=0.6, alpha=0.8)
    bottom.plot(np.delete(peaks, key, axis=1).max(axis=(0, 1)), linewidth=0.6,
                color="#b0b0b0", label="mejor candidato falso (todos los bytes)")
    bottom.set_ylabel(r"$|\rho|$ del candidato correcto")
    bottom.set_xlabel("muestra")
    bottom.legend(loc="upper right", fontsize=7)
    fig.text(0.99, 0.01, tag, ha="right", fontsize=7, color="#888")
    paths.append(out / "cpa-correlacion.pdf")
    fig.savefig(paths[-1], bbox_inches="tight")

    fig, axis = plt.subplots(figsize=(6.3, 2.9))
    for byte in range(16):
        axis.plot(steps, ranks[:, byte], linewidth=0.8, marker=".", markersize=3)
    axis.set_xscale("log")
    axis.set_yscale("log")
    axis.set_xlabel("número de trazas $N$")
    axis.set_ylabel("rango del byte correcto")
    axis.set_title("Rango de cada byte de la clave frente a $N$")
    fig.text(0.99, 0.01, tag, ha="right", fontsize=7, color="#888")
    paths.append(out / "cpa-rango.pdf")
    fig.savefig(paths[-1], bbox_inches="tight")

    fig, axis = plt.subplots(figsize=(6.3, 2.6))
    best = peaks.max(axis=2)
    for byte in rows:
        axis.scatter(np.full(256, byte), best[byte], s=2, color="#b0b0b0")
        axis.scatter(byte, best[byte, key[byte]], s=12, color="#1b6ca8")
    axis.set_xlabel("byte de la clave")
    axis.set_ylabel(r"$\max_t |\rho|$ por candidato")
    fig.text(0.99, 0.01, tag, ha="right", fontsize=7, color="#888")
    paths.append(out / "cpa-candidatos.pdf")
    fig.savefig(paths[-1], bbox_inches="tight")
    plt.close("all")
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("campana", type=Path, help="ruta de la campaña, con o sin extensión")
    parser.add_argument("--ventana", help="muestras a usar, p. ej. 0:2000 (por defecto, todas)")
    parser.add_argument("--pasos", help="N para la curva de rango, separados por comas")
    parser.add_argument("--sin-figuras", action="store_true")
    args = parser.parse_args(argv)

    data = campana.load(args.campana)
    traces = data.traces.astype(np.float64)
    if args.ventana:
        start, stop = (int(x) if x else None for x in args.ventana.split(":"))
        traces = traces[:, start:stop]
    key = data.key.astype(np.intp)
    n = traces.shape[0]
    origin = "SIMULADA" if data.simulated else "medida real"
    print(f"Campaña {args.campana.name}: {n} trazas × {traces.shape[1]} muestras ({origin})")

    steps = _checkpoints(n, args.pasos)
    scores, ranks = incremental_cpa(traces, data.plaintexts, key, steps)
    recovered = attacks.winning_key(scores)
    peaks = np.abs(scores)
    best_t = peaks[np.arange(16), key].argmax(axis=1)
    print(f"Clave real:      {bytes(data.key).hex()}")
    print(f"Clave obtenida:  {bytes(recovered.astype(np.uint8)).hex()}")
    print(f"Bytes correctos: {int((recovered == key).sum())}/16\n")

    needed = stable_traces(ranks, steps)

    print("byte  real  obtenido  |ρ| correcto  muestra  rango(N)  trazas para rango 1 estable")
    for byte in range(16):
        print(f"{byte:4d}  {key[byte]:02x}    {recovered[byte]:02x}        "
              f"{peaks[byte, key[byte], best_t[byte]]:.3f}      {best_t[byte]:6d}  "
              f"{ranks[-1, byte]:6d}    {needed[byte] if needed[byte] else '—'}")

    out = OUTPUT / data.metadata.get("nombre", Path(args.campana).with_suffix("").name)
    summary = {
        "campana": str(args.campana),
        "simulada": data.simulated,
        "n_traces": n,
        "ventana": args.ventana,
        "clave_obtenida": bytes(recovered.astype(np.uint8)).hex(),
        "bytes_correctos": int((recovered == key).sum()),
        "pasos": steps,
        "rangos": ranks.tolist(),
        "trazas_rango1_estable": needed,
        "pico_correcto": [float(peaks[b, key[b], best_t[b]]) for b in range(16)],
        "muestra_pico": best_t.tolist(),
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "resumen.json").write_text(json.dumps(summary, indent=2) + "\n")
    if not args.sin_figuras:
        tag = "Datos simulados" if data.simulated else f"Medida: {data.metadata.get('instrumento', {}).get('tipo', '?')}"
        title = f"CPA sobre {n} trazas ({origin})"
        mean = traces.mean(axis=0)
        for path in _figures(scores, mean, key, steps, ranks, title, tag, out):
            print(f"Figura: {path.relative_to(OUTPUT.parent.parent)}")
    print(f"Resumen: {(out / 'resumen.json').relative_to(OUTPUT.parent.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
