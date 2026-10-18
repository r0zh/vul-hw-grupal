# Handoff: web explicativa con componentes interactivos

Encargo para la sesión o el agente que construya la web. Leer antes
[`AGENTS.md`](../AGENTS.md): sus reglas (no inventar resultados ni referencias,
el hardware es hipótesis, idioma) se aplican igual aquí.

## 1. Objetivo

Una página HTML que explique **desde cero** el ataque CPA sobre AES-128 a los
compañeros del grupo, con componentes interactivos, desplegada con GitHub Pages
desde este repositorio en <https://r0zh.github.io/vul-hw-grupal/>.

- **Público:** estudiantes de informática que conocen AES de oídas y no han
  visto nunca un ataque de canal lateral. Al terminar deberían poder explicar
  por qué el consumo filtra la clave, qué calcula el CPA y qué necesita
  nuestro montaje para que funcione.
- **Uso secundario:** demo en directo durante la presentación (la rúbrica da
  2,5 puntos a «interés y participación»). El entregable sigue siendo un PDF.
- **Más adelante:** la misma figura del CPA debe poder cargar trazas reales
  (fase 5), para enseñar primero la simulación y luego la medida.

## 2. Restricciones

1. **Licencia.** El repo es público. De `~/Programacion/random/interactive-notes`
   **no** se copia nada de `artifact-kit/vendor/`, `artifact-kit/from-source/`
   ni nada que dependa de ellos (`study.css`, `pages.css`,
   `from-source/src/theme.js`, la nota `notes/vh-2026-09-28/`): derivan de
   ezyang/scaling-deepseek-v3, que no tiene licencia, y el permiso es solo para
   uso personal (`PROVENANCE.md` de ese repo).
2. **Reutilizable** (código propio del autor del repo, comprobar la cabecera de
   cada fichero al copiarlo):
   - `artifact-kit/src/` (`base.js`, `model.js`, `controls.js`, `presets.js`,
     `svg.js`, `tip.js`, `fmt.js`, `theme.js`, `state.js`) y
     `artifact-kit/templates/`: reimplementación *clean-room* según
     `artifact-kit/README.md`.
   - `artifact-kit/components/manim-player.js` y su contrato
     (`artifact-kit/components/README.md`).
   - `notes.css` como base tipográfica.
   - El harness: `scripts/cdp.mjs`, `smoke.mjs`, `learn.mjs`, `visual.mjs` y
     `spec/helpers.mjs` (Node ≥ 22 y Chromium, sin dependencias).
   - La regla de decisión de figuras de su `HANDOFF.md`, §3.
3. **Cero dependencias y sin build.** HTML, CSS y módulos ES. Todo con rutas
   relativas: Pages sirve el sitio bajo `/vul-hw-grupal/`, no en la raíz.
4. **Datos simulados marcados.** Toda figura con trazas sintéticas lleva la
   etiqueta «Datos simulados», igual que las de `figuras/`.
5. **Citas.** Solo entradas de `memoria/referencias.bib`, con el mismo formato
   IEEE de la memoria. Lo que no tenga fuente no se afirma.
6. **El hardware es hipótesis.** La sección del montaje describe lo previsto
   (`hardware/README.md`), no lo que funciona.

## 3. Estructura propuesta

```
web/
  index.html            la página: prosa + figuras como custom elements
  css/notes.css         base de interactive-notes, adaptada
  js/kit/               copia de artifact-kit/src (lo que se use)
  js/model/aes.js       AES-128 (S-box, cifrado, expansión de clave)
  js/model/sim.js       generador de trazas sintéticas
  js/model/cpa.js       CPA por estadísticos suficientes (§5)
  js/components/*.js    un custom element por figura
  assets/               MP4/PNG de Manim (si se hacen)
  tests/*.test.js       node --test sobre los modelos puros
  spec/*.mjs            claims de aprendizaje (navegador real)
  scripts/              harness copiado de interactive-notes
  package.json          solo scripts (test, smoke, learn, visual, check)
```

Al crear `web/` hay que añadirlo a la estructura de `AGENTS.md`.

## 4. Guion de contenido

