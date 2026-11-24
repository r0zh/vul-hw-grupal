# Narrativa de la presentación

Guion del equipo para la rama `presentacion` (2026-11-23). Aquí va el hilo, el orden con tiempos, el
vocabulario común, los momentos de participación y la prueba de comprensión. Lo que se dice en cada
diapositiva está en sus notas del ponente (`aside.notas` de [`index.html`](index.html), tecla **N**), y
el manejo del juego y de la demo, en el [`README.md`](README.md).

Reglas que no cambian:

- **Abrimos con un juego**, antes de cualquier término técnico: diez monedas, una trucada, y se tira
  hasta que alguien de la sala sepa decir cuál es. Después se explica el ataque de verdad y qué es cada
  pieza del juego en él.
- **Lo mínimo de matemáticas.** Las diapositivas principales no llevan fórmulas (lo comprueba
  `tests/diapositivas.test.js`): se dice «parecido» y «número de unos». La fórmula del CPA está en el
  anexo 23.
- **Lo medido va con su fuente:** cada cifra de `memoria/capitulos/generado/reales.tex` o de
  `web/data/` lleva su `data-cifra`, `data-dato` o `data-memoria`. Las tiradas del juego son simuladas
  y se dice.
- **Ninguna defensa se presenta como garantía.**

## 1. El hilo

**En una frase.** En cada cifrado, el chip se delata un poco por la corriente que gasta. Con una
medida no se nota nada, pero con unas cien la clave correcta destaca sobre el azar, igual que la
moneda trucada destaca tras muchas tiradas.

### La analogía

| En el juego | En el ataque | Dónde se ve |
|---|---|---|
| Diez monedas, una trucada | 256 candidatos por byte de la clave, uno correcto; y 16 bytes a la vez con las mismas trazas | 2, 9 y 13 |
| Una tirada | Una traza: la corriente mientras el chip cifra un mensaje nuevo (**no** una ronda ni un ciclo). Se mide el principio del cifrado, donde está la fuga | 2, 7, 9 y 10 |
| El % de caras; 50 % si la moneda es normal | El parecido entre lo que predice un candidato y el consumo, de 0 a 1 (no es un porcentaje); cerca de 0 si es falso | 8, 9 y 13 |
| La trampa: sale cara el 60 % | La fuga: el consumo se parece a lo que predice la clave correcta | 5, 8 y 9 |
| Lo que puede hacer el azar (la franja azul), que se estrecha con más tiradas | El azar de los 255 falsos (el plano de la montaña, la línea gris de la demo), que baja con más trazas | 9, 12 y 13 |
| La trucada se sale de la franja | El correcto se sale del azar: su cresta en la montaña | 9, 12 y 13 |
| La trampa solo actúa en una de cada 16 tiradas, sin saber en cuáles | Barajar el orden en que pasan los 16 bytes por la S-box | 15 |
| No saber cuándo mirar | Esperas al azar (retardos aleatorios) | 15 |
| Darle la vuelta a la moneda sin avisar | Enmascarar (no medido) | 15 |
| (El juego no tiene «cuándo») | El instante en que mirar: la ronda 1, y la segunda cresta, cuando las mezclas siguientes vuelven a cargar el byte | 7, 9, 13 y 15 |

### Por qué el puente va antes de la demo

La diapositiva «En el juego → en el ataque» (9) cierra la parte 2, después de ver la fuga y cómo se
nota el candidato correcto, y antes del montaje y la demo. Así la sala ve la demo y la montaña
sabiendo ya que cada traza es una tirada y que se busca el candidato que se sale del azar. Puesta
después, la demo, que es el momento de más atención, pasaría sin que nadie supiera qué mirar.

## 2. Orden, tiempos y qué se pulsa

