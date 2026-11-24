# Guion de los vídeos path-traced

Propuesta del 2026-11-23 para la rama `presentacion`. Fija qué se renderiza con Cook, en qué
diapositiva va y con qué cámara, luz, datos y etiquetas, además de cuánto cuesta. De aquí parten los
planos de `cine/planos/` y quien integre los vídeos en el deck. Los tiempos son estimaciones hasta
que el piloto mida los reales (`cine/pod/LEEME.md`).

Regla del guion: cada plano explica algo que dice la diapositiva. Lo que solo decora se queda
fuera (§7).

Desde la narrativa del juego de las monedas (`../NARRATIVA.md`), el montaje es la diapositiva 10 y la
montaña la 13, y las etiquetas y las notas van en palabras sencillas: «parecido» por |ρ| y «lo que puede
hacer el azar» por el mejor falso. Mandan los textos de `index.html`; las tablas de etiquetas y las
notas de abajo son las del render.

## Resumen

**V1 ya no está en el deck.** Se renderizó y se retiró el 2026-11-23: la portada usa la escena 3D en
tiempo real (`js/figuras/placa.js`) porque deja girar la placa en cualquier dirección. Lo que este
guion dice de V1 como vídeo de la portada (aquí, en §2, §5 y §6) queda como registro.

| Vídeo | Diapositiva | Qué explica | Formato | Fotogramas | spp | Coste (×3) |
|---|---|---|---|---:|---:|---:|
| V1 «Revelado» | 1 · Portada | El objeto real del ataque. Se gira con el ratón | 900 × 968, bucle de 12 s | 360 | 512 | 0,25 $ |
| V2 «Anatomía de una traza» | 8 · Lo que medimos | El camino de la medida, de la víctima al USB, y por qué las trazas salen alineadas | 1152 × 724, 5 trozos (15,4 s) | 462 | 512 | 0,30 $ |
| V3 «La montaña» | 11 · Qué acaba de pasar | Con trazas medidas, cómo la cresta del correcto se queda sola cuando baja el azar | 1200 × 826, 4 trozos (10,4 s) | 313 | 512 | 0,24 $ |
| Fotos fijas | 1, 8 y 11, más el PDF | Pósteres y PDF a 3840 × 2160 | El doble del contenedor | 11 | 1024 | 0,06 $ |

Con previas, prueba de calidad, repeticiones y el pod encendido sin renderizar, el total estimado es
de **1,65 $** (o 4,27 $ en el caso malo, §10). Lo caro es dejar el pod encendido: 3,12 $ al día.

Cambios respecto a la propuesta de partida:

- **V1** es un giradiscos de 360° que se puede arrastrar. Así conserva lo que ya hace la escena
  Three.js de la portada: si algo parece tocable, tiene que poder tocarse.
- **V2** sigue la señal (víctima → shunt → ADC → capturador) y añade un quinto paso, «reloj y
  disparo», que enseña por qué las trazas salen alineadas. No hay vista explosionada: los
  componentes están todos en la misma cara y levantarlos no enseña nada.
- **V3:** cada fotograma es un N real. El plano de referencia pasa a ser el mejor falso medido y no
  4/√N, porque con 400 trazas ese plano lo atraviesa un falso. N llega hasta 400 y no hasta 1000:
  más allá no cambia nada visible.
- **V4 «Las rondas»** queda fuera: la escena `cascada` ya lo cuenta con datos medidos.

## 1. Reglas comunes

### Honestidad

- **Modelo, no foto.** Los renders parecen fotos. Por eso V1 y V2 llevan siempre, en HTML, el rótulo
  «Modelo 3D simplificado de la placa CW1101», que ya pone la escena Three.js.
- **Esquema, no pistas.** Los recorridos de V2 son un esquema: las pistas reales van bajo la máscara
  y no las conocemos. Cada paso que los enseña lleva «recorrido esquemático». El reloj del paso 4 va
  a cámara lenta y la etiqueta lo dice.
- **Datos medidos.** El plano de V3 calcula cada fotograma con el mismo CPA que la diapositiva
  (`web/js/model/cpa.js`) sobre `web/data/nano-tinyaes.json`. Comprueba con un `assert` las cifras
  de §4.
- **Sin texto quemado.** Ni etiquetas, ni cifras, ni títulos dentro del render. Solo sale escrito lo
  que está serigrafiado en la placa real.
- **Nada sin comprobar.** Los LED ARM y TRIG no se encienden, y el shunt no se atribuye a una
  resistencia concreta (§7).

### Escala y coordenadas

- **La placa.** Es la de `placa.js` (`buildBoardModel()` → GLB). La PCB mide 30 × 61,1 × 1,6 mm y
  el USB-C sobresale 1,5 mm, así que son 62,6 mm en total.
- **El marco P.** Es el de este guion, en mm: el origen está en el centro del contorno de la PCB, a
  ras del suelo. X va a lo ancho (+X hacia TRIG y ARM), Y hacia arriba y Z a lo largo (+Z hacia el
  USB-C). Se pasa desde el marco de `placa.js` (`point(x, y, h)` = `(x, h, −y)`) con
  `P = (x − 15, h, 30.55 − y)`.
- **Metros en la escena.** Crucible trabaja en metros, como `estudio.mjs`: `posición = 0.001 × P`.
  Hace falta para que el f-stop tenga sentido, porque Cook calcula el radio de apertura en metros.
- Las coordenadas se escriben con punto decimal, como en el código.
- **Piezas en P:**

  | Pieza | Centro en P (mm) | Cuerpo |
  |---|---|---|
  | Víctima STM32F042F6P6 | `(1.8, 2.7, -23.65)` | 4,4 × 6,5 mm |
  | ADC1173 | `(1.6, 2.7, -1.55)` | 4,4 × 7,8 mm |
  | Capturador ATSAM4S16B | `(0.2, 3.1, 11.65)` | 10 × 10 mm |
  | Boca del USB-C | Z = 32.05 | — |
  | Línea de corte de la parte víctima | Z = −17.45 | Lo que queda a Z menor es parte víctima |

