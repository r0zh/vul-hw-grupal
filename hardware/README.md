# Montaje hardware (DIY)

**Estado (2026-11-07):** material de la placa comprado. El osciloscopio es un **Tektronix TDS 220** que presta un profesor, para usarlo en el laboratorio del departamento. **Pendiente:** saber si tiene el módulo de comunicaciones, comprobar los componentes del kit propio y confirmar las sesiones de laboratorio.

## Arquitectura

```
                 USB                    TX, RX, RESET, GND
  PC ◄──────────────────► Arduino Uno ◄────────────────────► ATmega328P en protoboard
   ▲                      (sin chip:                           (AES-128 software,
   │                      puente USB-serie)                     cristal de 16 MHz)
   │                                                            │ VCC         │ GPIO
   │ USB ↔ RS-232                               5 V ──[shunt]───┘             │ (trigger)
   │ + null-modem                                          │                  │
   │ (si hay módulo)                                       │                  │
  TDS 220 ◄── CH1: lado del chip del shunt, acoplamiento AC┘                  │
          ◄── CH2: trigger ───────────────────────────────────────────────────┘
```

1. El PC envía 16 bytes de texto claro por serie, a través de la Uno.
2. El firmware sube el GPIO de trigger, cifra con la clave de laboratorio, baja el trigger y devuelve el texto cifrado.
3. El osciloscopio dispara con el trigger y captura en el CH1 la tensión en el lado del chip del shunt, que varía con la corriente del MCU.
4. El PC lee la traza del osciloscopio por RS-232 y guarda `(texto claro, texto cifrado, traza)` por cada cifrado.

## Osciloscopio: Tektronix TDS 220

Condiciones del préstamo: solo en el laboratorio del departamento, por la mañana. Hay que escribir al profesor con antelación para quedar, recoger y devolver el osciloscopio en su despacho. No hay documentación en papel.