| Nº | id | Título | Qué se pulsa | Participación | Quién | Tiempo | Empieza |
|---|---|---|---|---|---|---|---|
| 1 | `portada` | Leer una clave AES en el consumo | Opcional: arrastrar la placa 3D, que gira sola, para darle la vuelta, también por debajo (la rueda la acerca), y decir «la placa es nuestro modelo 3D: la podemos girar y ver por debajo» | — | Juan Diego | 30 s | 0:00 |
| 2 | `juego` | Una de estas monedas está trucada | «Tirar», «Seguir tirando» y «Parar», tocar la moneda que dice la sala y «Comprobar»; ↻ para otra partida | La sala dice la letra | Juan Diego | 2 min 30 s | 0:30 |
| 3 | `pregunta` | ¿Un chip puede chivarse de su clave? | Escribir la palabra y «Guardar en el chip» | Pregunta abierta y palabra de la clase | Juan Diego | 1 min | 3:00 |
| 4 | `indice` | De la fuga a la clave | — | — | Juan Diego | 20 s | 4:00 |
| 5 | `fuga` | El consumo depende de los datos | → 4 veces | «¿Qué gasta más, ceros o unos?» | Brian | 1 min 15 s | 4:20 |
| 6 | `punto-de-ataque` | El punto débil: la primera ronda | → 1 vez | — | Brian | 50 s | 5:35 |
| 7 | `spa` | Ver las rondas sin saber nada | → 3 veces | — | Brian | 50 s | 6:25 |
| 8 | `dpa-cpa` | Así se nota el candidato correcto | → 1 vez | «¿Cambian las medidas?» | Brian | 1 min | 7:15 |
| 9 | `puente` | En el juego → en el ataque | — | — | Brian | 1 min | 8:15 |
| 10 | `montaje` | Lo que medimos | → 4 veces (vídeo V2) | — | Alberto | 1 min 30 s | 9:15 |
| 11 | `apuesta` | ¿Cuántas trazas harán falta? | La opción más votada | ¿Más o menos que vuestras tiradas? | Alberto | 40 s | 10:45 |
| 12 | `demo` | En directo | «Capturar» | La palabra; «avisad del primer verde» | Alberto | 3 min | 11:25 |
| 13 | `por-dentro` | Qué acaba de pasar | → 3 veces (vídeo V3) | «¿Subirá la cresta?» | Alberto | 1 min 30 s | 14:25 |
| 14 | `resultados` | ¿Cuántas trazas hicieron falta? | → 1 vez | Se resuelve la apuesta y vuelven las tiradas del juego | Roberto | 1 min 15 s | 15:55 |
| 15 | `contramedidas` | Defensas: esconder la trampa | → 2 veces | «¿Cómo esconderíais la moneda?» | Roberto | 1 min 45 s | 17:10 |
| 16 | `conclusiones` | No rompe AES: rompe una implementación | — | Vuelta a la pregunta del principio | Roberto | 1 min | 18:55 |
| 17 | `preguntas` | ¿Preguntas? | Número + Intro para un anexo | Preguntas y QR | Roberto | lo que quede | 19:55 |
| 18 a 23 | `anexo-*` | Hamming, captura, enmascaramiento, dispositivo real, AES por hardware y qué es el «parecido» | — | — | quien responda | solo si preguntan | — |

Son 16 min 55 s más 3 de demo (19 min 55 s). Juan Diego habla 4 min 20 s, Brian 4 min 55 s, Alberto
6 min 40 s con la demo y Roberto 4 min más las preguntas.

**Si hay que recortar** (algo más de un minuto), por este orden:

1. El juego en una sola partida: parar en cuanto la trucada se salga de la franja.
2. SPA solo con los pasos 0 y 3.
3. Montaje: los pasos 1 y 2 con una sola frase.
4. Defensas sin la analogía del enmascaramiento.

Lo último que se toca es el juego, la apuesta y la montaña.

## 3. Vocabulario y qué no decir

Los cuatro dicen lo mismo con las mismas palabras, que son las de la pantalla.

| Técnico | En pantalla y en voz alta |
|---|---|
| texto claro | mensaje («el texto claro» solo la primera vez, en la 5) |
| traza | traza: la corriente del chip durante un cifrado; en el juego, una tirada (se define en la 7) |
| candidato k | candidato: cada uno de los 256 valores posibles de un byte de la clave |
| peso de Hamming | número de unos (el nombre técnico, una vez en voz alta en la 5) |
| correlación, \|ρ\| | parecido: 0 es nada y 1, idéntico (correlación solo en los anexos 18 y 23) |
| ruido, mejor falso, 4/√N | lo que puede hacer el azar; su techo es «el falso con más suerte» |
| rango | puesto (1.º gana) |
| ordenaciones al azar | repeticiones: el ataque con trazas escogidas al azar de las 1000 grabadas; se hicieron 100, como 100 partidas |
| AddRoundKey, SubBytes; ShiftRows y MixColumns | el XOR con la clave, la S-box; «más mezclas» (los nombres, solo si alguien pregunta) |
| disparo (trigger) | señal de inicio |
| shunt | resistencia (shunt) |
| ADC | medidor (ADC) |
| retardos aleatorios | esperas al azar |
| SPA, DPA y CPA | se nombran una vez, en la 7 y en la 8 |

