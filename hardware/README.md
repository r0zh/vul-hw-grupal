# Hardware: ChipWhisperer-Nano

**Estado (2026-11-10):** se usa un **ChipWhisperer-Nano** (NewAE CW1101) para capturar y como víctima. El software está preparado y probado sin hardware (`captura/`, `firmware/` y `analisis/real.py`), pero **todavía no se ha conectado ninguna placa**. Se descartan el osciloscopio TDS 220 y el montaje DIY con el ATmega328P; el plan anterior queda en el historial de git (commit `1402b04`).

## Qué es

Placa de NewAE con el capturador y el chip víctima en la misma PCB, conectada al PC por micro-USB. Según la [documentación de NewAE](https://chipwhisperer.readthedocs.io/en/latest/Capture/ChipWhisperer-Nano.html) (consultada el 2026-11-10, y `docs/source/Capture/ChipWhisperer-Nano.md` del commit `c5e8151` del repo de NewAE):

| | |
|---|---|
| Víctima | STM32F030 (Cortex-M0), programable desde el propio Nano por UART |
| ADC | 8 bits, hasta 20 MS/s, con reloj interno síncrono con el del target o reloj externo |
| Entrada analógica | Acoplada en AC, ganancia fija de unos 10 dB |
| Buffer | 50 000 muestras por captura, sin *presampling* ni *streaming* |
| Trigger | Flanco de subida en TIO4: empieza a muestrear en el primer ciclo tras el trigger |
| Serie | TIO1 (RX) y TIO2 (TX), a 3,3 V |
| USB | VID `2b3e`, PID `ace0` |

`scope.default_setup()` deja el ADC y el reloj del target a **7,5 MHz** los dos, es decir, una muestra por ciclo de reloj del target y en fase con él, con 5000 muestras por traza. Esto es lo que más cambia frente al plan del TDS 220: no hay que alinear las trazas ni sincronizar el muestreo a mano.

**¿Y si no es un Nano?** El script de captura funciona también con un ChipWhisperer-Lite (CW1173) o un Husky, pero entonces hay que indicar el target con `--platform CWLITEARM` (STM32F3) o `--platform CWLITEXMEGA` (XMEGA). Lo que diga `python -m captura.cw info` decide cuál es.

## Firmware víctima

`simpleserial-aes` de NewAE con `CRYPTO_TARGET=TINYAES128C`, el AES-128 en C sin protecciones de los laboratorios SCA101. Se compila con [`firmware/build.sh`](../firmware/build.sh); detalles en [`firmware/README.md`](../firmware/README.md). El firmware sube el trigger, cifra y lo baja, y devuelve el texto cifrado por SimpleSerial 1.1.

## Puesta en marcha (primera vez en el portátil)

1. **Reglas udev** (una vez, antes de enchufar):

   ```sh
   sudo cp ~/Programacion/ext/chipwhisperer/50-newae.rules /etc/udev/rules.d/
   sudo groupadd -f chipwhisperer && sudo usermod -aG chipwhisperer "$USER"
   sudo udevadm control --reload-rules
   ```

   Después hay que cerrar sesión y volver a entrar, o abrir una shell con `newgrp chipwhisperer`.
2. **Enchufar** y comprobar que aparece: `lsusb | grep 2b3e`.
3. **Entorno:** `uv sync --group captura` (la primera vez tarda unos 4 minutos porque clona el repo de NewAE).
4. **Conexión:** `uv run python -m captura.cw info`. Si avisa de que el firmware del Nano es antiguo, se actualiza con `scope.upgrade_firmware()` desde Python, se desconecta y se vuelve a conectar.
5. **Programar la víctima:** `uv run python -m captura.cw programar`.
6. **Prueba corta:** `uv run python -m captura.cw capturar -n 50 --nombre prueba`. Cada texto cifrado se comprueba contra `analisis/aes.py`; si no coincide, el script se para.
7. **SPA y ventana:** se abre `analisis/salida/<campaña>/cpa-correlacion.pdf` y se mira la traza media para localizar la primera ronda.
8. **Campaña:** `uv run python -m captura.cw capturar -n 3000 --nombre nano-tinyaes` y `uv run python -m analisis.real datos/brutos/<campaña>`.

## Puntos a revisar

Son hipótesis hasta que haya medidas:

1. **Versión del firmware del Nano.** El paquete de Python es la rama `develop` de NewAE (7.0.0 sin publicar); puede pedir actualizar el firmware de la placa.
2. **¿Caben las 5000 muestras?** Si el JSON de la campaña trae `trig_count_mediana`, es la duración del cifrado en ciclos de ADC; si no, se estima con la traza media. Para el CPA de la primera ronda basta con el principio de la traza, y luego se recorta con `--ventana`.
3. **Número de trazas.** Que los tutoriales de NewAE recuperen la clave en el Nano no garantiza cuántas trazas harán falta aquí (regla 3 de `AGENTS.md`). Se mide con la curva de rango.
4. **Velocidad de captura.** Sin medir; el script imprime las trazas por segundo.

## Material que ya no hace falta

El RS-232 y el null-modem solo servían para el TDS 220, y los cristales, para el ATmega328P en protoboard. El adaptador y el null-modem se pueden devolver hasta el 2027-02-06 (Amazon.es, pedido del 2026-11-07); el plazo de los cristales no está comprobado.

| Componente | Precio |
|---|---:|
| Cristales de 16 MHz Qury, 10 unidades | 6,99 € |
| [Adaptador USB a RS-232 BENFEI](https://www.amazon.es/dp/B0753HBT12) | 11,99 € |
| [Cable null-modem StarTech SCNM9FF1MBK](https://www.amazon.es/dp/B00QM8ZP5E) | 7,96 € |
| **Total** | **26,94 €** |

La Kuman UNO R3 y el kit de componentes son del equipo y no se usan.