### Cámara

- **El modelo de Crucible.** La cámara es `{ eye, target, fov, fStop, focusDistance }`. El `fov` es
  vertical, en grados. Con `fStop` se convierte en una lente fina de Cycles:
  - el radio de apertura es focal / (2 · f), con la focal que da ese fov en un sensor de 36 mm de
    ancho;
  - el foco se mide en metros sobre el eje de vista;
  - el encuadre no cambia al enfocar.
- **Desenfoque.** El de un punto a distancia d, con el foco en s, mide
  `R · |d − s| · W / (s · d · tan(fov_h / 2))` píxeles de diámetro. Todas las cifras de desenfoque
  de este guion salen de esa fórmula. Los encuadres se comprobaron proyectando la placa y la maqueta
  con la cámara de Crucible.
- **Movimientos.** Usan la curva `cubic-bezier(.65, 0, .35, 1)`. Se interpolan el objetivo y la
  posición en esféricas (acimut, elevación y distancia), y el foco a la par. Las posiciones en
  pantalla se dan como fracción del ancho y del alto, desde arriba a la izquierda.

### Estudio claro

Es común a los tres vídeos. Las luces de cada vídeo están en su sección.

| Elemento | Valor |
|---|---|
| Suelo | Plano mate (rugosidad 0,8) con albedo de partida 0,9. La placa y la maqueta se apoyan en él, así que su sombra de contacto las asienta |
| Cielo | Uniforme, sin sol (`keyIntensity: 0`). Con `environment.cameraIntensity` = albedo del suelo × intensidad del cielo, el horizonte no marca línea. Solo se ve en la vista frontal de V3 |
| Fondo #f5f5f7 | Se calibra en el piloto. Se mide el color medio de los 24 px del borde del fotograma y se fija una ganancia por canal, en lineal y antes del mapa de tonos, para que el borde dé #f5f5f7. Es la misma ganancia para todo un plano, nunca por fotograma, para que no parpadee. Luego se comprueba en Chrome, con el vídeo ya codificado dentro del deck: el borde y la diapositiva no deben diferir más de 2 niveles por canal |
| Mapa de tonos | `neutral`, el de `render.mjs`, que no lava el azul #0071e3 |
| Post | Sin bloom, sin viñeta y sin grano |

| Material | Valor |
|---|---|
| Máscara (caras de la PCB, con la serigrafía en su textura) | Color de la textura: `PALETA.pcb` #262e3a, el negro levantado, y tinta #f2f2f2. Rugosidad 0,45 y barniz (clearcoat) 0,6 con rugosidad 0,15. El GLB no trae barniz, así que el plano lo añade |
| Canto de la PCB (FR-4) | Crema #d8c9a3, rugosidad 0,7 |
| Oro ENIG (pads, anillos y barriles) | Metálico 1, rugosidad 0,25. Se parte de `PALETA.oro` #d9a441 y se ajusta contra `ref/victima.jpg` y `ref/adc.jpg` |
| Estaño (patas y terminales) | Metálico 1, rugosidad 0,3, #d2d2d7 |
| Encapsulados | #2b2c30, rugosidad 0,75. Las marcas grabadas vienen en la textura del GLB |
| Carcasa del USB-C | Metálico 1, rugosidad 0,18, #e3e4e6 |

### Vídeo

- **Formato.** 30 fps, H.264, yuv420p, CRF 17, `+faststart` y sin audio (`codificar.sh`). V1 lleva
  además `-g 10 -bf 0`, para que se pueda arrastrar sin tirones.
- **Tamaño.** Es el del contenedor, medido con `getBoundingClientRect` en el escenario de
  1920 × 1080 sin ejecutar el JS del deck, y redondeado a par:

  | Contenedor | Medido | Vídeo |
  |---|---|---|
  | Portada | 900 × 968 | 900 × 968 |
  | Montaje | 1152 × 724 | 1152 × 724 |
  | Por dentro | 1200 × 825 | 1200 × 826, con `object-fit: cover` |
- **Resolución.** Un píxel de vídeo es un píxel del escenario, así que un proyector de 1080p lo
  enseña a tamaño real. Las fotos fijas van al doble, para el PDF a 3840 × 2160
  (`exportar.mjs --escala 2`).
- **Bordes.** Llevan la misma máscara que la escena de la placa, un fundido de 44 px, para que el
  vídeo no se vea como un recuadro.
- **Fotogramas repetidos.** Los que tienen la misma escena y la misma cámara (esperas, N repetidos
  en V3) se renderizan una vez y se copian.

### Etiquetas

- Son HTML, como ahora: la píldora blanca de 24 px (`.etiqueta-3d`), con línea guía en SVG y un
  punto en el ancla.
- **Los textos viven en `index.html`**, con su `data-cifra`, `data-dato` o `data-memoria`, así que
  `tests/cifras.test.js` los sigue cotejando. El JSON de cada plano (`video/<plano>.json`) solo lleva
  ids, tiempos y la posición proyectada del ancla en cada fotograma. La calcula el plano con la misma
  cámara que el render.
- **Sincronía.** Va con `requestVideoFrameCallback`: fotograma = `round(mediaTime × 30)`.
- **Entradas y salidas.** Una etiqueta entra cuando la cámara ya está quieta (fundido de 200 ms) y
  sale al empezar el movimiento siguiente (150 ms). Así nunca resbala por la imagen.

### Sesiones de Cook: que no se rehagan

`render.mjs` abre una sesión y la actualiza con `session.update` en cada fotograma. Si una
actualización cambia un recuento (piezas, materiales, triángulos emisores, luces o texturas), Cook
la rechaza y hay que abrir otra sesión, lo que cuesta 10 a 15 s de compilación por fotograma. Por
eso:

