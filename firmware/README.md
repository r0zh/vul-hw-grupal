# Firmware víctima

La víctima principal no es firmware propio: se usa `simpleserial-aes` de NewAE
([newaetech/chipwhisperer](https://github.com/newaetech/chipwhisperer), commit
`c5e8151`, el mismo que el paquete de Python del grupo `captura`) con
`CRYPTO_TARGET=TINYAES128C`, un AES-128 en C sin contramedidas. El protocolo es
SimpleSerial 1.1: `k` carga la clave, `p` cifra un bloque y el firmware sube el
trigger (TIO4) durante el cifrado.

```sh
firmware/build.sh            # CWNANO, CWLITEARM y CWLITEXMEGA → firmware/build/*.hex
firmware/build.sh CWNANO     # solo el Nano
```

Hace falta `arm-none-eabi-gcc` (y `avr-gcc` para el XMEGA). `firmware/build/`
está ignorado por git: el `.hex` es un derivado del código de NewAE y se
regenera. El SHA-256 del `.hex` usado queda en el JSON de cada campaña.

## Contramedidas (fase 6)

`contramedida/` tiene un AES-128 propio (`aes-cm.c`, con la estructura de
tiny-AES, que es de dominio público) que sustituye a la biblioteca de AES de
NewAE y se enlaza con el mismo `simpleserial-aes.c`, así que el protocolo y el
trigger no cambian. Se compilan tres variantes:

| Variante | Opción | Qué hace |
|---|---|---|
| `base` | — | Sin contramedidas: referencia con el mismo código |
| `retardos` | `CM_DELAY` | Retardo de 0 a 15 vueltas de un bucle antes de cada byte de SubBytes, de cada columna de MixColumns y de cada ronda |
| `barajado` | `CM_SHUFFLE` | SubBytes recorre los 16 bytes en un orden aleatorio en cada cifrado (128 órdenes posibles); ShiftRows y MixColumns no se barajan |

```sh
firmware/contramedida/build.sh     # → firmware/build/simpleserial-aes-cm-{base,retardos,barajado}-CWNANO.hex
uv run python -m captura.cw --firmware firmware/build/simpleserial-aes-cm-retardos-CWNANO.hex \
  capturar --programar -n 20000 --nombre cm-retardos --fuente "aes-cm.c con CM_DELAY"
```

El generador es un xorshift32 con semilla fija de compilación: el STM32 de la
placa no tiene generador aleatorio por hardware. Basta para medir cuánto
empeora el ataque si el atacante no explota el generador, pero **no es una
contramedida utilizable tal cual**: con el código y la semilla públicos, los
retardos son predecibles tras un reset.
