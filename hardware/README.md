# Hardware: ChipWhisperer-Nano

**Estado (2026-11-13):** se usa un **ChipWhisperer-Nano** para capturar y como víctima. La placa se conectó el 2026-11-13: se identifica por USB como un Nano de NewAE, el firmware víctima cifra bien y una campaña de 3000 trazas recupera los 16 bytes de la clave (ver [Medidas](#medidas-del-2026-11-13)). Queda pendiente confirmar el chip víctima, que no responde como el STM32F030 que documenta NewAE. Se descartan el osciloscopio TDS 220 y el montaje DIY con el ATmega328P; el plan anterior queda en el historial de git (commit `1402b04`).

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

**¿Y si no fuera un Nano?** El script de captura funciona también con un ChipWhisperer-Lite (CW1173) o un Husky, pero entonces hay que indicar el target con `--platform CWLITEARM` (STM32F3) o `--platform CWLITEXMEGA` (XMEGA). Lo que diga `python -m captura.cw info` decide cuál es.

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

## Medidas del 2026-11-13

Primera conexión, en el portátil del equipo (Arch Linux, `chipwhisperer` 7.0.0 de la rama `develop`, commit `c5e8151`).

**Identificación**

| | |
|---|---|
| USB | `2b3e:ace0`, *NewAE Technology Inc.* / *ChipWhisperer Nano*, `bcdDevice` 9.00 |
| Número de serie | `53333200524b34533230313131313039` |
| `captura.cw info` | `tipo: CWNano`, plataforma `CWNANO` |
| Firmware del scope | 0.65.0, el más reciente que trae la biblioteca (`scope.latest_fw`): no se actualizó |
| Relojes | ADC y target a 7,5 MHz (`clk_src = int`), 5000 muestras por traza |
| Chip víctima | El bootloader serie del STM32 (versión 3.1) responde con el ID `0x445`, que la biblioteca de NewAE etiqueta como `STM32F04xxx`, y el registro de tamaño de flash (`0x1FFFF7CC`) dice 32 KB. NewAE documenta un STM32F030F4P6 (ID `0x444`, 16 KB), así que no es ese. **Falta leer la serigrafía del chip** para saber el modelo exacto, y hacer la foto de la PCB |

**Firmware víctima:** `simpleserial-aes-CWNANO.hex`, SHA-256 `b37e4342027c41fd46f61906cbd516edc37a68ec0ed7b8b48948c768f8f01711` (5719 bytes de flash, verificados por el programador). Los textos cifrados de las 3050 trazas capturadas coinciden con `analisis/aes.py`.

**Calidad de la captura** (campaña `20261113-180036-nano-tinyaes`, 3000 trazas):

- **Velocidad:** 18,6 trazas/s (3000 trazas en 161 s).
- **SPA:** la traza media muestra bloques que se repiten cada ~950 muestras; los picos de correlación del CPA caen en el primero (muestras 462 a 676), así que la primera ronda entra de sobra en las 5000 muestras. El JSON no trae `trig_count_mediana`: el Nano no expone el contador de trigger.
- **Alineación:** la desviación típica entre trazas, muestra a muestra, tiene una mediana de 0,005, del orden de un escalón del ADC (1/256 ≈ 0,0039), con textos claros aleatorios. Las trazas salen alineadas sin procesar.
- **Saturación:** 184 de 15 millones de muestras tocan el mínimo del ADC (−0,5), como mucho una por traza y ninguna entre las muestras 450 y 700. El resto de la traza queda entre −0,5 y 0,03.

**Ataque** (`python -m analisis.real`): 16/16 bytes con 3000 trazas, con |ρ| entre 0,59 y 0,62 para el candidato correcto. El rango 1 se estabiliza entre 24 y 90 trazas según el byte. Con 50 trazas de prueba salían 13/16. La rejilla de N de `real.py` es geométrica, así que estas cifras son cotas, no el mínimo exacto.

**Respaldo:** `datos/20261113-nano-tinyaes-respaldo` (1000 trazas × muestras 0 a 1500, 1,4 MB) recupera también los 16 bytes.

## Puntos a revisar

1. **Chip víctima.** Ver la tabla de arriba: falta la serigrafía y la foto. La memoria dice «STM32F0» y explica la discrepancia (sección 2.5).
2. **Firmware del Nano.** Los textos cifrados de todas las campañas (también las de contramedidas, con firmware propio) se comprobaron contra `analisis/aes.py`.

## Otras campañas del 2026-11-13

Todas en `datos/brutos/`, con recortes versionados en `datos/` (los que usa `analisis/reales.py`):

| Campaña | Trazas × muestras | Para qué | Recorte en `datos/` |
|---|---|---|---|
| `20261113-181900-spa-larga` | 100 × 30 000 | SPA del cifrado completo | `20261113-spa` (100 × 11 000) |
| `20261113-182031-texto-fijo` | 500 × 5000 | Ruido y alineación con el texto claro del FIPS-197 | `20261113-texto-fijo` (500 × 1500) |
| `20261113-182531-cm-base` | 3000 × 5000 | Fase 6: AES propio sin contramedidas | `20261113-cm-base` (1000 × 1500) |
| `20261113-182830-cm-barajado` | 3000 × 5000 | Fase 6: SubBytes barajado | `20261113-cm-barajado` (2000 × 1500) |
| `20261113-*-cm-retardos` | 20 000 × 5000 | Fase 6: retardos aleatorios | `20261113-cm-retardos` (2000 × 2000) |

**Resultado de la fase 6** (el mismo CPA en las tres variantes; sección 4.4 de la memoria):

| Variante | Trazas | Bytes | N para el 90 % |
|---|---|---|---|
| Sin contramedida | 1000 | 16/16 | 132 |
| SubBytes barajado | 2000 | 16/16 | 475 |
| Retardos aleatorios | 2000 | 0/16 | no recupera |

Con la campaña completa de 20 000 trazas tampoco se recuperan los retardos (0/16; el pico del candidato correcto queda por debajo del mejor falso). Sumando ventanas de 300 muestras antes de correlar sí: 7 de 16 bytes. El generador del firmware es un xorshift32 con semilla fija, así que sirve para medir el efecto de la aleatorización pero no es una contramedida real (ver [`../firmware/README.md`](../firmware/README.md)).

## Material que ya no hace falta

El RS-232 y el null-modem solo servían para el TDS 220, y los cristales, para el ATmega328P en protoboard. El adaptador y el null-modem se pueden devolver hasta el 2027-02-06 (Amazon.es, pedido del 2026-11-07); el plazo de los cristales no está comprobado.

| Componente | Precio |
|---|---:|
| Cristales de 16 MHz Qury, 10 unidades | 6,99 € |
| [Adaptador USB a RS-232 BENFEI](https://www.amazon.es/dp/B0753HBT12) | 11,99 € |
| [Cable null-modem StarTech SCNM9FF1MBK](https://www.amazon.es/dp/B00QM8ZP5E) | 7,96 € |
| **Total** | **26,94 €** |

La Kuman UNO R3 y el kit de componentes son del equipo y no se usan.