- El número de piezas es fijo en todo el plano. Lo que aparece o desaparece se hace con alpha o con
  emisión, no creando piezas.
- Lo emisivo nunca baja a 0: «apagado» es una emisión de 1e-4.
- Cada pieza cuyo material cambie lleva un material propio desde el primer fotograma (por ejemplo,
  rugosidad 0,500 + i·1e-4). Así el empaquetador no fusiona ni separa materiales entre fotogramas.
- Hay algo con alpha < 1 desde el primer fotograma (el velo de V3 o los tramos sin dibujar de V2),
  para que no recompile a mitad.
- La semilla es el número de fotograma.

## 2. V1 «Revelado» · diapositiva 1 (retirado del deck)

**Retirado.** V1 se renderizó y se retiró del deck el 2026-11-23. La portada usa la escena 3D en
tiempo real (`js/figuras/placa.js`) porque deja girar la placa en cualquier dirección, también por
debajo, y V1 solo giraba en horizontal. El plano sigue en `cine/planos/v1.mjs`.

**Qué explica.** El objeto del ataque tal como es: una placa de unos 6 cm que lleva juntos el
capturador y la víctima. Sustituye a la escena Three.js de la portada y conserva lo que tenía: se
gira arrastrando.

**Ponente.** No cambian sus notas. Saluda y dice la frase de entrada, «vamos a sacar la clave de un
AES midiendo cuánta corriente gasta el chip». La placa gira sola y, si la quiere enseñar, la
arrastra.

| | |
|---|---|
| Contenedor | `.portada-placa`, de 900 × 968 px |
| Vídeo | 900 × 968, 30 fps, 360 fotogramas (12 s). Bucle sin costura: el fotograma 360 sería el 0 |
| Movimiento | Giradiscos: la placa gira 1° por fotograma sobre su eje vertical, en sentido antihorario visto desde arriba. Cámara y luces quietas: el brillo de la caja principal se queda en su sitio y las piezas pasan por él |
| Fotograma 0 | El ángulo del póster actual, con el USB-C delante a la izquierda (unos 50°, se fija en la previa). Así coinciden el póster, el primer fotograma y la foto del PDF |
| Cámara | Ojo `(0, 109.5, 203.1)`, objetivo `(0, 1.5, 0)` y fov 24° (unos 91 mm). Elevación 28°, distancia 230 mm |
| Encuadre | En toda la vuelta, la placa cabe entre el 12 % y el 88 % del ancho y entre el 33 % y el 70 % del alto. Se comprobó proyectando el contorno cada 3° |
| Enfoque | f/32 con el foco a 230 mm, en el centro de la placa, que siempre sale nítido. Los extremos se desenfocan 4,3 px como mucho, cuando la placa mira de punta (6,3 px a f/22) |
| Etiquetas | Ninguna. Se queda el rótulo «Modelo 3D simplificado de la placa CW1101» |
| Interacción | Arrastrar en horizontal mueve `currentTime` (900 px son una vuelta) y al soltar sigue el bucle. Con `prefers-reduced-motion` no hay bucle: se ve el póster, y arrastrar sigue girando |
| Muestras | 512 con OIDN, o 256 si la prueba de calidad no los distingue |
| Coste | Unos 19 s por fotograma: 1,9 h, 0,25 $ (×3) |

La luz es fija respecto a la cámara. El acimut 0° es donde está la cámara.

| Luz | Tamaño | Dónde | Para qué |
|---|---|---|---|
| Caja principal | 0,7 × 0,45 m | Acimut 180° (detrás de la placa), elevación 30°, a 0,5 m | Está en la dirección especular de la cámara: la máscara negra se satina en vez de quedarse en mancha y el oro brilla en toda la vuelta |
| Tira de recorte | 0,6 × 0,05 m | Acimut 180°, elevación 10°, a 0,4 m | Dibuja contra el fondo claro el canto de la PCB, las patas y la carcasa del USB-C |
| Relleno | 0,4 × 0,4 m, a un cuarto de la intensidad de la principal | Acimut −40°, elevación 35°, a 0,45 m | Da forma a las caras de los chips que miran a cámara |
| Cielo | Uniforme | | Relleno general |

Por qué brilla el oro: los pads ENIG son planos y horizontales, así que al girar la placa su reflejo
no cambia. Brillan porque la caja principal está en la dirección especular. Los destellos que se
mueven salen de las patas, los barriles de los taladros y la carcasa del USB-C.

## 3. V2 «Anatomía de una traza» · diapositiva 8 (ahora 10, «montaje»)

**Qué explica.** Qué es una traza, siguiendo la señal: la víctima cifra, su consumo pasa por el
shunt, el ADC toma una muestra por ciclo y el capturador manda las muestras al PC. El último paso
enseña lo que aquí viene regalado y en un ataque real no: el disparo lo da el firmware y el ADC
comparte reloj con la víctima, así que las trazas salen alineadas sin procesarlas (memoria, sección
2.5, y anexo 17).

**Cambios respecto a la escena actual.**

- La escena Three.js va capturador → ADC → víctima → camino. El vídeo sigue la señal, con un
  travelling a lo largo de la placa que va de izquierda a derecha, como se lee.
- La diapositiva pasa de 4 a 5 pasos (`data-pasos="4"`) y de 1 min 15 s a 1 min 30 s.
- La atención la guían el encuadre y el enfoque, no una vista explosionada.

Trozos, a 30 fps. El último fotograma de cada uno es el póster de su paso.