Una sección por idea, en este orden. La columna «figura» aplica la regla de
interactive-notes: **componente** si el lector manipula algo, **Manim** si es un
proceso en el tiempo, **diagrama** si hay que situar piezas. Si una frase lo
explica mejor, no se pone figura.

| # | Sección | Qué tiene que quedar claro | Figura |
|---|---|---|---|
| 1 | Qué vamos a hacer | Recuperar una clave de laboratorio midiendo el consumo de un ATmega328P. AES no se rompe: se explota una implementación. Ámbito ético. | — |
| 2 | Por qué el consumo filtra datos | En CMOS el consumo depende de los bits que cambian o se cargan; el peso de Hamming es un modelo aproximado de eso. | Componente: **`cpa-leak`** (§6) |
| 3 | Lo justo de AES | Solo hace falta la primera ronda: `AddRoundKey` y `SubBytes`. El valor atacado es `SBox(p ⊕ k)`. | Manim o SVG: el byte de texto claro pasa por XOR y S-box |
| 4 | Divide y vencerás | 2¹²⁸ claves es imposible; 16 × 256 hipótesis es trivial, porque cada byte se ataca por separado. | Frase + número |
| 5 | SPA | Una traza sola ya enseña las 10 rondas; sirve para saber dónde mirar. | — (sin trazas reales todavía; `% TODO` hasta fase 4) |
| 6 | DPA | Separar trazas por un bit y restar medias. Antecedente histórico [kocher1999dpa]. | Componente opcional: medias por clase |
| 7 | CPA | Correlación de Pearson entre la predicción `HW(SBox(p ⊕ k))` y cada instante de la traza; gana el candidato con mayor pico [brier2004cpa]. | Componente: **`cpa-live`** (§6) |
| 8 | Ruido y número de trazas | El pico del candidato correcto **no crece** con N; lo que baja es el ruido de los candidatos falsos (≈ 1/√N). Por eso N crece como 1/SNR. | Componente: **`cpa-live`** con presets de SNR |
| 9 | Nuestro montaje | PC → serie → ATmega328P con shunt → osciloscopio con trigger. Qué puede fallar (muestreo, sincronización, desacoplo). | Diagrama (ASCII de `hardware/README.md`) |
| 10 | Resultados hasta ahora | Solo los de la simulación (sección 4.1 de la memoria), con la etiqueta. | Tabla |
| 11 | Contramedidas | Masking, shuffling, ruido; ninguna es garantía absoluta (`AGENTS.md`, regla 5). | Componente opcional: shuffling degrada el pico |
| 12 | Referencias | Las de la bibliografía de la memoria. | — |

## 5. Modelo en JavaScript

### Simulación

Replicar el modelo de `analisis/simulate.py` con los parámetros de
`analisis/config.py`. No se puede reproducir la secuencia de numpy, así que la
equivalencia se comprueba con estadística (§8), no valor a valor.

```
T_i[t] = b_i + d_i[t] + n_i[t] + Σ_j g_1 · HW(SBox(p_ij ⊕ k_j)) · ker[t − (15 + 2j)]
b_i ~ N(0, 2.0)                       offset por traza
d_i[t] = N(0, 0,05·σ) · sin(2π·0,35·t/96)
n_i[t] ~ N(0, σ²),  σ = std_pooled(g_1·HW) / √SNR
ker = (0,5, 1,0, 0,5),  96 muestras,  g_1 = 1,0
```

- `std_pooled` es la desviación típica de la fuga dentro de cada byte,
  promediada entre los 16. Con textos uniformes, `Var(HW) = 2` y vale √2 de
  forma analítica. Se puede usar ese valor y documentarlo.
- PRNG con semilla (por ejemplo xoshiro128** o mulberry32 + Box-Muller) y
  semilla por defecto `20261018`, para que la página sea determinista.
- **No copiar la fuga de la última ronda de `simulate.py`.** Usa
  `InvSBox(c ⊕ k)` con la clave maestra, que no es un valor intermedio real de
  AES: la última ronda usa la subclave 10. Hay que corregirlo primero en Python
  (está pendiente). En la web basta con la primera ronda.

### CPA por estadísticos suficientes

