# Presentación

Presentación oral del trabajo: 24 diapositivas (18 y 6 anexos para las preguntas) que abren con un
juego de monedas ([más abajo](#el-juego-de-las-monedas-diapositiva-2)), con escenas 3D, dos vídeos
path-traced ([más abajo](#vídeos-path-traced)), una demo del ataque en directo sobre una clave que elige el público desde el móvil
([más abajo](#la-sala-la-clave-la-pone-el-público-diapositiva-3)) y notas del ponente. El
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
uv run python -m captura.vivo --sala --abrir     # con la sala: el público elige la clave con el móvil
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

## La sala: la clave la pone el público (diapositiva 3)

Con `--sala`, la diapositiva 3 enseña un código QR. Cada móvil que lo abre recibe uno de los 16 bytes
de la clave y elige su valor, de 00 a FF. En pantalla solo se ve cuántos han elegido; al pulsar
«Guardar en el chip» el azar pone los bytes que falten y la clave queda para la demo. Nadie la ve
entera: cada persona conoce su byte, y cuando el ataque lo saca del consumo su móvil se pone verde.
En la diapositiva 11 esos mismos móviles apuestan cuántas trazas harán falta.

```sh
sudo pacman -S cloudflared                         # una vez; no hace falta cuenta
uv run python -m captura.vivo --sala --abrir       # abre el túnel y dice la dirección de los móviles
uv run python -m captura.vivo --sala-url http://127.0.0.1:8001/   # ensayo en este equipo, sin túnel
uv run python -m captura.vivo --sala-url https://…  # la dirección de un túnel montado a mano
```

Cómo está hecho, y qué sale a internet:

- Hay **dos servidores**. El de la presentación (puerto 8000) sigue sin salir de `127.0.0.1` y es el
  único que maneja la placa. El del público ([`captura/sala.py`](../captura/sala.py), puerto 8001) es
  el que publica el túnel: sirve una sola página ([`sala.html`](sala.html)) y tres rutas (`estado`,
  `byte` y `apuesta`). No da ficheros, ni la clave, ni los bytes de los demás.
- El **túnel** es un «quick tunnel» de `cloudflared` (`https://<palabras>.trycloudflare.com`), que
  dura lo que el servidor. La dirección cambia en cada arranque, y con ella el QR.
- **No se guardan datos de nadie:** cada móvil lleva un identificador al azar y de él solo se apunta
  su posición, su byte y su apuesta, en memoria, hasta que se para el servidor.
- Los **16 primeros** móviles tienen byte; los demás (hasta 300) miran y apuestan. «Cambiar», en la
  diapositiva 3, empieza otra ronda.
- A un móvil se le avisa cuando su byte lleva tres cálculos seguidos en primer puesto, o al acabar la
  captura. En «Grabado» no se avisa a nadie: esas trazas son de la clave de laboratorio.
- **Sin sala** (sin `--sala`, sin `cloudflared`, sin red o con otro servidor) la diapositiva 3 se
  queda con el formulario de la palabra de la clase, y todo lo demás funciona igual. Con sala, el
  enlace «Sin móviles: una palabra» lleva al mismo formulario.

Lo que cuenta el truco y lo que no: el portátil le pasa la clave al chip, como quien configura un
aparato, y el ataque la lee después de su consumo sin mirarla. No se dice «os hemos adivinado la
clave» sin esa primera mitad.

`uv run python -m captura.vivo --comprobar` prueba la sala entera con móviles de mentira. **El túnel
de verdad no se ha probado** (en el equipo donde se escribió no estaba `cloudflared`): hay que hacerlo
antes de clase, con un móvil con datos y otro en la wifi del aula.

## La demo (diapositiva 12)

La clave sale de la diapositiva 3: la de la sala o, sin ella, la palabra de la clase (las tildes y las
eñes se quitan solas y se rellena hasta 16 bytes con espacios; la de la sala se enseña en hexadecimal).
La demo la lee al pulsar «Capturar», y el
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

1. **La placa no aparece o falla a mitad:** «Simulado», que sí usa la clave de la clase y pone verdes
   los móviles, diciendo que las trazas son simuladas; y después «Grabado», diciendo que son las
   trazas medidas el 13-11-2026 con la clave de laboratorio.
2. **El QR no sale, el túnel se cae o no hay cobertura:** «Sin móviles: una palabra» en la
   diapositiva 3 y la apuesta, a mano alzada. Si el túnel se cae después de guardar la clave, la demo
   funciona igual; solo dejan de ponerse verdes los móviles.
3. **El servidor de la demo no arranca:** `python3 -m http.server 8000 --bind 127.0.0.1` desde la
   raíz. La demo reproduce las 400 trazas de `web/data/nano-tinyaes.json` como «Grabado».
4. **Un vídeo no carga** (o el navegador no decodifica H.264): en su sitio se monta la escena Three.js
   de antes, con los mismos pasos y las mismas cifras.
5. **El navegador no tiene WebGL:** los vídeos no lo necesitan. Si además fallan, se quedan sus fotos
   fijas con las etiquetas; cada escena 3D se queda en su póster (`img/escenas/`) y la demo pinta un
   mapa de calor 2D en vez de la montaña.
6. **Falla el portátil:** el PDF exportado y la web, <https://r0zh.github.io/vul-hw-grupal/>.
7. **El juego no arranca** (sin WebGL): se cuenta con su página del PDF y se sigue igual.

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
5. **Servidor:** `uv run python -m captura.vivo --sala --abrir`; la consola tiene que decir
   «Placa: ChipWhisperer-Nano enchufado» y «Sala (móviles): https://….trycloudflare.com/». Si dice
   que falta `cloudflared` o que no hay dirección, se arregla la red o se va sin sala.
6. **La sala, con dos móviles** (uno con datos y otro en la wifi del aula): escanear el QR desde el
   fondo del aula, elegir un byte en cada uno, «Guardar en el chip», apostar en la 11 y capturar. Los
   dos tienen que acabar en verde. Después, «Cambiar» en la 3 para dejar la ronda limpia.
7. **Captura de prueba** de 400 trazas con una palabra cualquiera. Con las trazas grabadas, el 90 %
   de las ordenaciones da la clave con 112 trazas; en directo debería ser del mismo orden, pero con la
   placa en el aula no se ha probado.
8. **Saturación:** según la errata de NewAE, la fase entre los relojes del ADC y de la víctima cambia
   en cada arranque y con algunas fases las trazas se recortan. El servidor llama a
   `scope.reset_clock_phase()` hasta 5 veces si las trazas salen saturadas y, si no se arregla, lo
   avisa en la barra de la demo. Entonces se desenchufa, se vuelve a enchufar y se repite; si sigue,
   «Grabado».
9. **Ventana de muestras:** la demo pide las muestras 440 a 740 (`VENTANA` en `js/demo.js`), donde la
   fuga de la primera ronda supera |ρ| = 0,6 (de la 463 a la 730 en `web/data/nano-spa.json`). En la montaña, la cresta
   del candidato correcto tiene que salir dentro; si se cambia el firmware o el disparo, hay que
   volver a localizarla.
10. Quitar el USB a mitad de una captura de prueba debe dar un error claro, y al volver a enchufarlo,
   capturar otra vez.

## Ensayo

- Recorrer la presentación con el servidor de la demo y la vista del ponente, cronómetro en marcha.
  El guion está pensado para unos 19 minutos y medio con la demo; qué se recorta primero está en
  [`NARRATIVA.md`](NARRATIVA.md#2-orden-tiempos-y-qué-se-pulsa).
- Jugar el juego entero en el portátil de clase y en el proyector: las monedas solo se han probado con
  WebGL por software.
- Practicar la demo en los tres modos, y el plan B sin la placa enchufada.
- Ensayar la sala con los móviles del equipo (`--sala`, o `--sala-url http://127.0.0.1:8001/` y la
  página abierta en el propio portátil) y cronometrar cuánto tarda la sala en llenar las casillas.
- Comprobar las animaciones y los vídeos en el portátil de clase: solo se han probado con WebGL y
  decodificación por software, así que los 60 fps están sin medir. La mesa de laboratorio de la 10 es la
  escena con más piezas y la única con sombras: es la primera que hay que mirar.
- Tras tocar una diapositiva: `node --test 'presentacion/tests/*.test.js'` (cifras con su fuente, pasos, notas y
  poco texto) y, si se toca el servidor, `uv run python -m captura.vivo --comprobar`.

## La mesa de laboratorio (diapositiva 10)

«Lo que medimos» empieza por lo que la sala ya conoce: una mesa de laboratorio en 3D
(`js/escenas/mesa.js`, a escala, en mm) que haría lo mismo que el ChipWhisperer-Nano. Es un montaje
equivalente, no el nuestro, y la escena lo dice en su nota; en las pantallas del osciloscopio y del
portátil salen trazas medidas con el Nano (`js/figuras/mesa.js` las lee de `web/data/`).

| Paso | Qué se ve | Qué se dice |
|---|---|---|
| 0 | El chip solo, en su placa de pruebas, y la pregunta escrita | «¿Con qué aparato veríais su corriente?» |
| 1 | La mesa entera: sale la resistencia, se pincha la sonda, crecen los cables y el osciloscopio dibuja el cifrado entero | «Con un osciloscopio… es la mesa que íbamos a montar» |
| 2 | La CW1101 delante, a su escala, con la mesa desvaída detrás | «Todo eso, en esta placa», con la placa de verdad en la mano |
| 3 a 7 | El vídeo V2, un trozo por paso, y la mesa en un recuadro arriba a la derecha | La cámara de la mesa enfoca lo que hace lo mismo que la pieza del vídeo: el chip, la resistencia con la sonda, la pantalla con un punto por muestra, el osciloscopio con el portátil y el cable de disparo |

- **El recuadro** es la misma escena, encogida: `css/deck.css` la reduce a la mitad cuando el vídeo
  recibe `.visible` y su máscara deja ver solo la ventana central (1040 × 600 de 1800 × 720). La
  escena compone los pasos 3 a 7 dentro de esa ventana (`ventana` en `data-opciones`), y
  `tests/diapositivas.test.js` comprueba que las dos cifras coinciden.
- **El vídeo espera** tres pasos escondido (`espera` en sus `data-opciones`), y su respaldo en 3D
  (`placa.js`) lleva los mismos ocho pasos en `orden`.
- **Lo que la mesa no tendría** es el reloj común: se dice en el último paso. El osciloscopio hace de
  medidor (ADC) y de capturador a la vez.
- **Sin WebGL** se queda el póster, la mesa entera (`img/escenas/mesa-paso1.png`); con movimiento
  reducido, la cámara salta de una vista a otra.

## Vídeos path-traced

Dos diapositivas llevan un vídeo renderizado con Cook, el path tracer de Crucible, en una RTX 3070 de
RunPod. Qué explica cada plano, con qué cámara, luces y datos, está en [`cine/GUION.md`](cine/GUION.md),
y el flujo del pod, en [`cine/pod/LEEME.md`](cine/pod/LEEME.md). Son un modelo, no una foto: los de la
placa llevan el rótulo «Modelo 3D simplificado de la placa CW1101».

| Diapositiva | Vídeo | Módulo | Qué enseña |
|---|---|---|---|
| 1 · Portada | Ninguno: V1 se retiró del deck (su plano sigue en `cine/planos/v1.mjs`) | `js/figuras/placa.js`, la escena 3D en tiempo real | La placa gira sola; arrastrando se le da la vuelta en cualquier dirección, también por debajo, y la rueda la acerca. V1 solo giraba en horizontal |
| 10 · Lo que medimos | `video/v2.mp4` y `video/v2-bucle.mp4`, 1152×724 | `js/figuras/cine-v2.js` | Desde el paso 3, un trozo por paso: víctima, shunt, ADC, capturador y, en bucle, reloj y señal de inicio. Antes va la [mesa de laboratorio](#la-mesa-de-laboratorio-diapositiva-10), que después lo acompaña en un recuadro |
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
  escena Three.js de `data-respaldo` (`placa.js` en la 10, con los trozos en el orden del vídeo;
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
24 páginas, titulado como la presentación, en `presentacion/build/presentacion.pdf` (`build/` está
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
| `sala.html` | La página del móvil del público: elegir un byte de la clave y apostar. La sirve `captura/sala.py`, sin nada de fuera |
| `css/deck.css`, `css/demo.css` | Estilos: tema claro, fondo `#f5f5f7`, superficies blancas y acento `#0071e3` |
| `js/deck.js` | Motor: escenario de 1920×1080, pasos, teclado, montaje de las escenas y canal con las notas |
| `js/paleta.js` | Colores compartidos con las escenas 3D |
| `js/demo.js`, `js/cpa-worker.js` | La demo y su CPA (el de `web/js/model/cpa.js`) |
| `js/escenas/` | Escenas 3D: `monedas` (las diez monedas de 1 € del juego), `placa` (la CW1101), `byte` (XOR, S-box y número de unos), `cascada` (la traza en sus diez rondas), `mesa` (la mesa de laboratorio equivalente al Nano) y `montana` (\|ρ(k, t)\| de los 256 candidatos) |
| `js/figuras/` | Lo que monta cada diapositiva: el juego (`juego-monedas.js`), los vídeos (`cine-v2.js` y `cine-v3.js`), la placa 3D (`placa.js`, también la de la portada), las escenas con sus datos (`mesa.js` pone trazas medidas en las pantallas de la mesa) y las figuras 2D (nube, curvas, cifras, marcador, clave, apuesta y el recuerdo del juego) |
| `video/` | Los vídeos path-traced V2 y V3, con sus anclas y cifras (unos 9 MB) |
| `img/cine/` | Fotos fijas de los vídeos, al doble del contenedor: respaldo, movimiento reducido y PDF |
| `img/escenas/` | Pósteres de las escenas, 1600×900 (el de la mesa, 1800×720, como su contenedor) |
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
juego) capturado a 1600×900 con `scripts/capturas.mjs`, esperando a `#escena[data-ready]`. El de la mesa
se saca con la forma de su contenedor: `?m=figuras/mesa.js&step=1&w=1800&h=720`, capturado a 1800×720.
