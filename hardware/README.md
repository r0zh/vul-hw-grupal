# Montaje hardware (DIY)

**Estado:** ruta DIY con ATmega328P (Arduino Nano) elegida. **Pendiente:** que un profesor confirme si podemos usar un osciloscopio de la universidad. No se compra nada hasta tener esa respuesta.

## Arquitectura

```
        serie: texto claro ──►
  PC ◄───────────────────────────────►  ATmega328P (AES-128 software)
   ▲    ◄── texto cifrado                 │ VCC/GND        │ GPIO
   │                                      │                │ (trigger)
   │ USB                                [shunt]            │
   │                                      │                │
  Osciloscopio ◄── CH1: caída en el shunt ┘                │
               ◄── CH2: trigger ───────────────────────────┘
```

1. El PC envía 16 bytes de texto claro por serie.
2. El firmware sube el GPIO de trigger, cifra con la clave de laboratorio, baja el trigger y devuelve el texto cifrado.
3. El osciloscopio captura la caída de tensión en el shunt (proporcional a la corriente del MCU) alineada con el trigger.
4. El PC guarda `(texto claro, texto cifrado, traza)` por cada cifrado.

## Material preliminar

Precios del contexto inicial, **sin verificar**. Antes de comprar, apuntar el enlace y la fecha de consulta.

| Componente | Estimación | Notas |
|---|---:|---|
| Arduino Nano compatible (ATmega328P) | 5–9 € | Ver punto 1 de la lista de abajo |
| Resistencia shunt | 1–3 € | Valor por decidir |
| Protoboard, cables y conectores | 10–20 € | |
| Cables o adaptadores adicionales | 5–15 € | |
| Amplificador analógico de bajo ruido | ~7 € | Solo si la señal es demasiado pequeña |
| Osciloscopio USB Hantek 6022BE | 96,26 € | Solo si la universidad no presta uno |

Total aproximado: 20–45 € con osciloscopio de la universidad y 120–150 € comprándolo.

## Puntos a revisar antes de montar

Son hipótesis de trabajo: hay que comprobar cada una con medidas o con la documentación.

1. **Placa Nano o ATmega328P suelto.** En el Nano, el regulador, el conversor USB-serie y los condensadores de desacoplo comparten alimentación con el MCU, y no es fácil aislar su corriente. Un ATmega328P en protoboard (cristal y condensadores) permite poner el shunt solo en su línea de VCC o GND, con el mismo firmware.
2. **Desacoplo.** Los condensadores entre VCC y GND filtran justo las variaciones que queremos medir. Hay que ver dónde colocar el shunt respecto a ellos.
3. **Muestreo frente a reloj.** A 16 MHz, un capturador de unos 48 MS/s sin sincronizar con el reloj del MCU toma unas 3 muestras por ciclo. Bajar el reloj (prescaler `CLKPR` o un cristal más lento) mejora la resolución temporal, pero obliga a reajustar el baud rate del UART.
4. **Trigger.** Si el osciloscopio dispara por software, se captura el trigger en el CH2 y las trazas se alinean en Python.
5. **Shunt y masas.** Un shunt en GND (*low-side*) permite medir respecto a masa con una sonda normal. Ojo con los bucles de masa entre el PC, la placa y el osciloscopio USB.
6. **Captura automatizada.** Hacen falta miles de trazas, así que el osciloscopio tiene que poder controlarse desde Python en Linux: SCPI/`pyvisa` en uno de laboratorio, o `sigrok`/OpenHantek en un Hantek. Hay que comprobarlo antes de comprar.

## Criterios de validación

- Una traza individual en la que se distingan las 10 rondas de AES (SPA visual).
- Trazas repetibles: mismo texto claro → trazas casi idénticas una vez alineadas.
- CPA sobre las trazas reales que recupere al menos un byte de clave, antes de pasar a los 16.