No hace falta guardar las trazas para calcular la correlación. Por cada byte
`j` se acumula, para cada valor `v` del texto claro:

```
c[v]     número de trazas con p_j = v
S[v][t]  suma de esas trazas
```

y, una vez para todas las trazas, `N`, `Σ_t T` y `Σ_t T²`. Para un candidato
`k`, con `h_v = HW(SBox(v ⊕ k))`:

```
Σx = Σ_v c[v]·h_v      Σx² = Σ_v c[v]·h_v²      Σxy[t] = Σ_v h_v·S[v][t]
ρ(k, t) = (N·Σxy − Σx·Σy) / √((N·Σx² − (Σx)²)·(N·Σy² − (Σy)²))
```

Cuesta 256 × 256 × 96 ≈ 6,3 M operaciones por byte **sea cual sea N**, y
añadir trazas es solo acumular. Así los mandos responden en directo y la
animación «entran trazas» sale gratis. Es exacto, no una aproximación: el test
lo compara con la correlación directa.

Para trazas reales, el mismo acumulador se alimenta desde un JSON exportado
del formato de `AGENTS.md` (`traces`, `plaintexts`, `key` opcional). La
interfaz del modelo tiene que aceptar las dos fuentes desde el principio.

## 6. Componentes

Cada uno es un custom element. El modelo va en funciones puras importadas de
`js/model/`, y el estado se expone con atributos `data-*` para los claims.

### `<cpa-live>` (el principal)

- **Mandos:** SNR (presets 1, 0,1, 0,02 y 0,005, más un deslizador
  logarítmico), N (deslizador, y un botón «añadir trazas» que anima de 10 a
  4000), byte atacado (0–15), semilla y botón «nueva clave».
- **Vistas:**
  1. `|ρ(k, t)|` frente a t: 255 candidatos en gris y el correcto en color,
     con la ventana de la S-box sombreada.
  2. Pico por candidato (256 barras) con el correcto resaltado y su puesto.
  3. La clave de 16 bytes rellenándose: verde si acierta, rojo si no.
  4. Opcional: la banda de ruido ≈ 4/√N sobre la vista 2, para ver cómo baja
     hasta dejar solo al correcto por encima.
- **Hooks:** `data-n`, `data-snr`, `data-byte`, `data-rank`,
  `data-recovered` (número de bytes) y `data-rendered`.
- **Claims (`spec/`):**
  - con SNR = 1 y N = 4000, `data-recovered = 16`;
  - con SNR = 0,1 y N = 20, el byte 0 no está en el puesto 1;
  - al subir N, la ρ del mejor falso baja y la del correcto no sube de forma
    sistemática;
  - con la misma semilla, el resultado es idéntico tras recargar.

### `<cpa-leak>`

- **Mandos:** byte de texto claro `p` y de clave `k` (0–255, en hexadecimal).
- **Vista:** `p ⊕ k` → `SBox(·)` en bits → `HW` → altura de una barra de
  «consumo». Debajo, la traza media de cada clase de HW (0–8) con muchas trazas
  simuladas: las 9 medias quedan ordenadas en el instante de la S-box.
- **Claim:** al cambiar `k` con `p` fijo, el HW mostrado coincide con
  `popcount(SBOX[p ^ k])`.

### Opcionales

- `<cpa-dpa>`: medias por partición de un bit frente al CPA, sobre la misma
  campaña (sección 6 del guion).
- `<cpa-shuffle>`: con *shuffling* del orden de la S-box, el pico se reparte
  entre 16 posiciones y hacen falta muchas más trazas (sección 11).

## 7. Manim y diagramas (segunda fase)

- Manim para el proceso de la sección 3 y, si da tiempo, para «el pico sale del
  ruido» de la sección 8. Setup en `interactive-notes/manim/` (`setup.sh`
  compila pycairo; no instalar con `uv pip install manim` a secas). En el repo
  solo se suben los MP4 y PNG finales a `web/assets/`.
- El diagrama del montaje con el skill `diagram-design` (MIT) o SVG a mano.
- Paleta: la de `notes.css`, no la de `study.css`.

## 8. Verificación

