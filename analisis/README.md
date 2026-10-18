# Análisis del ataque (fase 1: validación en simulación)

Código del análisis CPA/DPA sobre AES-128. **Todo lo que produce este paquete
son datos simulados**: trazas sintéticas generadas con el modelo de fuga del
peso de Hamming y ruido gaussiano. No hay ninguna medida real todavía (eso son
las fases 2 a 5 del plan de `AGENTS.md`).

## Qué hay aquí

| Fichero | Qué hace |
|---|---|
| `aes.py` | AES-128 de referencia (FIPS-197), versión directa y vectorizada con numpy |
| `simulate.py` | Generación de trazas sintéticas: fuga del peso de Hamming, ruido, deriva y offset por traza |
| `attacks.py` | CPA (peso de Hamming), DPA (partición por un bit) y utilidades de detección |
| `statistics.py` | Correlación de Pearson, picos, rangos y márgenes |
| `experiments.py` | Campaña de referencia, barrido de ruido y comparación DPA/CPA |
| `figures.py` | Figuras en PDF vectorial para `figuras/` |
| `config.py` | Todos los parámetros de la simulación y de los experimentos |
| `run_all.py` | Regenera los resultados y todas las figuras |
| `demo.py` | Demo en vivo: la clave aparece byte a byte al crecer N (no escribe ficheros) |
| `tests.py` | Comprobaciones rápidas (AES, ataque sin ruido, utilidades) |

## Reproducir todo desde cero

Requisitos: [`uv`](https://docs.astral.sh/uv/) y Python 3.11 o superior (lo
instala `uv` si hace falta). No hay que crear el entorno a mano.

```sh
# 1. Dependencias (numpy y matplotlib) en .venv
uv sync

# 2. Comprobaciones rápidas: vectores de AES, ataque sin ruido, SNR, utilidades
uv run python -m analisis.tests

# 3. Análisis completo y figuras (tarda unos 10 minutos)
uv run python -m analisis.run_all
```

El paso 3 deja:

- las figuras en [`figuras/`](../figuras/) como PDF vectorial;
- los números en `analisis/salida/resultados.json` (no se sube al repositorio:
  se regenera y lleva la semilla y todos los parámetros dentro).

Opciones útiles de `run_all`:

```sh
uv run python -m analisis.run_all --fast       # versión de humo, segundos
uv run python -m analisis.run_all --no-sweep   # todo menos el barrido de ruido
uv run python -m analisis.run_all --figuras /tmp/f --resultados /tmp/r.json
```

Si el sistema de ficheros es restringido (por ejemplo, un entorno en el que no
se puede escribir en `$HOME`), exportar el caché de `uv` dentro del repositorio:

```sh
UV_CACHE_DIR=$PWD/.uv-cache uv run python -m analisis.run_all
```

La semilla y el resto de parámetros están en `analisis/config.py`. Con los
mismos parámetros la salida es idéntica byte a byte: los números del JSON no
dependen del reloj y las figuras se guardan con la fecha del PDF fija
(`figures.PDF_DATE`), así que dos ejecuciones producen el mismo fichero. La CI
lo comprueba ejecutando el análisis dos veces y comparando los resultados y las
figuras.

Lo único que cambia entre ejecuciones es el campo `seconds` del JSON (y los
`seconds` por ataque), que es el tiempo que ha tardado cada parte.

## Demo en vivo

Pensada para enseñar el ataque, no para producir resultados: no escribe ningún
fichero y los números de la memoria salen de `run_all`.

```sh
uv run python -m analisis.demo                  # terminal, SNR = 0,1
uv run python -m analisis.demo --snr 0.02       # más ruido: hacen falta más trazas
uv run python -m analisis.demo --plot --byte 5  # además, ventana con ρ(t) de un byte
```

Cada fila es un CPA completo sobre las primeras `N` trazas: la clave recuperada
(en verde los bytes acertados), la media de `max_t |ρ|` del candidato correcto
y del mejor falso, y el peor puesto del byte correcto. Con la semilla fija y
SNR = 0,1, los 16 bytes se mantienen desde 500 trazas.