| Paso | Trozo | Duración | Fotogramas | Qué pasa |
|---|---|---|---:|---|
| 0 · Víctima | `v2-anatomia-0.mp4` | 2,0 s | 60 | De 0 a 0,4 s se queda en K0, mientras la diapositiva entra con su fundido de 0,45 s. De 0,4 a 2,0 s baja a K1 y el foco pasa de toda la placa a la víctima |
| 1 · Shunt | `v2-anatomia-1.mp4` | 2,6 s | 78 | De 0 a 1,6 s va de K1 a K2. De 0,6 a 1,8 s se dibuja la medida desde la víctima hasta la zona MEASURE, con el frente más brillante; luego se queda encendida y quieta |
| 2 · ADC | `v2-anatomia-2.mp4` | 2,4 s | 72 | De 0 a 1,6 s va de K2 a K3. De 0,5 a 1,4 s la medida llega al ADC |
| 3 · Capturador | `v2-anatomia-3.mp4` | 2,6 s | 78 | De 0 a 1,6 s va de K3 a K4. De 0,6 a 2,4 s cuatro muestras (cápsulas sueltas) van del ADC al capturador y de ahí entran en el USB-C. El último fotograma ya no tiene cápsulas |
| 4 · Reloj y disparo | `v2-anatomia-4.mp4` y `v2-anatomia-4-bucle.mp4` | 1,8 s más un bucle de 4,0 s | 54 + 120 | Entrada: va de K4 a K5, una vista casi cenital, y se dibujan el reloj y el disparo. El bucle se detalla en la tabla siguiente |

El bucle del paso 4 dura 4,0 s y es periódico. Es lo único que se mueve mientras se habla.

| Cuándo | Qué pasa | Qué significa |
|---|---|---|
| 0,0 a 0,5 s | Un pulso recorre el disparo, de la víctima al capturador | El firmware avisa de que empieza el cifrado |
| 0,6, 1,1, 1,6, 2,1 y 2,6 s | Las dos ramas del reloj parpadean a la vez durante 0,1 s y en cada tic sale una muestra del ADC hacia el capturador | La víctima y el ADC comparten reloj: una muestra por ciclo |
| 3,0 a 3,6 s | Un paquete (una cápsula larga) va del capturador al USB-C | La traza se manda al PC al terminar |
| 3,6 a 4,0 s | Calma. El último fotograma enlaza con el primero | |

La medida, de la víctima al ADC, es analógica: una línea continua y encendida, sin pulsos. Lo
digital (muestras y paquete) va en cápsulas sueltas. El reloj va 3,75 millones de veces más lento
que el real (2 tics por segundo frente a 7,5 MHz), y la etiqueta lo dice.

Fotogramas clave, en P y en mm. Todos usan fov 22° (unos 58 mm) y f/22, y el foco sigue al sujeto.
Las cámaras están en el lado −X (acimut de 238° a 270°), así que la señal avanza hacia la derecha
de la pantalla.

| Clave | Ojo | Objetivo | Foco | Sujeto en pantalla | Desenfoque fuera del sujeto |
|---|---|---|---|---|---|
| K0 general | `(-86.9, 164.9, 0.0)` | `(-0.1, 1.5, 3.4)` | 185 mm | Placa entera, del 20 % al 75 % del ancho | 1 px |
| K1 víctima | `(-70.2, 64.4, -68.7)` | `(-1.4, 3.4, -16.4)` | 105 mm | Víctima en (0,38; 0,54) | 1,7 px en los bordes del chip; de 7 a 12 px en el resto de la placa |
| K2 shunt | `(-81.5, 100.5, -53.6)` | `(2.3, 3.1, -8.9)` | 135 mm | La medida junto a la línea de corte, en (0,38; 0,52) | De 5 a 6 px |
| K3 ADC | `(-76.1, 76.3, -26.8)` | `(0.1, 3.2, 6.7)` | 110 mm | ADC en (0,38; 0,54) | 1,6 px en el chip; de 7 a 10 px en el resto |
| K4 capturador | `(-107.6, 96.3, -8.1)` | `(0.2, 3.9, 26.0)` | 145 mm | Entre el ATSAM4S16B y el USB-C, en (0,38; 0,54) | De 3 a 6 px |
| K5 reloj | `(-52.4, 184.2, -0.5)` | `(-0.2, 1.5, 3.0)` | 190 mm | Placa entera, del 21 % al 75 % | Menos de 1 px |

Recorridos, como pares (X, Z) en P. Flotan a h = 3.41 mm, 1,8 mm sobre la máscara, como el
`signalPath` de `placa.js`. No se cruzan.

| Recorrido | Aspecto | Nodos (X, Z) |
|---|---|---|
| Medida (analógica) | Tubo continuo de 0,5 mm, siempre encendido | `(1.8,-23.65) (3.35,-23.65) (8,-19) (8,-16.45) (8,-9.95) (8,-5.47) (4.48,-1.95) (3.8,-1.95)`, los de `placa.js` |
| Muestras y paquete | Cápsulas de 0,9 × 2 mm | `(1.6,2.6) (0.2,6.4) (0.2,11.65) (2.5,18) (2.5,24.3)`; sobre el capturador van a h = 3.6 |
| Reloj, rama del ADC | Tubo de 0,3 mm: a 0,4 de intensidad entre tics y a 2 en cada tic | `(-6.3,11.65) (-8.5,9.5) (-8.5,-1.55) (-1.9,-1.55)` |
| Reloj, rama de la víctima | Igual que la otra rama | `(-8.5,-1.55) (-8.5,-21) (-5.85,-23.65) (-1.7,-23.65)` |
| Disparo | Tubo de 0,3 mm a trazos de 1,5 mm, con un pulso | `(5.3,-25) (11,-19.3) (11,9) (6.5,11.65)` |

Lo emisivo es azul #0071e3, con la intensidad justa para que la línea se vea de ese color tras el
mapa de tonos (se mide en la previa) y deje un reflejo tenue en la máscara. Las cápsulas emiten el
triple. Si parece neón, se baja.

La luz es fija en el mundo. Como las cámaras están en el lado −X, las cajas van en el +X.

