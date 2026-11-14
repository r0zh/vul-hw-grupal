# Web explicativa del CPA

Página que explica desde cero el ataque CPA sobre AES-128, pensada para leerse de principio a
fin: prosa corta, una figura interactiva por idea y, junto a cada figura, una caja «Prueba esto»
cuyos pasos se ejecutan con un botón. Se publica con GitHub Pages en
<https://r0zh.github.io/vul-hw-grupal/> desde `main` (workflow
[`web.yml`](../.github/workflows/web.yml)).

HTML, CSS y módulos ES, sin dependencias ni paso de build. Todas las rutas son relativas, porque
Pages sirve el sitio bajo `/vul-hw-grupal/` y no en la raíz, y todo lo que la página necesita
está dentro de `web/`, que es lo único que se publica.

## Datos simulados y medidas reales

Cada figura lleva su etiqueta:

- **Datos simulados:** trazas generadas en el navegador con el modelo de `analisis/simulate.py`.
  Son `<cpa-leak>`, `<cpa-dpa>` y los `<cpa-live>` de las secciones 8, 9 y 11.
- **Medida real:** datos del ChipWhisperer-Nano guardados en `data/`. Son la portada y
  `<cpa-live id="cpa-real">` (400 trazas de la primera ronda), `<cpa-corr>` (las mismas trazas),
  `<cpa-spa>` (traza media del cifrado completo) y `<cpa-curves>` (curvas de éxito).