`--plot` necesita un backend de matplotlib con ventana. Con algunas versiones
del Python que instala `uv`, el de Tk no carga; se arregla con
`uv python upgrade --reinstall`.

## Qué se simula y qué se mide

El modelo de una traza, en unidades arbitrarias, es

```
T_i[t] = b_i + d_i·s[t] + w_i[t]
       + Σ_j g_1  · HW(SBox(p_ij ⊕ k_j)) · h[t − t1_j]     (primera ronda)
       + Σ_j g_10 · HW(x_ij)             · h[t − t10_j]    (última ronda)
```

- `SBox(p_j ⊕ k_j)`: salida de la S-box de la primera ronda, el valor
  intermedio que ataca el CPA según `AGENTS.md`.
- `x_j`: entrada de la S-box de la última ronda en la posición de estado `j`.
  Depende de la **subclave 10**, no de la clave maestra: el CPA sobre la última
  ronda (`target="last"`, hipótesis `InvSBox(c ⊕ K10)`) recupera `K10` y la
  clave maestra sale de `aes.invert_key_schedule`. Su amplitud es
  `last_round_gain` (0,8 por defecto).
- `h` es un núcleo `(0,5 · 1,0 · 0,5)`: cada byte del estado ocupa su propia
  ventana temporal, separadas dos muestras, como cabría esperar de un recorrido
  byte a byte del estado en el ATmega328P.
- `b_i` (offset por traza), `d_i·s[t]` (deriva lenta) y `w_i[t]` (ruido blanco)
  forman el ruido. El offset es constante dentro de una traza pero cambia de
  una a otra, y la correlación se calcula entre trazas en cada instante: para
  el CPA es ruido, no algo que Pearson elimine.
- La relación señal-ruido se define sobre la fuga de la primera ronda y sobre
  el ruido total de un instante: `SNR = Var(g_1 · HW(SBox(p ⊕ k))) / σ²`. El
  offset y la deriva son fracciones fijas de `σ` (`trace_offset_ratio = 0,4`,
  `trace_drift_ratio = 0,05`) y el ruido blanco pone el resto, así que la
  varianza del ruido es `σ²` en todas las muestras. La varianza de la fuga se
  calcula dentro de cada byte y se promedia entre los 16
  (`pooled_signal_std`). Con esta convención, el pico esperado del candidato
  correcto es `sqrt(SNR/(1+SNR))`, y `tests.py` lo comprueba.

**Nada de esto describe el montaje real.** Parámetros como el número de
muestras, la separación entre ventanas o el ruido son hipótesis de trabajo que
habrá que contrastar con las medidas de las fases 3 y 4.

## Figuras

Cada figura sale de una función de `figures.py` y se puede regenerar sola:

| Figura | Función | Qué muestra |
|---|---|---|
| `sim-trazas.pdf` | `figure_synthetic_traces` | Trazas sintéticas y ventanas de fuga |
| `sim-cpa-correlacion.pdf` | `figure_correlation_over_time` | `ρ` frente al tiempo: correcta vs. mejor falsa |
| `sim-rango.pdf` | `figure_rank_curve` | Rango del byte correcto y aciertos frente a `N` |
| `sim-ruido.pdf` | `figure_noise_scaling` | Pico del correcto y del mejor falso frente a `N`; trazas necesarias |
| `sim-dpa-cpa.pdf` | `figure_dpa_vs_cpa` | DPA por bit frente a CPA |
| `sim-candidatos.pdf` | `figure_peaks_per_candidate` | Pico de los 256 candidatos y puesto del correcto |

Además, `analisis/salida/resultados.json` guarda todos los números que se citan
en la sección 4.1 de la memoria (picos, rangos, trazas necesarias por SNR,
comparación DPA/CPA y los vectores de AES comprobados).

Todas llevan la etiqueta «Datos simulados (sin medidas reales)» dentro del
propio PDF. No se retocan a mano.