Especificaciones según la [ficha de Tektronix](https://www.tek.com.cn/document/fact-sheet/tds-210-tds-220-fact-sheet) (consultada el 2026-11-07):

- 2 canales, 100 MHz de ancho de banda y 1 GS/s como máximo.
- **Registro de 2500 puntos por canal.** La frecuencia de muestreo efectiva depende de la base de tiempos (250 puntos por división):

| Base de tiempos | Ventana | Muestreo | Muestras/ciclo a 16 MHz | Ciclos capturados |
|---|---|---|---|---|
| 1 µs/div | 10 µs | 250 MS/s | ~15 | 160 |
| 2,5 µs/div | 25 µs | 100 MS/s | ~6 | 400 |
| 5 µs/div | 50 µs | 50 MS/s | ~3 | 800 |

No cabe el AES entero con buena resolución: el trigger debe rodear solo AddRoundKey y SubBytes de la primera ronda. Si la ventana no basta, se baja el reloj del MCU con el prescaler `CLKPR`.

### Módulo de comunicaciones (bloqueante)

El TDS 220 de serie no tiene interfaz con el PC. Hace falta el módulo **TDS2CM** o **TDS2MM**, que va atornillado en la parte trasera con conectores RS-232 (DB-9), GPIB y Centronics. Tektronix ya no lo vende ([FAQ de Tektronix](https://www.tek.com.cn/support/faqs/there-communications-module-available-my-tds220-tds2cm-and-tds2cma-modules-are-no-longe), [TekWiki](https://w140.com/tekwiki/wiki/TDS2CM), consultados el 2026-11-07). Se ha pedido al profesor una foto de la parte trasera.

- **Con módulo, por RS-232:** hasta 19 200 baudios, puerto DTE de 9 pines (según distribuidores, sin verificar en el manual). Con 1 byte por punto, una traza completa ocupa unos 2,5 kB, que son ~1,3 s de transferencia. Con `DATa:STARt`/`DATa:STOP` se transfiere solo la ventana útil. Estimación sin medir: 1–2 s por traza, es decir, 5000 trazas en 2–3 h.
- **Comandos previstos:** `ACQuire:STOPAfter SEQuence`, `ACQuire:STATE RUN`, `DATa:WIDth 1`, `DATa:ENCdg RIBinary` y `CURVe?`. Hay que confirmarlos en el [manual de programación TDS 200 (071-0493-01)](https://mmrc.caltech.edu/Oscilliscope/OSC_TDS200_PROG.pdf), que exige firmware ≥ 1.04 en el TDS2CM.
- **Sin módulo:** ver el [plan B](#plan-b-si-no-hay-módulo).

## Material

### Comprado (Amazon.es, 2026-11-07)

| Componente | Producto | Precio | Notas |
|---|---|---:|---|
| Arduino Uno R3 con ATmega328P DIP | [Arduino UNO Rev3 A000066](https://www.amazon.es/dp/B008GRTSV6) | 20,51 € | El chip va en zócalo: se programa en la Uno y se pasa a la protoboard. La Uno sin chip hace de puente USB-serie. No trae cable USB |
| Cristal de 16 MHz | Qury, 10 unidades, HC-49S (enlace por añadir) | 6,99 € | ±20 ppm, carga de 20 pF, ESR de 30 Ω |
| Adaptador USB a RS-232 | [BENFEI, DB-9 macho, chip Prolific, 1,8 m](https://www.amazon.es/dp/B0753HBT12) | 11,99 € | RS-232 real con todas las líneas de control. Driver `pl2303` del kernel de Linux |
| Cable null-modem | [StarTech SCNM9FF1MBK, DB-9 hembra-hembra, 1 m](https://www.amazon.es/dp/B00QM8ZP5E) | 7,96 € | Cruzado: el adaptador y el TDS 220 son los dos DTE |
| **Total** | | **47,45 €** | |

El adaptador RS-232 y el null-modem solo sirven si el osciloscopio tiene módulo. Se pueden devolver hasta el 2027-02-06.

### Del kit propio (pendiente de comprobar)

| Componente | Para qué |
|---|---|
| Resistencias de 10 Ω y 100 Ω | Shunt: 10 Ω, 20 Ω y 30 Ω con resistencias de 10 Ω en serie, y unos 50 Ω con dos de 100 Ω en paralelo |
| Resistencia de 10 kΩ | *Pull-up* del RESET |
| Condensadores cerámicos de 22 pF (×2) | Carga del cristal |
| Condensadores de 100 nF y un electrolítico de 10–100 µF | Desacoplo |
| Protoboard y cables dupont | Montaje |
| Cable USB-A a USB-B | PC ↔ Uno |

Si faltan los de 22 pF o los de 100 nF, se compran aparte. No son críticos hasta montar el chip en la protoboard.

### Del laboratorio (a confirmar con el profesor)

- Las dos sondas del osciloscopio (CH1 para el shunt y CH2 para el trigger).
- Una fuente de alimentación de banco. Si no hay, se alimenta desde el pin de 5 V de la Uno.

## Montaje

- **ATmega328P en protoboard.** VCC (pin 7) y AVCC (pin 20) se alimentan los dos a través del shunt. GND en los pines 8 y 22. El cristal va entre XTAL1 (pin 9) y XTAL2 (pin 10), con un condensador de 22 pF de cada pata a masa. El RESET (pin 1) lleva un *pull-up* de 10 kΩ a 5 V.
- **Uno como puente USB-serie** (sin el chip): pin 0 (RX) de la Uno al pin 2 del chip (RXD), pin 1 (TX) de la Uno al pin 3 (TXD), sin cruzar, porque las etiquetas de la Uno son las del ATmega328P. RESET de la Uno al pin 1 del chip y masas unidas. El chip conserva el bootloader de la Uno, así que se programa por serie como siempre ([foro de Arduino](https://forum.arduino.cc/t/how-to-upload-sketches-to-standalone-atmega328-ics-on-breadboard-using-uno/679791), consultado el 2026-11-07).
- **Shunt en VCC (*high-side*).** Es lo que hace el CW304 NOTDuino de NewAE, un ATmega328P preparado para análisis de consumo con un shunt de 51 Ω en VCC ([documentación del CW304](https://chipwhisperer.readthedocs.io/en/latest/Targets/CW304%20Notduino%20Target.html), consultada el 2026-11-07). Con el shunt en GND, la masa del chip se movería con el consumo y arrastraría las referencias del UART y del trigger. Se mide el lado del chip con acoplamiento AC y la masa común.
- **Valor del shunt.** NewAE sugiere empezar entre 10 y 33 Ω y quedarse con el máximo que deje funcionar al chip ([foro de NewAE](https://forum.newae.com/t/value-of-shunt-location-vcc/2621), [otro hilo](https://forum.newae.com/t/chosing-shunt-resistor/2132), consultados el 2026-11-07). Se prueban 10, 20, 30 y 50 Ω.

## Calendario (entrega avanzada el 2026-11-16)

Franjas que se van a pedir al profesor, **pendientes de confirmar**:

| Día | Qué | Franja |
|---|---|---|
| Dom. 8–lun. 9 | Firmware probado en la Uno (vectores del FIPS-197 y trigger) y montaje en protoboard | En casa |
| Mar. 10 | **Sesión 1:** conexión con el PC (`*IDN?`, `CURVe?`), primera traza, elección del shunt, duración de la ronda 1 y SPA con *average*. Se intentará alargar durante la clase del profesor hasta las 14:30. Ese día hay huelga: si el profesor no está, se busca otra franja | 10:45–12:30 (hasta 14:30) |
| Jue. 12 | **Sesión 2:** campaña de captura, o terminar lo que quede de la sesión 1 | 8:45–10:30 y/o 12:45–14:00 |
| Sáb. 14–dom. 15 | CPA sobre trazas reales, figuras y memoria | — |

## Plan B si no hay módulo

1. **ChipWhisperer-Nano** (el laboratorio podría tener uno, sin confirmar) para el CPA completo con su propio chip víctima, y el TDS 220 para la SPA y la caracterización de la fuga del ATmega328P.
2. **CPA manual de un byte con el TDS 220** (idea propia, sin probar): el firmware cifra en bucle siempre el mismo texto claro, el osciloscopio promedia 64–128 trazas y se lee con el cursor la amplitud en el instante de SubBytes del byte 0. Repetido con unos 30 textos claros, sale un CPA de un byte con `analisis/`. Riesgo: que la diferencia entre pesos de Hamming quede por debajo de la resolución de 8 bits incluso promediando.

## Puntos a revisar

Son hipótesis de trabajo: hay que comprobar cada una con medidas o con la documentación.

1. **Desacoplo.** Los condensadores entre VCC y GND del chip filtran justo las variaciones que queremos medir. Hipótesis: ponerlos en el lado de la fuente del shunt y no en el del chip. No se ha podido ver dónde los coloca el NOTDuino.
2. **Sondas en ×1 o ×10.** En ×1 la señal no se atenúa, pero las sondas pasivas pierden mucho ancho de banda. Se prueban las dos.
3. **Muestreo frente a reloj.** El muestreo del TDS 220 no está sincronizado con el reloj del MCU. Si 100 MS/s a 16 MHz no basta, se baja el reloj con `CLKPR`, y hay que reajustar el baud rate del UART.
4. **Masas.** El osciloscopio está conectado a la tierra de la red. Conviene que el portátil funcione con batería durante las medidas, para evitar bucles de masa a través del USB.
5. **Velocidad de captura por RS-232.** La estimación de 1–2 s por traza no está medida.

## Criterios de validación

- Una traza individual en la que se distingan las 10 rondas de AES (SPA visual).
- Trazas repetibles: mismo texto claro → trazas casi idénticas una vez alineadas.
- CPA sobre las trazas reales que recupere al menos un byte de clave, antes de pasar a los 16.