| Luz | Tamaño | Dónde | Para qué |
|---|---|---|---|
| Caja principal | 0,8 × 0,5 m | Acimut 75°, elevación 45°, a 0,5 m | Es la dirección especular de K1 a K4: la máscara se satina en todo el travelling y los reflejos barren las patas |
| Caja cenital | 0,6 × 0,6 m | Elevación 80°, a 0,5 m | Hace lo mismo en las vistas altas, K0 y K5 |
| Tira de recorte | 0,7 × 0,05 m | Acimut 90°, elevación 10°, a 0,4 m | Canto de la PCB y patas |
| Cielo | Uniforme | | |

Etiquetas, en HTML. Los textos van en `index.html` con su fuente.

| Paso | Id | Texto | Ancla (P, mm) | Entra |
|---|---|---|---|---|
| Todos | rotulo | «Modelo 3D simplificado de la placa CW1101» | Esquina inferior derecha | Siempre |
| 0 | victima | «Víctima · STM32F042F6P6» y «cifrando con AES-128» | `(1.8, 2.7, -23.65)` | 1,85 s |
| 1 | shunt | «Shunt de 27 Ω en la alimentación de la víctima: la caída de tensión sigue al consumo» y «recorrido esquemático» | `(5.7, 3.41, -21.3)`, sobre la medida dentro de la parte víctima, no sobre una resistencia | 2,4 s |
| 2 | adc | «ADC de 8 bits · una muestra por ciclo del reloj de la víctima (7,5 MHz)» | `(1.6, 2.7, -1.55)` | 2,2 s |
| 3 | capturador | «Capturador · ATSAM4S16B: espera el disparo, guarda las muestras y las manda al PC por USB» | `(0.2, 3.1, 11.65)` | 2,4 s |
| 4 | regalado | «El disparo lo da el firmware y el ADC usa el reloj de la víctima: las trazas salen alineadas», una leyenda con los cuatro trazos (medida, muestras, reloj y disparo) y «esquemático; el reloj real va a 7,5 MHz» | Sin ancla: tarjeta abajo a la derecha | 1,8 s |

Cada etiqueta sale al empezar el trozo siguiente. Las fuentes son `data-memoria="02-descripcion.tex"`
para 27 Ω, y `data-dato` con `nano-tinyaes.json:meta.instrumento` y `meta.unidades` para 7,5 MHz y
8 bits, como en la lista de la diapositiva.

Lo que dice el ponente, como notas nuevas de la diapositiva 8:

- **Paso 0:** «Esta es la víctima, un STM32F042 que cifra con AES-128. Lo que medimos es su consumo.»
- **Paso 1:** «Su alimentación pasa por un shunt de 27 Ω, y la caída de tensión sigue al consumo. El
  azul es un esquema, no las pistas reales.»
- **Paso 2:** «El ADC, de 8 bits, toma una muestra en cada ciclo del reloj de la víctima: 7,5
  millones por segundo.»
- **Paso 3:** «El capturador espera el disparo, guarda las muestras y las manda al PC por USB. Eso es
  una traza: 5000 muestras tomadas durante un cifrado.»
- **Paso 4:** «Y esto es lo que aquí viene regalado: el disparo lo da el firmware y el reloj es el
  mismo, así que las trazas salen alineadas. Un atacante real tendría que conseguirlo por su cuenta.
  Comparad el modelo con la foto.»

**Muestras y coste.** 512 con OIDN, unos 18 s por fotograma. 462 fotogramas son 2,3 h y 0,30 $ (×3).

## 4. V3 «La montaña» · diapositiva 11 (ahora 13, «por-dentro»)

**Qué explica.** El mecanismo, que es lo que más premia la rúbrica: al sumar trazas, la cresta del
candidato correcto se queda sola. Es la escena Three.js de la diapositiva convertida en una maqueta,
con dos mejoras:

- cada fotograma es un N real, no una transición entre 5, 20, 100 y 400;
- el plano de referencia es el mejor falso medido, no 4/√N.

**Datos.** Son los de `web/data/nano-tinyaes.json`: las 400 primeras trazas de
`datos/20261113-nano-tinyaes-respaldo`, muestras 440 a 740, en códigos del ADC. Son las mismas que
usan la demo en modo «Grabado» y la escena actual. Se ataca el byte 0 de la clave de laboratorio
(0x2b). El plano calcula |ρ(k, t)| de las N primeras trazas con `createAccumulator` y `correlate`
de `web/js/model/cpa.js`, el mismo código que la diapositiva.

Las cifras se comprobaron al escribir este guion, con numpy y la misma fórmula:

| N | 4/√N | \|ρ\| del correcto (muestra) | Mejor falso | Puesto del correcto | Media de los 255 falsos |
|---:|---:|---|---:|---|---:|
| 5 | 1,79 | 1,000 (523) | 1,000 | Empate: 86 falsos llegan también a 1 (87 si los empates cuentan en contra) | 0,417 |
| 20 | 0,89 | 0,783 (463) | 0,849 | 7 | 0,185 |
| 27 | 0,77 | 0,781 (462) | 0,778 | 1, y ya no lo pierde | 0,159 |
| 100 | 0,40 | 0,730 (462) | 0,503 | 1 | 0,082 |
| 400 | 0,20 | 0,576 (462) | 0,250 | 1 | 0,040 |

El plano lleva un `assert` con la fila de 400 (0,576 y 0,250) y con N = 27 como el primer N desde
el que el correcto es siempre el primero.

**Por qué el velo marca el mejor falso y no 4/√N.** Con 400 trazas, el mejor falso (0,250) queda por
encima de 4/√N (0,20). Picos de falsos atravesarían un plano a 4/√N justo cuando la diapositiva dice
«Solo queda en pie el candidato correcto». La escena actual ya lo enseña. El mejor falso medido es,
además, el criterio del ataque: el byte sale cuando la cresta lo supera. La media de los falsos sí
sigue la teoría, √(2/π)/√N ≈ 0,8/√N: 0,18, 0,08 y 0,04 con 20, 100 y 400 trazas. Eso es lo que el
ponente cuenta como «baja el azar».

