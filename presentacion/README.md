# Presentación

Presentación oral del trabajo: 23 diapositivas (17 y 6 anexos para las preguntas) que abren con un
juego de monedas ([más abajo](#el-juego-de-las-monedas-diapositiva-2)), con escenas 3D, dos vídeos
path-traced ([más abajo](#vídeos-path-traced)), una demo del ataque en directo y notas del ponente. El
guion del equipo (orden, tiempos, vocabulario y prueba de comprensión) está en
[`NARRATIVA.md`](NARRATIVA.md). HTML, CSS y módulos ES sin paso de build. Three.js 0.187, las fuentes, los sonidos y los
vídeos van en el repositorio ([`vendor/`](vendor/README.md) y [`video/`](video/)), así que funciona sin
red en el aula. La entrega es el PDF que sale de [`scripts/exportar.mjs`](#exportar-el-pdf).

Las cifras medidas no se escriben a mano: cada una lleva su fuente (`data-cifra` para las macros de
`memoria/capitulos/generado/reales.tex`, `data-dato` para `web/data/` y `data-memoria` para el
capítulo), y [`tests/cifras.test.js`](tests/cifras.test.js) las coteja.

## Arranque

Hace falta un servidor: los módulos ES no se cargan desde `file://`. El de la demo sirve la raíz
del repositorio y añade la API de captura:

```sh
uv run python -m captura.vivo --abrir            # http://127.0.0.1:8000/presentacion/
uv run python -m captura.vivo --puerto 8330      # otro puerto
```

La consola dice si ve la placa («Placa: ChipWhisperer-Nano enchufado») o qué falta. Sin ese
servidor, cualquier servidor estático vale (`python3 -m http.server 8000 --bind 127.0.0.1` desde la
raíz del repositorio; sin `--bind` serviría el repositorio a toda la red del aula), pero la demo solo
podrá reproducir las trazas grabadas.

Para proyectar: Google Chrome con la aceleración por hardware activada (las escenas 3D usan WebGL y
los vídeos son H.264, que algunos Chromium de distribución no decodifican), la ventana en el proyector
y **F** para la pantalla completa. El escenario es de 1920×1080 y
se escala a cualquier pantalla.

## Teclas

| Tecla | Qué hace |
|---|---|
| → ↓ AvPág Espacio Intro | Paso siguiente o diapositiva siguiente |
| ← ↑ RePág | Paso anterior; al volver se cae en el último paso de la diapositiva anterior |
| Inicio, Fin | Primera y última diapositiva |
| Número + Intro | Salta a esa diapositiva (los anexos son la 18 a la 23) |
| F | Pantalla completa |
| B o «.» | Pantalla en negro; Esc la quita |
| N | Abre la vista del ponente |

El ratón y la rueda no navegan: sirven para los botones (el juego, la clave, la apuesta, la demo) y
para girar la placa de la portada (la rueda la acerca). Escribiendo en el campo de la clave solo navegan AvPág y RePág, que son las
teclas de los mandos de presentación. La dirección admite `#n` (desde 1) o `#id`
(`index.html#demo`). El botón «Silencio», abajo a la izquierda, activa los cuatro sonidos que hay (al
acertar la moneda, al guardar la palabra, al acertar la apuesta y al recuperar la clave): empiezan apagados y el navegador
recuerda lo que se elija. Los vídeos no tienen sonido.

## Vista del ponente

**N** abre [`notas.html`](notas.html) en otra ventana, que se pone en el portátil mientras la
presentación va al proyector. Se sincroniza sola (`BroadcastChannel`) y enseña la diapositiva y el
paso, las notas, quién presenta y cuánto tiempo tiene (el reparto es una propuesta), la siguiente
diapositiva, la hora y un cronómetro que empieza con la primera navegación, con pausa y reinicio. Sus
flechas, AvPág y RePág también mueven la presentación.

## El juego de las monedas (diapositiva 2)

Abre la charla, antes de cualquier término técnico. Diez monedas de 1 € modeladas en 3D
([`js/escenas/monedas.js`](js/escenas/monedas.js)); una está trucada y sale cara el 60 % de las veces.
La trucada se sortea en cada partida y no la sabe nadie, tampoco el ponente. Las tiradas son simuladas.
Lo monta [`js/figuras/juego-monedas.js`](js/figuras/juego-monedas.js), y se juega con el ratón:

| Control | Qué hace |
|---|---|
| **Tirar** | Una tirada de cada moneda |
| **Seguir tirando** | Tira solo, en tandas cada vez mayores (1, 2, 5, 10, 20… hasta 1000); el botón pasa a **Parar** |
| Tocar una moneda (o su letra) | La marca como la que dice la sala: para las tiradas, congela N y deja solo **Comprobar**. Tocarla otra vez la desmarca |
| **Comprobar** | Revela la trucada y dice «¡Acertado con N tiradas!», «Acertado, pero con suerte: seguía dentro de la franja» o «No era esa: era la X» |
| ↻, arriba a la derecha | Nueva partida: otra trucada, sorteada |

- **La franja azul** es lo que puede hacer el azar con N tiradas (± 1,5/√N, tres desviaciones
  típicas): con pocas tiradas lo cubre todo y con muchas se estrecha hasta que la trucada se sale.
- **Suerte:** acertar con la barra de la trucada aún dentro de la franja no cuenta como «saberlo»: el
  juego dice «Acertado, pero con suerte», sin el sonido de acierto. Con menos de 10 tiradas la franja lo
  cubre todo, así que cualquier acierto es suerte.
- **Teclado:** el juego no tiene atajos. AvPág, RePág, las flechas, Espacio e Intro siguen moviendo la
  presentación, también justo después de pulsar uno de sus botones. Al salir de la diapositiva se paran
  las tiradas y, al volver, la partida sigue donde estaba.
- **Recuerdo:** al comprobar se guarda la partida (`sessionStorage`, claves `juego:n`,
  `juego:acierto` y `juego:suerte`), y «Resultados» la recuerda con
  [`js/figuras/recuerdo.js`](js/figuras/recuerdo.js): «Vosotros: N tiradas · el ataque: unas 100
  trazas», con «, con suerte» o «, sin acertar» si toca. Sin partida, y en el PDF, dice «Las monedas:
  unas 1000 tiradas».
- **PDF:** sale en estático, con la semilla 2026: 1000 tiradas y la G trucada, revelada.
- **Sin WebGL** no se puede jugar: se queda el póster (`img/escenas/monedas-paso0.png`).
- **Para ensayarlo suelto:** [`juego.html`](juego.html) admite `?trucada=0..9&semilla=<entero>` para
  fijar la partida y `&static=1` para ver el estado del PDF.

## La demo (diapositiva 12)

La palabra de la clase se escribe en la diapositiva 3 («Guardar en el chip»): las tildes y las eñes se
quitan solas y se rellena hasta 16 bytes con espacios. La demo la lee al pulsar «Capturar», y el
CPA se hace en un Web Worker sin mirarla: la clave real solo sirve para pintar de verde los bytes
acertados. Al sacar los 16 bytes salta la notificación «Clave recuperada».

| Modo | Trazas | Clave |
|---|---|---|
| **En directo** | Capturadas ahora en el Nano, a unas 18,6 trazas/s, muestras 440 a 740 de cada cifrado | La de la clase |
| **Grabado** | Las primeras 400 de las 1000 trazas de `datos/20261113-nano-tinyaes-respaldo`, reproducidas a 18,6 trazas/s | La de laboratorio (no se puede elegir) |
| **Simulado** | Sintéticas (`analisis/simulate.py`) con SNR 0,5, del orden de la medida (0,52 a 0,71) | La de la clase |

El modo que se usa se ve siempre en la barra de la demo y hay que decirlo en voz alta. «En directo»
solo se puede pulsar si el servidor ve la placa; si no, su botón explica por qué al pasar el ratón.
Una captura nueva cancela la anterior, así que recargar o volver a pulsar «Capturar» nunca deja la
demo bloqueada.

Para ensayar sin el deck, [`demo.html`](demo.html) admite
`?modo=nano|grabado|simulado&ritmo=<trazas/s>&n=<trazas>&static=1`.

### Plan B

1. **La placa no aparece o falla a mitad:** botón «Grabado» y decir que son trazas grabadas el
   13-11-2026 con la clave de laboratorio. Si se quiere la palabra de la clase, «Simulado», diciendo
   que las trazas son simuladas.
2. **El servidor de la demo no arranca:** `python3 -m http.server 8000 --bind 127.0.0.1` desde la
   raíz. La demo reproduce las 400 trazas de `web/data/nano-tinyaes.json` como «Grabado».
3. **Un vídeo no carga** (o el navegador no decodifica H.264): en su sitio se monta la escena Three.js
   de antes, con los mismos pasos y las mismas cifras.
4. **El navegador no tiene WebGL:** los vídeos no lo necesitan. Si además fallan, se quedan sus fotos
   fijas con las etiquetas; cada escena 3D se queda en su póster (`img/escenas/`) y la demo pinta un
   mapa de calor 2D en vez de la montaña.
5. **Falla el portátil:** el PDF exportado y la web, <https://r0zh.github.io/vul-hw-grupal/>.
6. **El juego no arranca** (sin WebGL): se cuenta con su página del PDF y se sigue igual.

## El día de la presentación, con la placa

Antes de clase, en el portátil que irá conectado (detalles en
[`hardware/README.md`](../hardware/README.md)):

1. **Permisos USB:** reglas udev de NewAE instaladas y el usuario en el grupo `chipwhisperer`.
   `lsusb | grep 2b3e` tiene que mostrar el Nano (`2b3e:ace0`).
2. **Entorno:** `uv sync --group captura` (la primera vez tarda unos 4 minutos). En este portátil,
   nunca `uv sync` sin `--group captura`: desinstala `chipwhisperer`, que solo está en ese grupo. Para
   lo demás, `uv run`.
3. **Placa:** `uv run python -m captura.cw info` debe decir `CWNano`.
4. **Firmware, siempre:** `uv run python -m captura.cw programar`, que carga `simpleserial-aes` con
   TinyAES (el SHA-256 del `.hex` está en `hardware/README.md`). Lo último que se programó en la placa
   fue la variante con retardos de la contramedida (`datos/20261113-cm-retardos.json`), y con ella el
   CPA da 0 de 16 bytes. El servidor carga la clave de la clase en cada captura.
5. **Servidor:** `uv run python -m captura.vivo --abrir`; la consola tiene que decir
   «Placa: ChipWhisperer-Nano enchufado».
6. **Captura de prueba** de 400 trazas con una palabra cualquiera. Con las trazas grabadas, el 90 %
   de las ordenaciones da la clave con 112 trazas; en directo debería ser del mismo orden, pero con la
   placa en el aula no se ha probado.
7. **Saturación:** según la errata de NewAE, la fase entre los relojes del ADC y de la víctima cambia
   en cada arranque y con algunas fases las trazas se recortan. El servidor llama a
   `scope.reset_clock_phase()` hasta 5 veces si las trazas salen saturadas y, si no se arregla, lo
   avisa en la barra de la demo. Entonces se desenchufa, se vuelve a enchufar y se repite; si sigue,
   «Grabado».
8. **Ventana de muestras:** la demo pide las muestras 440 a 740 (`VENTANA` en `js/demo.js`), donde la
   fuga de la primera ronda supera |ρ| = 0,6 (de la 463 a la 730 en `web/data/nano-spa.json`). En la montaña, la cresta
   del candidato correcto tiene que salir dentro; si se cambia el firmware o el disparo, hay que
   volver a localizarla.
9. Quitar el USB a mitad de una captura de prueba debe dar un error claro, y al volver a enchufarlo,
   capturar otra vez.

## Ensayo

- Recorrer la presentación con el servidor de la demo y la vista del ponente, cronómetro en marcha.
  El guion está pensado para unos 17 minutos más 3 de demo; qué se recorta primero está en
  [`NARRATIVA.md`](NARRATIVA.md#2-orden-tiempos-y-qué-se-pulsa).
- Jugar el juego entero en el portátil de clase y en el proyector: las monedas solo se han probado con
  WebGL por software.
- Practicar la demo en los tres modos, y el plan B sin la placa enchufada.
- Comprobar las animaciones y los vídeos en el portátil de clase: solo se han probado con WebGL y
  decodificación por software, así que los 60 fps están sin medir.
- Tras tocar una diapositiva: `node --test presentacion/tests/` (cifras con su fuente, pasos, notas y
  poco texto) y, si se toca el servidor, `uv run python -m captura.vivo --comprobar`.

## Vídeos path-traced

Dos diapositivas llevan un vídeo renderizado con Cook, el path tracer de Crucible, en una RTX 3070 de
RunPod. Qué explica cada plano, con qué cámara, luces y datos, está en [`cine/GUION.md`](cine/GUION.md),
y el flujo del pod, en [`cine/pod/LEEME.md`](cine/pod/LEEME.md). Son un modelo, no una foto: los de la
placa llevan el rótulo «Modelo 3D simplificado de la placa CW1101».

| Diapositiva | Vídeo | Módulo | Qué enseña |
|---|---|---|---|
| 1 · Portada | Ninguno: V1 se retiró del deck (su plano sigue en `cine/planos/v1.mjs`) | `js/figuras/placa.js`, la escena 3D en tiempo real | La placa gira sola; arrastrando se le da la vuelta en cualquier dirección, también por debajo, y la rueda la acerca. V1 solo giraba en horizontal |
| 10 · Lo que medimos | `video/v2.mp4` y `video/v2-bucle.mp4`, 1152×724 | `js/figuras/cine-v2.js` | Un trozo por paso: víctima, shunt, ADC, capturador y, en bucle, reloj y señal de inicio |
| 13 · Qué acaba de pasar | `video/v3.mp4`, 1200×826 | `js/figuras/cine-v3.js` | La montaña con las trazas medidas: cada fotograma es un N real, de 5 a 400 |

- **Pasos.** Un paso adelante reproduce su trozo; un paso atrás o un salto enseña el último fotograma
  del paso.
- **Etiquetas.** Son HTML y siguen al fotograma que se ve (`requestVideoFrameCallback`). Sus textos
  van en `index.html`, en `<template data-etiqueta>` con su fuente; las anclas y las cifras de cada
  fotograma, en `video/v2.json` y `video/v3.json`, que escriben los planos con la misma cámara. En
  palabras sencillas: \|ρ\| es el «parecido» y el velo del mejor falso, «lo que puede hacer el azar»,
  como la franja del juego. En la 13, `js/figuras/marcador.js` pone el número de trazas y el puesto del
  correcto con el evento `cine-fotograma` (con empates, «empate con 86 falsos»).
- **Respaldo.** Si un vídeo no carga, su módulo lanza `cine-respaldo` y el motor monta en su sitio la
  escena Three.js de `data-respaldo` (`placa.js` en la 10, con los pasos en el orden del vídeo;
  `por-dentro.js` en la 13), que anuncia las mismas cifras. Sin WebGL se quedan las fotos fijas de
  `img/cine/` con sus etiquetas, igual que con `prefers-reduced-motion` y en el PDF. Las fotos van al
  doble del contenedor, con 512 muestras.
- **Servidor.** Los módulos bajan cada vídeo entero a un Blob: `captura.vivo` y `http.server` no
  atienden peticiones Range, y sin ellas Chrome no puede saltar a un trozo.
- **Codificación.** H.264 en yuv420p con BT.709, 30 fps. V1 llevaba CRF 14 y fotogramas clave cada 10,
  sin fotogramas B, para arrastrarlo sin tirones, y el fondo aplanado a #f5f5f7 antes de codificar.
  V2 y V3 llevan CRF 17 y un fotograma clave al final de cada trozo. En Chrome sin GPU, el fondo de V2
  y V3 sale unos 3 niveles más neutro en el azul que la diapositiva; el fundido de 44 px de los bordes
  lo disimula.
- **Rehacerlos.** Los planos `cine/planos/v1.mjs`, `v2.mjs` y `v3.mjs` llevan en la cabecera sus
  órdenes de render (los de V1 y V2, también las de codificación). `v1.mjs` queda como registro: lo
  que escribe (`video/v1.mp4` e `img/cine/v1-revelado.jpg`) y el `js/figuras/cine-v1.js` que nombra su
  cabecera se retiraron del deck con V1. Sin GPU, `node cine/planos/v2.mjs` comprueba los trozos y el
  bucle, y `node cine/planos/v3.mjs` comprueba las cifras del guion con `web/js/model/cpa.js` y
  reescribe `video/v3.json` (sale idéntico).

Coste medido el 2026-11-23: V1, unos 39 min de GPU; V2, 39 min, y V3, 34 min, unos 0,24 $ de render a
0,13 $/h. Con el piloto y el tiempo del pod encendido sin renderizar, la facturación de RunPod daba
0,40 $ ese día a las 17:25, con el pod aún encendido. El guion estimaba 1,65 $.

## Exportar el PDF

```sh
CHROME=/ruta/a/chrome node presentacion/scripts/exportar.mjs   # [--escala 2] [--solo 4,10] [--borrador]
```

Abre `index.html?estatico` en Chromium sin ventana: sin animaciones, cada diapositiva en su último
paso (o en el de `data-paso-pdf`) y cada escena en modo estático (los vídeos, en su foto fija). Espera
a que todas tengan `data-ready`, deja un PNG por diapositiva en `presentacion/build/png/` y el PDF de
23 páginas, titulado como la presentación, en `presentacion/build/presentacion.pdf` (`build/` está
ignorado por git). Sale con código 1 si la página da errores, si algo se sale del escenario o si una
escena no se monta o no llega a `data-ready`, porque el PDF tendría un hueco; con `--borrador`, esto
último solo avisa. Con WebGL por software tarda menos de un minuto.

## Estructura

| Ruta | Qué hay |
|---|---|
| `index.html` | Las diapositivas, con sus notas (`aside.notas`) y la fuente de cada cifra |
| `NARRATIVA.md` | Guion del equipo: hilo, orden y tiempos, vocabulario, ganchos y prueba de comprensión |
| `notas.html` | Vista del ponente |
| `juego.html`, `demo.html` | El juego de las monedas y la demo sueltos, para ensayar |
| `css/deck.css`, `css/demo.css` | Estilos: tema claro, fondo `#f5f5f7`, superficies blancas y acento `#0071e3` |
| `js/deck.js` | Motor: escenario de 1920×1080, pasos, teclado, montaje de las escenas y canal con las notas |
| `js/paleta.js` | Colores compartidos con las escenas 3D |
| `js/demo.js`, `js/cpa-worker.js` | La demo y su CPA (el de `web/js/model/cpa.js`) |
| `js/escenas/` | Escenas 3D: `monedas` (las diez monedas de 1 € del juego), `placa` (la CW1101), `byte` (XOR, S-box y número de unos), `cascada` (la traza en sus diez rondas) y `montana` (\|ρ(k, t)\| de los 256 candidatos) |
| `js/figuras/` | Lo que monta cada diapositiva: el juego (`juego-monedas.js`), los vídeos (`cine-v2.js` y `cine-v3.js`), la placa 3D (`placa.js`, también la de la portada), las escenas con sus datos y las figuras 2D (nube, curvas, cifras, marcador, clave, apuesta y el recuerdo del juego) |
| `video/` | Los vídeos path-traced V2 y V3, con sus anclas y cifras (unos 9 MB) |
| `img/cine/` | Fotos fijas de los vídeos, al doble del contenedor: respaldo, movimiento reducido y PDF |
| `img/escenas/` | Pósteres de las escenas, 1600×900 |
| `scripts/` | `exportar.mjs` (PDF), `capturas.mjs` (capturas para revisar) y `poster.html` (saca un póster) |
| `tests/` | Cifras frente a la memoria y `web/data`, y estructura de las diapositivas |
| `cine/` | Vídeos path-traced con Cook en una GPU de RunPod: guion, planos, render, codificación y el pod ([`cine/GUION.md`](cine/GUION.md) y [`cine/pod/LEEME.md`](cine/pod/LEEME.md)) |
| `vendor/` | Three.js, fuentes y Cuelume, copiados |

### Escenas y figuras

Cada `.escena[data-modulo]` de `index.html` se importa cuando su diapositiva es la actual o la
siguiente, y cumple el mismo contrato:

```js
const escena = mount(contenedor, { ...dataOpciones, static, step });
// → { steps, start(), stop(), step(n), update?(datos), dispose() }
```

`static: true` dibuja una sola vez (el PDF) y la escena pone `data-ready="1"` en el contenedor tras
su primer dibujo con datos. El motor anota el montaje en `data-montaje` (`lista` o `fallo`). Las
escenas 3D llevan `data-3d` y un `img.poster` de respaldo: se ve hasta que la escena dibuja y se queda
si no hay WebGL o el módulo falla. Sus etiquetas son HTML de 24 px fijos en el escenario. Un vídeo
lleva además `data-respaldo` con la escena que lo sustituye si no carga, y comparte con ella
`data-opciones`.

Si se cambia una escena, se rehacen sus pósteres desde su modo estático:
`/presentacion/scripts/poster.html?m=figuras/spa.js&step=3` (o `?m=escenas/monedas.js&step=0` para el
juego) capturado a 1600×900 con `scripts/capturas.mjs`, esperando a `#escena[data-ready]`.