1. `node --test web/tests`:
   - AES contra los vectores del FIPS-197 [nist2023fips197]: clave
     `000102…0f` y texto `00112233445566778899aabbccddeeff` dan
     `69c4e0d86a7b0430d8cdb78070b4c55a`; clave `2b7e1516…4f3c` y texto
     `3243f6a8885a308d313198a2e0370734` dan `3925841d02dc09fbdc118597196a0b32`.
   - CPA por estadísticos suficientes igual a la correlación directa (error
     < 1e-9) sobre una campaña pequeña.
   - Sin ruido, se recupera la clave.
   - Contraste estadístico con Python: con SNR = 0,1, el N mediano para los 16
     bytes, sobre unas 20 claves, del orden del de la tabla 4.1 de la memoria
     (mediana 578, 90 % en 809). Se acepta un factor 1,5. Si se sale, el modelo
     JS no es el de Python.
2. `smoke`, `learn` y `visual` del harness sobre `web/index.html`.
3. A mano: abrir la página servida desde una subruta
   (`python3 -m http.server` en la raíz del repo y entrar en `/web/`), para
   detectar rutas absolutas antes de que lo haga Pages.

## 9. Despliegue con GitHub Pages

- Workflow nuevo `.github/workflows/web.yml`, en push a `main` que toque `web/**`
  y con `workflow_dispatch`:
  1. Job `test`: `node --test` y, si el runner tiene Chromium, `smoke`.
  2. Job `deploy` (necesita `test`): `actions/configure-pages`,
     `actions/upload-pages-artifact` con `path: web` y `actions/deploy-pages`,
     con `permissions: pages: write, id-token: write` y el entorno
     `github-pages`. **Comprobar la versión mayor vigente de cada acción**
     antes de fijarla (el repo ya usa `checkout@v7` y `upload-artifact@v7`).
- Activar Pages con origen «GitHub Actions», una sola vez:
  `gh api -X POST repos/r0zh/vul-hw-grupal/pages -f build_type=workflow`
  (o desde *Settings → Pages*).
- Enlazar la web desde el `README.md` cuando esté publicada.

## 10. Orden de trabajo y definición de terminado

1. Modelos JS y sus tests (§5, §8.1).
2. `<cpa-live>` en una página mínima, con claims.
3. Página completa con el guion (§4) y `<cpa-leak>`.
4. Workflow y Pages (§9). Comprobar la URL publicada.
5. Opcionales: Manim, diagrama, `<cpa-dpa>`, `<cpa-shuffle>`.
6. Fase 5: cargar trazas reales en `<cpa-live>`.

Está terminado cuando la URL pública carga sin errores de consola, `check` pasa
en local y en la CI, todas las figuras simuladas llevan la etiqueta y
`AGENTS.md` recoge la decisión, la carpeta `web/` y el avance en el plan.

## 11. Pendientes que no son de la web

Se encontraron al preparar este handoff y conviene arreglarlos antes, porque
la web cita esos números:

- La sección 4.1 de la memoria, `figures.py` y `experiments.py` hablan de
  «256 bits»: la clave tiene 128.
- La memoria dice que con SNR = 0,1 hacen falta «unas 800 trazas … en la mitad
  de los ensayos»; según su propia tabla, 809 es el 90 % y la mediana es 578.
- `figure_noise_scaling` dibuja `√(N·SNR/(1+N·SNR))` como «correlación
  alcanzable frente a N», y la memoria dice que la correlación crece así. Es
  la correlación de N trazas **promediadas**. En el CPA, el pico del correcto
  se queda en `√(SNR/(1+SNR))` (0,277 medido con SNR = 0,1) y lo que baja con
  N es el umbral de los falsos.
- `simulate.py` y la memoria dicen que la correlación de Pearson elimina el
  offset por traza `b_i`. Elimina un offset común a todas las trazas, pero
  `b_i` cambia de una traza a otra: a efectos del CPA es ruido adicional (la
  propia memoria dice que «rebaja algo la correlación»).
- La fuga y el ataque de la última ronda usan `InvSBox(c ⊕ k)` con la clave
  maestra (§5). El resultado «también se recupera atacando la última ronda»
  es un artefacto de la simulación.