**Por qué hasta 400 y no hasta 1000.** Con las 1000 trazas del `.npz`, el mejor falso solo pasa de
0,250 a 0,198 y la media, de 0,040 a 0,026. A esta escala no se nota. Además, 400 son las trazas de
la demo en «Grabado» y las que cita la diapositiva, así que el contador se queda en 5, 20, 100 y 400.

La maqueta usa el marco M, en mm: el origen está en el centro de la cara de arriba de la base, X es
el tiempo, Y es |ρ| y Z es el candidato.

| Pieza | Geometría | Material |
|---|---|---|
| Base | 236 × 148 × 6 mm, con cantos redondeados de 4 mm, apoyada en el suelo | Blanca #fbfbfd, rugosidad 0,5 |
| Superficie | Rejilla de 300 × 256 vértices. X va de −112 (muestra 440) a +112 (muestra 739). Z va de −68 (0x00, al fondo, como en la escena actual) a +68 (0xff). Y = 86 · \|ρ\| + 0,5 | Gris claro #dcdce1, rugosidad 0,6 |
| Fila del correcto | Tubo de 1,8 mm que recorre la fila 0x2b (Z = −45,07) | #0071e3, rugosidad 0,35 |
| Velo | Lámina de 228 × 140 × 0,6 mm a Y = 86 · mejor falso | Blanca con alpha 0,35 y un marco de varillas de 1 mm #6e6e73. Lo que queda debajo se ve, pero velado |
| Ejes | Varillas de 0,8 mm: \|ρ\| en la esquina del fondo a la izquierda, el tiempo en el borde delantero y el candidato en el derecho | #6e6e73 |

Los 152 490 triángulos de la superficie cambian en cada fotograma. Van por la actualización de
geometría de la sesión, que solo rehace el BLAS de esa malla.

Trozos. El contador de la diapositiva y las cifras salen del JSON del plano, fotograma a fotograma.

| Paso | Trozo | Duración | Fotogramas | N | Qué pasa |
|---|---|---|---:|---|---|
| 0 | Solo el póster, `v3-montana-0.webp` | — | 1 | 5 | El velo, arriba del todo, toca la cresta: cualquier candidato parece bueno |
| 1 | `v3-montana-1.mp4` | 2,0 s | 60 | `round(5 · 4^(i/59))`: de 5 a 20 | Cada salto es una traza nueva (16 valores). El mar baja y el velo pasa de 1,00 a 0,85, todavía por encima de la cresta |
| 2 | `v3-montana-2.mp4` | 3,0 s | 90 | `round(20 · 5^(i/89))`: de 20 a 100 | En el fotograma 16 (0,53 s) N llega a 27 y el correcto pasa a primero, con un aviso verde. El velo baja a 0,50 |
| 3 | `v3-montana-3.mp4` | 5,4 s | 162 | `round(100 · 4^(i/89))`: de 100 a 400, y luego se queda en 400 | De 0 a 3,0 s el mar se aplana y el velo baja a 0,25. De 3,0 a 3,4 s, quieto. De 3,4 a 5,4 s la cámara baja a la vista frontal: los 256 candidatos se superponen y solo sobresale la cresta azul, como en las figuras `real-*` de la memoria |

Mientras crece N, la cámara no se mueve, así que todo cambio en la imagen viene de los datos. Con
los N y las esperas repetidos, son unos 240 renders en lugar de 313.

Cámaras, en M y en mm. Ambas usan fov 24° (unos 58 mm) y f/22, con el foco en la cresta.

| Vista | Ojo | Objetivo | Foco | Encuadre |
|---|---|---|---|---|
| 3/4 (pasos 0 a 3) | `(206.4, 335.0, 486.3)` | `(12.4, 36.4, -9.7)` | 666 mm | La maqueta ocupa del 6 % al 83 % del ancho (el 17 % de la derecha queda para las etiquetas) y del 17 % al 92 % del alto. La cresta queda en (0,29; 0,33). El desenfoque máximo es de 2,9 px, en la esquina delantera |
| Frontal (final del paso 3) | `(0.0, 94.8, 616.6)` | `(23.1, 45.6, -2.4)` | 659 mm | La maqueta ocupa del 8 % al 79 % del ancho y del 34 % al 75 % del alto. La cresta queda en (0,20; 0,47). Desenfoque de menos de 2 px |

| Luz | Tamaño | Dónde | Para qué |
|---|---|---|---|
| Caja principal | 1,0 × 1,0 m | Acimut −60° (delante a la izquierda), elevación 50°, a 1,0 m | Sombras suaves que hacen legible la altura de los picos |
| Tira de recorte | 1,2 × 0,08 m | Acimut 180°, elevación 15°, a 0,9 m | Separa la cresta y el velo del fondo |
| Cielo | Uniforme | | |

Etiquetas:

| Id | Texto | Ancla | Cuándo |
|---|---|---|---|
| ejes | «\|ρ\|» con 0, 0,5 y 1; «tiempo (muestra)» con 500, 600 y 700; «candidato k» con 0x00, 0x80 y 0xff | Marcas de los ejes | En la vista 3/4. En la frontal, solo \|ρ\| y tiempo |
| fila | «0x2b (correcto)», en azul | Extremo derecho de la fila 0x2b | En la vista 3/4 |
| cresta | «0x2b · \|ρ\| = …», que pasa de 0,78 a 0,58 | Máximo de la fila 0x2b, en la muestra 462 o 463 desde N = 10 | Desde el final del paso 1 |
| velo | «mejor falso · \|ρ\| = …», que pasa de 1,00 a 0,25 | Esquina delantera derecha del velo, que sube y baja con él | Siempre |
| cresta2 | «el mismo byte, otra vez» | Máximo de la fila 0x2b desde la muestra 600 (la 730, con \|ρ\| = 0,48 y N = 400): las mezclas que siguen a la S-box vuelven a cargar el byte | En la vista frontal, en lugar de la fila |
| Fuera del vídeo | N (el contador grande de ahora) y «puesto del 0x2b» (empate a \|ρ\| = 1, 7 y 1). El puesto se pone verde, con su marca, al llegar a 1 | Columna de la derecha | En cada fotograma |