No se dice:

- Cuál es la moneda trucada antes de comprobar: no la sabe nadie, tampoco el ponente.
- «Hemos roto AES». AES sigue siendo seguro: lo que falla es una implementación que filtra.
- «Una ronda» o «un ciclo» por una tirada. La tirada es una traza: la corriente mientras el chip cifra
  un mensaje. Tampoco «un cifrado medido entero»: las 5000 muestras cubren su principio.
- Que una tirada vale lo mismo que una traza, ni cuentas entre las dos. La comparación de
  «Resultados» es cualitativa: «el chip se delata más que nuestra moneda, por eso bastan menos».
- «La cresta crece con más trazas». Lo que baja es el azar.
- «Siempre sale». Se dice «en las 100 repeticiones».
- Que el plano de la montaña es una fórmula: es el falso con más suerte, medido. La franja del juego
  sí es una cuenta (± 1,5/√N, tres desviaciones típicas), y está en el anexo 23.
- «Barajar no sirve» o «las esperas lo hacen imposible». Medimos ×3,6 y 7 de 16 sumando ventanas.
- «Barajar es cambiar las monedas de sitio»: las monedas son candidatos, hipótesis del atacante, y el chip
  no las mueve. Lo que se baraja es el orden de los bytes: la trampa de cada uno solo asoma en una de cada
  16 tiradas.
- «Con 95, la mitad»: las cifras de la memoria son cotas (112 quiere decir entre 96 y 112). En la 14 solo
  sale 112, «9 de cada 10 repeticiones».
- Que las medidas prueban «más unos, más corriente». Prueban que la corriente cambia con el número de
  unos; hacia qué lado se mueve la lectura depende del montaje.
- «Tiempo constante» sin explicarlo. No sale en la charla.
- La palabra de la clase en voz alta, o callarse el modo de la demo.

## 4. Ganchos de atención

Los imprescindibles son el juego, la palabra de la clase y la apuesta. Los demás duran menos de 15 s
y se saltan si va justo de tiempo.

| Gancho | Dónde | Qué se hace | Cómo se cierra |
|---|---|---|---|
| El juego de las monedas | 2 | Se tira hasta que alguien dice la letra con seguridad; se toca esa moneda y «Comprobar» | «¡Acertado con N tiradas!», «Acertado, pero con suerte» (la barra aún estaba dentro de la franja) o «No era esa» y otra partida. La N vuelve en la 14 |
| Pregunta abierta | 3 | «¿Un chip puede chivarse de su clave?» y 5 s de silencio; dos respuestas sin corregir | En la 16: «Sí, con unas cien trazas» |
| La palabra de la clase | 3 → 12 | La clase dicta una palabra y se guarda sin leerla | En la 12, «Clave recuperada»: «¿es la vuestra?». Si se usa Grabado, se dice, y 20 s de Simulado con la palabra |
| ¿Ceros o unos? | 5, antes del paso 3 | Pregunta rápida | En el paso 3: más unos, más corriente |
| ¿Cambian las medidas? | 8, paso 0 | Pregunta rápida | En el paso 1: no, solo se recolocan |
| La apuesta de trazas | 11 | «¿Más o menos que vuestras tiradas?»: manos y se pulsa la más votada | En la 14, paso 1: «unas 100» y, debajo, las tiradas de la clase |
| El primer verde | 12 | «Avisad cuando veáis el primer byte en verde» | En la propia demo |
| ¿Sube la cresta? | 13, antes del paso 3 | Predicción a mano alzada | En el paso 3: no sube, baja el azar |
| Esconder la moneda | 15, paso 0 | Dos o tres ideas del público | Las dos familias, en pantalla |
| El QR | 17 | Escanear la web | — |

## 5. Si algo falla

