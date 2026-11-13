# Captura de trazas

`captura/cw.py` controla el ChipWhisperer y guarda campañas con el formato de
`captura/campana.py` en `datos/brutos/` (ignorado por git). La puesta en marcha
del hardware está en [`hardware/README.md`](../hardware/README.md).

```sh
uv sync --group captura                          # chipwhisperer (rama develop fijada)
uv run python -m captura.cw info                 # tipo de scope, firmware y plataforma
uv run python -m captura.cw programar            # firmware/build/simpleserial-aes-<PLATFORM>.hex
uv run python -m captura.cw capturar -n 50 --nombre prueba
uv run python -m analisis.real datos/brutos/<fecha>-prueba
```

Opciones de `capturar`: `-n` (trazas), `--samples` (5000; el Nano llega a
50 000), `--key` (por defecto la clave de laboratorio de `analisis/config.py`),
`--seed` (textos claros), `--texto-fijo HEX` (el mismo texto claro en todas las
trazas, para medir el ruido y la alineación), `--programar` (programa antes de
capturar), `--fuente` (descripción del firmware para el JSON) y `--notas`
(texto libre al JSON). El firmware se elige con `--firmware RUTA.hex` antes del
subcomando. Con un Lite o un Husky hay que añadir `--platform CWLITEARM` o
`--platform CWLITEXMEGA`, también antes del subcomando.

**Recortes para el repositorio:** `datos/brutos/` está ignorado. Las campañas
que usan la memoria y la web se recortan a `datos/` con
`uv run python -m captura.campana ORIGEN DESTINO -n 1000 --muestras 0:1500`,
que anota el origen del recorte en el JSON.

Cada texto cifrado que devuelve el target se compara con `analisis/aes.py`: si
no coincide, la captura se para.

**Sin hardware:** `capturar --simular` recorre el mismo camino con trazas
sintéticas de `analisis/simulate.py` y marca la campaña con `"simulada": true`.
Sirve para probar el flujo, nunca como resultado.

## Por qué la rama `develop` de NewAE

`chipwhisperer` 6.0.0 de PyPI exige `numpy<=1.26.4`, incompatible con
`numpy>=2.0` del proyecto y sin *wheels* para Python 3.14. La rama `develop`
(versión 7.0.0 sin publicar) admite numpy 2 y se fija a un commit en
`pyproject.toml`. Va en un grupo aparte para que la CI del análisis no la
instale.