Lo que dice el ponente, en las notas de la diapositiva 11. En `index.html` no se escriben decimales a
mano, porque las cifras ya están en pantalla.

- **Paso 0:** explica los ejes. «Con 5 trazas, varios falsos llegan a |ρ| = 1. El velo marca el
  mejor de los 255 falsos.»
- **Paso 1:** «Con 20, el correcto ya es el 7.º de 256, pero el velo sigue por encima de su cresta.»
- **Paso 2:** «A las 27 trazas pasa a ser el primero y ya no lo suelta.»
- **Paso 3:** «La cresta no crece, incluso baja un poco: lo que baja es el azar de los falsos, como
  1/√N. De frente, solo queda en pie el correcto.» Luego da el relevo, como ahora.

**Muestras y coste.** 512 con OIDN, porque con N pequeño la superficie es muy picuda y el velo es
translúcido. Unos 21 s por fotograma: 1,9 h y 0,24 $ (×3), contando los 313 fotogramas.

## 5. Fotos fijas

Todas se renderizan al doble del tamaño del contenedor, con 1024 spp y OIDN. Se guardan en WebP con
pérdida (calidad 90), después de comprobar que el fondo sigue en #f5f5f7 ± 2.

| Foto | Tamaño | Fotograma | Uso |
|---|---|---|---|
| `v1-revelado.webp` | 1800 × 1936 | V1, fotograma 0 | Póster de la portada y PDF |
| `v2-anatomia-inicio.webp` | 2304 × 1448 | V2, K0 | Póster de entrada |
| `v2-anatomia-0.webp` a `-3.webp` | 2304 × 1448 | El último de cada trozo | Pósteres de los pasos 0 a 3 |
| `v2-anatomia-4.webp` | 2304 × 1448 | K5, con todos los recorridos encendidos y sin pulsos | Póster del paso 4 y PDF |
| `v3-montana-0.webp` a `-3.webp` | 2400 × 1652 | N = 5, 20 y 100, y 400 en la vista frontal | Pósteres y PDF (paso 3) |

Son 11 fotos: unas 0,46 h y 0,06 $.

## 6. Respaldo y PDF

| | En directo, si el vídeo falla | En el PDF (`exportar.mjs` con `?estatico` y `--escala 2`) |
|---|---|---|
| V1 | El `poster` del `<video>`, es decir, la foto fija. Arrastrar no hace nada | `v1-revelado.webp` |
| V2 | La foto fija de cada paso (la figura cambia de póster con los pasos), con las mismas etiquetas HTML | El paso 4, `v2-anatomia-4.webp`, con su etiqueta y la leyenda |
| V3 | La escena Three.js `por-dentro`, que tiene los mismos pasos y datos. Si tampoco hay WebGL, los pósteres | El paso 3, `v3-montana-3.webp` |

Con `prefers-reduced-motion` se ven las fotos fijas y los pasos cambian sin animación. Ningún vídeo
lleva sonido: el deck ya tiene sus tres sonidos de recompensa.

## 7. Descartes

| Idea | Por qué no |
|---|---|
| V4 «Las rondas» (SPA) | La escena `cascada` ya enrolla, por pasos, la traza medida en sus diez rondas. El path tracing le daría acabado, no información. Además, el SPA es lo primero que se recorta si falta tiempo. Ahorra unas 1,5 h de GPU y un día de trabajo |
| Vista explosionada en V2 | Los componentes están todos en la misma cara y soldados: levantarlos no revela nada y sugiere unas capas que no existen |
| Montaña hasta 1000 trazas | Entre 400 y 1000 el cambio no se ve (§4) |
| Plano 4/√N | Con 400 trazas lo atraviesa el mejor falso (§4) |
| LED ARM y TRIG encendidos | No hemos comprobado cuándo se encienden. Solo entrarían si se graba la placa real durante una captura y se ve |
| Señalar el shunt en una resistencia | La documentación dice que está en la parte víctima, pero no cuál es. La etiqueta se ancla en la medida |
| Bloom, destellos de lente, partículas o texto quemado | Decoran. El brillo de neón, además, delata un diseño de plantilla |
| Maqueta de contramedidas (base frente a retardos, mismo N) | Sale gratis con el plano de V3 y los datos de `datos/20261113-cm-*.npz`, pero no está en el plan. Solo como foto fija para un anexo si sobra tiempo |

## 8. Cambios fuera de `cine/` que pide este guion

Los hace quien integre, no este guion. Hechos el 2026-11-23, con un módulo por vídeo
(`js/figuras/cine-v1.js` a `cine-v3.js`) en lugar de la figura genérica del punto 2; lo integrado se
cuenta en `presentacion/README.md`, «Vídeos path-traced».

1. **`index.html`:**
   - la diapositiva 8, con 5 pasos y las notas nuevas;
   - la 11, con «puesto del 0x2b» junto al contador;
   - los textos de las etiquetas, con su fuente.
2. **`js/figuras/video.js`:** una figura genérica con el contrato de las escenas,
   `{ steps, start, stop, step, dispose }`.
   - Un paso adelante reproduce el trozo; un paso atrás enseña el último fotograma del trozo
     anterior.
   - `static` enseña la foto fija.
   - Los bucles usan un segundo `<video>` precargado.
   - Etiquetas y cifras se sincronizan con `requestVideoFrameCallback`.
   - Lleva la máscara de 44 px de los bordes.
3. **`js/escenas/placa.js`:** el ancla de «Shunt de 27 Ω» (`views[4].anchor`, que es (23, 43.75) en
   coordenadas de la placa) cae fuera de la parte víctima, porque la línea de corte está en y = 48.
   En cambio, el texto habla de la alimentación de la víctima. Le pasa a la escena actual aunque no
   se haga V2.
