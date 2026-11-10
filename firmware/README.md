# Firmware víctima

No hay firmware propio: se usa `simpleserial-aes` de NewAE
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

Si se hace la contramedida opcional (fase 6), el firmware modificado irá en
este directorio.