- **Sin WebGL**, el juego no se puede jugar: se queda su póster. Se cuenta con la página del PDF
  (1000 tiradas, la G trucada y fuera de la franja) y se sigue igual.
- **La demo, los vídeos o la placa:** plan B en el [`README.md`](README.md#plan-b).

## 6. Prueba de comprensión

Para quien haga de público en un ensayo:

- **Qué se le da:** la presentación tal como se va a dar (o, si no puede estar en el ensayo,
  `build/presentacion.pdf` con las notas del ponente) y la tabla de preguntas de abajo. **No** se le da
  la §7, que tiene las respuestas.
- **Cuándo aprueba:** si acierta 6 de las 8 preguntas y, entre ellas, las 3, 4 y 5, que son el núcleo
  de la analogía.

| Nº | Pregunta | Dónde se aprende |
|---|---|---|
| 1 | ¿Por qué el consumo del chip puede delatar la clave? | 5 |
| 2 | ¿Por qué el ataque va byte a byte? | 6 |
| 3 | En la analogía, ¿qué es cada moneda, cada tirada y la trampa? | 2 y 9 |
| 4 | ¿Por qué no basta con una traza, ni con diez? | 2, 9 y 13 |
| 5 | En la montaña, ¿qué es la altura y qué es el plano? ¿Qué cambia al meter más trazas? | 13 |
| 6 | ¿Cuántas trazas hicieron falta en nuestra placa y cuánto se tarda en capturarlas? | 14 |
| 7 | Con monedas, ¿por qué frenan el ataque barajar y las esperas al azar? ¿Por qué barajar solo multiplicó las trazas por 3,6? | 13 y 15 |
| 8 | ¿Este ataque rompe AES? ¿Qué hace falta para hacerlo? | 16 |

## 7. Respuestas esperadas (solo para quien corrige)

| Nº | Respuesta esperada, en llano | Señal de que no se entendió |
|---|---|---|
| 1 | Porque la corriente cambia con el número de unos del byte que maneja, y ese byte sale de mezclar un byte del mensaje con uno de la clave y pasarlo por la S-box | «Porque la clave se lee de la memoria» o «porque la corriente la transmite» |
| 2 | Porque al principio cada byte de la clave solo se mezcla con su byte del mensaje, que conocemos, y se puede comprobar por separado: 16 veces 256 pruebas, como un PIN cifra a cifra, en vez de todas las claves posibles | Creer que se prueban las 2¹²⁸ claves |
| 3 | Moneda: un candidato a byte de la clave. Tirada: una traza, la corriente mientras el chip cifra un mensaje. Trampa: el consumo se parece un poco a lo que predice el candidato correcto | Decir que la tirada es una ronda o un ciclo, o que la moneda es la clave entera o el chip |
| 4 | Porque con pocas medidas la suerte hace que cualquier candidato parezca bueno, como cualquier moneda puede parecer trucada con pocas tiradas. Solo al repetir mucho, la trampa sale de lo que puede hacer el azar | «Porque la placa mide mal» o «porque una traza no contiene la clave» |
| 5 | La altura es cuánto se parece cada candidato al consumo en cada instante. El plano es lo que puede hacer el azar, hasta donde llega el falso con más suerte. Con más trazas baja el plano y la cresta del correcto no crece (hasta baja un poco: la suerte también la inflaba) | «La cresta del correcto crece con más trazas» |
| 6 | Unas 100: con 112, 9 de cada 10 repeticiones sacan la clave entera. Son unos segundos de captura (unos 6 s para 112) | Dar el número de tiradas del juego como si fuera el del chip, o creer que hicieron falta 100 × 112 trazas |
| 7 | Barajar cambia el orden de los bytes: la trampa de cada uno solo asoma en una de cada 16 tiradas, y cuesta más verla. Las esperas impiden saber cuándo mirar. Barajar solo multiplicó por 3,6 porque solo se barajó la S-box, y las mezclas siguientes vuelven a cargar cada byte en su sitio: la segunda cresta. Con esperas, 0 de 16 incluso con 20 000 trazas, pero sumando ventanas el atacante recupera 7 | «Barajar no sirve» o «las esperas hacen el chip invulnerable» |
| 8 | No: ataca una implementación que filtra por la corriente. Hace falta conocer los mensajes, medir el chip y muchos cifrados con la misma clave, del orden de cien | «AES ya no es seguro» |