4. **`js/escenas/montana.js`:** si V3 usa el mejor falso, hay que cambiar
   `threshold = 4 / Math.sqrt(n)` por el máximo de los 255 falsos, para que el respaldo diga lo mismo
   que el vídeo.
5. **`presentacion/video/`:** ahí van vídeos, fotos y JSON, versionados. Son entre 20 y 30 MB en
   total, porque el deck tiene que funcionar en el aula sin red.

## 9. Orden de producción

El render es barato. Lo caro es el pod encendido sin trabajar: 0,13 $/h son 3,12 $ al día y 21,8 $
a la semana. Por eso se trabaja en tres sesiones y el pod se para entre ellas. Según la documentación
de RunPod sobre los pods, consultada el 2026-11-23:

- parado, no cobra la GPU, pero sí su disco;
- al volver arranca en la misma máquina y, si otro ha cogido la GPU, hay que esperar o rehacerlo
  con `pod/arranque.sh`;
- al pararlo se borra lo instalado fuera de `/workspace`: Node, ffmpeg y OIDN.

0. **En local, sin pod:**
   - escribir los planos `v1-revelado.mjs`, `v2-anatomia.mjs` y `v3-montana.mjs` en `cine/planos/`,
     cada uno con sus trozos y sus anclas;
   - probarlos con `--previa` en CPU, 3 fotogramas por plano a 240 px y 4 muestras, con
     `nice -n 15 taskset -c 0-3`;
   - el `assert` de datos de V3;
   - la figura de vídeo del deck, probada con vídeos de previa.
1. **Sesión A, unas 1,5 h:**
   - `git pull`;
   - el piloto del flujo de render, si aún no está hecho: tiempos reales, VRAM, OIDN y calibración
     del fondo;
   - previas de V1, V2 y V3 a la mitad de ancho y de alto, con 32 spp y OIDN, en todos los
     fotogramas;
   - codificar en el pod y bajar solo los MP4.

   Al acabar, se paran el servidor y el pod.
2. **Revisión en local:** ver las previas dentro del deck, con etiquetas y notas, y corregir
   encuadres, tiempos y textos en los planos.
3. **Sesión B, de 7 h (×3) a 20 h (×10), renderizando en segundo plano:**
   - previas solo de lo que haya cambiado;
   - prueba de calidad: 10 fotogramas seguidos de cada vídeo a 256, 512 y 1024 spp, codificados y
     vistos en bucle. Se elige el menor spp sin manchas que bailen;
   - finales por trozos, reanudables (`--desde` y `--hasta`), en este orden:
     - V1, porque el piloto ya es casi él;
     - V3, porque es el mecanismo, lo que más cuenta en la rúbrica;
     - V2, porque es el más complejo y el que tiene mejor respaldo.

   Cada trozo se codifica y se revisa en el deck mientras se renderiza el siguiente.
4. **Sesión C, de 1 a 2 h:** las fotos fijas al doble y las repeticiones. Después se exporta el PDF en
   local.

Cuándo parar:

- Si el piloto mide más de 60 s por fotograma a 1920 × 1080 y 256 spp (más de ×8 sobre el room),
  antes de los finales se baja a 256 spp y se quita el bucle de V2.
- Si el gasto del pod pasa de 5 $, se para y se decide qué recortar: primero el bucle de V2 y
  después V2 entera, cuyo respaldo es la escena actual.

## 10. Coste

**Es una estimación, no una medida.** Se escala de forma lineal en píxeles × muestras a partir del
room.cookpack medido en el pod: 800 × 600 a 256 spp en 1,65 s, es decir, 74,5 millones de
muestras·px por segundo. Encima se aplican:

- un margen de ×3 por la complejidad de la placa: miles de instancias, metales, barniz, profundidad
  de campo y más rebotes;
- 1 s fijo por fotograma, para empaquetar, actualizar la sesión, OIDN y el PNG.

La columna ×10 es el caso malo. Todo se sustituye por lo que mida el piloto.

| Trabajo | Fotogramas | Px por fotograma | spp | s por fotograma (×3) | h de GPU (×3) | $ (×3) | h de GPU (×10) | $ (×10) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Piloto (lo hace el flujo de render) | 2 × 60 | 2 073 600 | 128 y 256 | 11,7 y 22,4 | 0,57 | 0,07 | 1,81 | 0,24 |
| Previas, dos rondas, a un cuarto de los píxeles | 2 × 1135 | de 208 512 a 247 800 | 32 | 1,3 | 0,81 | 0,11 | 1,23 | 0,16 |
| Prueba de calidad (3 vídeos × 10 fotogramas × 3 valores de spp) | 90 | de 834 048 a 991 200 | 256, 512 y 1024 | — | 0,57 | 0,07 | 1,83 | 0,24 |
| V1 final | 360 | 871 200 | 512 | 19,0 | 1,90 | 0,25 | 6,09 | 0,79 |
| V2 final | 462 | 834 048 | 512 | 18,2 | 2,34 | 0,30 | 7,48 | 0,97 |
| V3 final (cota alta: con los repetidos son unos 240 renders) | 313 | 991 200 | 512 | 21,4 | 1,86 | 0,24 | 6,01 | 0,78 |
| Fotos fijas al doble | 11 | de 3,3 a 4,0 M | 1024 | de 140 a 166 | 0,46 | 0,06 | 1,51 | 0,20 |
| Repeticiones (el 20 % de los finales) | 227 | | 512 | | 1,22 | 0,16 | 3,92 | 0,51 |
| Pod encendido sin renderizar (arrancar, codificar, bajar y esperar; 3 sesiones de 1 h) | | | | | 3,00 | 0,39 | 3,00 | 0,39 |
| **Total** | | | | | **12,7** | **1,65** | **32,9** | **4,27** |
| *Olvidar el pod encendido* | | | | | *24 h al día* | *3,12 al día* | | |

Un segundo de vídeo final cuesta unos 0,02 $, y una foto fija al doble, unos 0,005 $.