Los ficheros de `data/` los genera `analisis/reales.py` a partir de las campañas de `datos/`: no
se editan a mano (ver [Datos medidos](#datos-medidos)). Las fotos de `img/` son copias reducidas
de `figuras/nano-*.jpg`.

## Estructura

| Ruta | Qué hay |
|---|---|
| `index.html` | La página: prosa, esquemas en SVG, fotos, las figuras como custom elements, los pasos guiados, las preguntas y el glosario |
| `css/notes.css` | Base tipográfica de interactive-notes, adaptada, con el modo oscuro y las dos disposiciones (ancha y estrecha) |
| `js/kit/` | Núcleo de artifact-kit (`base`, `model`, `controls`, `presets`, `svg`, `tip`) |
| `js/model/aes.js` | AES-128 (FIPS-197): S-box, expansión de clave, cifrado e inversión de la expansión |
| `js/model/sim.js` | Generador de trazas sintéticas, el mismo modelo y parámetros que `analisis/` |
| `js/model/cpa.js` | CPA por estadísticos suficientes, la nube de una casilla (`cloud`) y la carga de campañas en JSON |
| `js/model/dpa.js` | DPA de un bit con los mismos estadísticos que el CPA |
| `js/model/spa.js` | La traza media del cifrado completo: rondas, envolvente para dibujarla y parecido entre rondas |
| `js/components/` | Las figuras (tabla siguiente) y `common.js` |
| `js/page.js` | Lo que no es de ninguna figura: pasos guiados, recorrido del esquema del montaje, navegación por secciones, glosario emergente y preguntas |
| `data/` | Datos medidos en JSON, generados por `analisis/reales.py` |
| `img/` | Fotos de la placa (copias reducidas de `figuras/`) |
| `tests/` | `node --test` sobre los modelos puros y los datos |
| `spec/` | Claims de aprendizaje, comprobados en Chromium real |
| `scripts/` | Harness: `cdp`, `smoke`, `learn` y `visual` (Node ≥ 22 y Chromium) |

| Figura | Qué enseña | Datos |
|---|---|---|
| `<cpa-live compact>` | Portada: la clave saliendo byte a byte al añadir trazas | medidos |
| `<cpa-leak>` | De dónde sale la fuga; con el deslizador de trazas promediadas, cómo el ruido se cancela | simulados |
| `<cpa-sbox>` | AddRoundKey, SubBytes y por qué atacar `p ⊕ k` empata con el complementario | cálculo exacto |
| `<cpa-spa>` | La traza del cifrado completo, con zoom, las diez rondas y la ventana del ataque | medidos |
| `<cpa-dpa>` | El DPA por dentro: dos grupos según un bit, sus medias y la resta; DPA frente a CPA en los 16 bytes | simulados |
| `<cpa-corr>` | Una casilla del CPA: predicción frente a medida, una traza por punto | medidos |
| `<cpa-live>` | El CPA entero: clave, `\|ρ(k, t)\|` y pico por candidato. Con `src`, trazas medidas; con `cm`, contramedidas simuladas | según el caso |
| `<cpa-curves>` | Fracción de ordenaciones con la clave completa frente a `N` | medidos |

## Uso

```sh
cd web
npm run serve      # sirve la raíz del repo: http://localhost:8000/web/
npm test           # modelos y datos: AES, CPA y DPA exactos, simulador, datos medidos (~3 s)
npm run smoke      # la página carga en /web/ y todas las figuras se pintan
npm run learn      # claims de spec/; capturas en web/review/
npm run visual     # recortes, solapes y contraste; informe en web/review/visual/
npm run check      # todo lo anterior (~2 min), lo mismo que ejecuta la CI
```

`npm` solo se usa como lanzador de scripts: no hay `node_modules`. Si Chromium no está en el
`PATH` como `chromium` o `google-chrome`, se indica con `CHROME=/ruta/al/navegador`.
`node scripts/learn.mjs --note=cpa-dpa` pasa los claims de una sola spec.

## Cómo está montada la página

Todo esto se declara en `index.html` con clases y atributos; `js/page.js` solo lo conecta.

**Pasos guiados.** Cada figura con mandos va dentro de un `<div class="guided">` junto a su caja
`<aside class="try">`. Un paso es un `<button class="do">` con `data-fig` (el `id` de la figura)
y `data-set` (un JSON que se pasa a `set()`) o `data-call` y `data-args` (un método de la figura:
`play`, `newKey`, `pick`, `view`). En pantallas de 1180 px o más la caja va en el margen derecho
y acompaña a la figura al desplazar la página; en las demás, justo encima. Los claims de `spec/`
pulsan estos mismos botones (`step()` en `spec/helpers.mjs`), así que lo que promete un paso se
comprueba por el mismo camino que sigue el lector.

**Glosario.** Las definiciones están una sola vez, en la lista `<dl class="glossary">` del final.
Un término se enlaza con `<a class="term" href="#g-traza">` y enseña su definición al pasar por
encima, al recibir el foco o al tocarlo.

**Preguntas rápidas e ideas clave.** Una pregunta es un `<div class="quiz">` con tres botones:
`data-ok="1"` en el correcto y la explicación de cada uno en `data-why`. La idea clave de una
sección es un `<p class="key">`.

**Esquemas.** Son SVG escritos en la página (`figure.diag`), con `<title>` y `<desc>`. En el del
montaje, los elementos con `data-step` se resaltan al pasar por el paso correspondiente de la
lista `ol.flow`.

**Navegación.** Los puntos del margen izquierdo y la barra de progreso salen de los `<h2 id>`.

**Pantallas estrechas.** Por debajo de 560 px las figuras dibujan en un lienzo de 420 unidades en
lugar de 720 (`plotWidth()` en `components/common.js`), para que el texto de las gráficas no se
encoja al escalar el SVG, y los esquemas se desplazan de lado en vez de reducirse.

## Los modelos en JavaScript

La simulación reproduce la de Python con los parámetros de `analisis/config.py` (núcleo
`(0,5, 1,0, 0,5)`, ventanas en `15 + 2j` y `60 + 2j`, offset y deriva al 40 % y al 5 % de σ,
semilla `20261018`). La secuencia de numpy no se puede reproducir, así que la equivalencia
se comprueba con estadística en `tests/sim.test.js`:

- la varianza del ruido es σ² en todas las muestras;
- con 20 000 trazas, el pico medio del correcto es `√(SNR/(1+SNR))` (±0,01) con SNR = 2 y 0,1;
- con SNR = 0,1 y 20 claves, la mediana de trazas para los 16 bytes y el punto del 90 % caen
  en 413 y 578, los mismos puntos de control que la tabla 4.1 de la memoria (se acepta un
  factor 1,5).

Dos diferencias deliberadas con Python: la desviación típica de la fuga se toma como
`g_1·√2` (con textos uniformes, `Var(HW) = 2`) en lugar de estimarla, y cada traza consume
siempre los mismos números aleatorios, de modo que las `n` primeras trazas no dependen de
cuántas se generen.

El CPA no guarda las trazas: acumula, por byte y valor del texto claro, el número de trazas
y su suma. Las sumas sobre los 256 valores son convoluciones XOR y se calculan con la
transformada de Walsh-Hadamard, así que el ataque a los 16 bytes cuesta unos 10 ms con
cualquier `N`. `tests/cpa.test.js` comprueba que coincide con la correlación directa
(error < 1e-9). El DPA usa los mismos estadísticos y la misma transformada, con el bit elegido
de la S-box como función de selección; `tests/dpa.test.js` lo compara con la resta de medias
hecha traza a traza.

## Contramedidas simuladas

`<cpa-live cm="none" nmax="20000">` añade un selector de contramedida y sube el tope de trazas.
`simulate({ cm })` admite `'shuffle'` (SubBytes en un orden aleatorio por traza) y `'delay'`
(retardos de 0 a `DELAY_MAX` = 3 muestras antes de cada byte, acumulados como `CM_DELAY` en
`firmware/contramedida/aes-cm.c`). Sus números aleatorios salen de un generador aparte, así que
con `cm = 'none'` las trazas son las de siempre. Python no simula contramedidas: las cifras de
la memoria (sección 4.4) son medidas. `tests/sim.test.js` y `spec/cpa-cm.mjs` fijan lo que la
figura tiene que enseñar: el barajado tumba el CPA con 500 trazas y lo deja volver con 10 000, y
los retardos castigan más al byte 15 que al 0.

## Datos medidos

Los tres ficheros de `data/` salen de `analisis/reales.py`. Para rehacerlos sin repetir el
análisis completo (lee las campañas de `datos/` y las curvas de `analisis/salida/reales.json`):

```sh
uv run python -m analisis.reales --solo-web
```

| Fichero | Qué es | Origen |
|---|---|---|
| `nano-tinyaes.json` | 400 trazas, muestras 440 a 740 (el SubBytes de la primera ronda), textos claros y clave de laboratorio. Las trazas van como códigos enteros del convertidor: la correlación no cambia con una transformación afín | `datos/20261113-nano-tinyaes-respaldo` |
| `nano-spa.json` | Traza media de 100 cifrados completos (11 000 muestras, en décimas de código), correlación de cada muestra con un valor de la primera ronda y de la última (en milésimas) y los números de las rondas: periodo, inicio y fin | `datos/20261113-spa` |
| `nano-curvas.json` | Curvas de éxito frente a `N` de la víctima de NewAE y de las tres variantes de la contramedida, sobre 100 ordenaciones | `analisis/salida/reales.json` |

`<cpa-live src="ruta/campana.json">` y `<cpa-corr src=…>` aceptan cualquier campaña con el formato
de trazas de `AGENTS.md`: `traces` (N × S), `plaintexts` (N × 16, listas o hex) y, si se conoce,
`key`. Sin clave, `<cpa-live>` enseña el candidato elegido de cada byte pero no su puesto ni si
acierta.

## Qué comprueba `npm run check`

- **`tests/`** (Node): que los modelos son exactos y que los datos de `data/` dicen lo que la
  página afirma de ellos. `curves.test.js` coteja además las curvas y los números de las
  medidas que el texto de `index.html` escribe a mano con las macros de
  `memoria/capitulos/generado/reales.tex`: si la web y la memoria dejan de decir lo mismo, falla.
- **`spec/`** (navegador): un claim por cosa que el lector tiene que poder ver. Los pasos de
  cada caja «Prueba esto» se ejecutan pulsando sus botones, y `pagina.mjs` comprueba la portada,
  el glosario, las preguntas, la navegación y que no haya ids repetidos.
- **`scripts/visual.mjs`**: recortes, texto solapado o que cruza el borde de una caja y contraste,
  en cada figura y en cada estado de sus mandos, a 1366 px.

La CI usa las fuentes del runner (DejaVu Sans), más anchas que las de un escritorio corriente.
Si un fallo de `visual` solo sale allí, se reproduce en local lanzando el check con
`FONTCONFIG_FILE` apuntando a un `fonts.conf` que solo vea DejaVu y Liberation.

## Procedencia

El núcleo de `js/kit/`, `css/notes.css`, `scripts/` y `spec/helpers.mjs` vienen de
`interactive-notes`, código propio del autor del repositorio (`artifact-kit/src/` es una
reimplementación *clean-room*). No se ha copiado nada de `artifact-kit/vendor/` ni de
`artifact-kit/from-source/`, ni nada que dependa de ellos.
