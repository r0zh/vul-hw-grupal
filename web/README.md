# Web explicativa del CPA

Página que explica desde cero el ataque CPA sobre AES-128, con figuras interactivas.
Se publica con GitHub Pages en <https://r0zh.github.io/vul-hw-grupal/> desde `main`
(workflow [`web.yml`](../.github/workflows/web.yml)).

**Todas las figuras usan trazas simuladas** con el modelo de `analisis/simulate.py`, y lo
indican con la etiqueta «Datos simulados». No hay medidas del montaje todavía.

HTML, CSS y módulos ES, sin dependencias ni paso de build. Todas las rutas son relativas,
porque Pages sirve el sitio bajo `/vul-hw-grupal/` y no en la raíz.

## Estructura

| Ruta | Qué hay |
|---|---|
| `index.html` | La página: prosa, diagramas y las figuras como custom elements |
| `css/notes.css` | Base tipográfica de interactive-notes, adaptada, con el modo oscuro |
| `js/kit/` | Núcleo de artifact-kit (`base`, `model`, `controls`, `presets`, `svg`, `tip`) |
| `js/model/aes.js` | AES-128 (FIPS-197): S-box, expansión de clave, cifrado e inversión de la expansión |
| `js/model/sim.js` | Generador de trazas sintéticas, el mismo modelo y parámetros que `analisis/` |
| `js/model/cpa.js` | CPA por estadísticos suficientes y carga de campañas reales en JSON |
| `js/components/` | `<cpa-live>` (el CPA en directo), `<cpa-leak>` (de dónde sale la fuga) y `<cpa-sbox>` (AddRoundKey, SubBytes y por qué se ataca la salida de la S-box) |
| `tests/` | `node --test` sobre los modelos puros |
| `spec/` | Claims de aprendizaje, comprobados en Chromium real |
| `scripts/` | Harness: `cdp`, `smoke`, `learn` y `visual` (Node ≥ 22 y Chromium) |

## Uso

```sh
cd web
npm run serve      # sirve la raíz del repo: http://localhost:8000/web/
npm test           # modelos: AES, CPA exacto, S-box frente a XOR, contraste con Python (~2 s)
npm run smoke      # la página carga en /web/ y las figuras se pintan
npm run learn      # claims de spec/; capturas en web/review/
npm run visual     # recortes, solapes y contraste; informe en web/review/visual/
npm run check      # todo lo anterior (~45 s), lo mismo que ejecuta la CI
```

`npm` solo se usa como lanzador de scripts: no hay `node_modules`. Si Chromium no está en el
`PATH` como `chromium` o `google-chrome`, se indica con `CHROME=/ruta/al/navegador`.

## El modelo en JavaScript

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
(error < 1e-9).

## Trazas reales (fase 5)

`<cpa-live src="ruta/campana.json">` carga una campaña en lugar de simularla. El JSON sigue
el formato de trazas de `AGENTS.md`: `traces` (N × S), `plaintexts` (N × 16, listas o hex) y,
si se conoce, `key`. Sin clave, la figura enseña el candidato elegido de cada byte pero no su
puesto ni si acierta.

## Procedencia

El núcleo de `js/kit/`, `css/notes.css`, `scripts/` y `spec/helpers.mjs` vienen de
`interactive-notes`, código propio del autor del repositorio (`artifact-kit/src/` es una
reimplementación *clean-room*). No se ha copiado nada de `artifact-kit/vendor/` ni de
`artifact-kit/from-source/`, ni nada que dependa de ellos.
