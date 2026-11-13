# AGENTS.md

Contexto y normas del repositorio para el equipo y para cualquier agente (Claude Code, Codex, etc.). **Es la fuente de verdad del proyecto:** si una decisión cambia, se actualiza aquí.

## Proyecto

Trabajo grupal de **Vulnerabilidades Hardware** (ETSI Informática, Universidad de Málaga): demostrar y documentar un **ataque de análisis de consumo por correlación (CPA) sobre AES-128** ejecutado en un microcontrolador, con trazas medidas por nosotros con un ChipWhisperer-Nano.

- **Equipo:** Juan Diego Bermúdez Ureba, Brian Polo Caballero, Alberto Bartolomé Iruela y Roberto Sánchez Martín.
- **GitHub:** <https://github.com/r0zh/vul-hw-grupal> (**público**). Colaboradores: `r0zh`, `Alman368`, `juandiego-bmu` y `plc50` (Brian; pendiente de invitar).
- **Entregables:** dos PDF, memoria y presentación. Se puede actualizar la entrega hasta el día de la presentación y solo la sube un miembro. Enunciado y rúbrica completos en [`docs/enunciado.md`](docs/enunciado.md).
- **Fecha de presentación:** aún no se conoce. El **2026-11-16** hay que presentar una versión bastante avanzada, casi final.
- **Artículo base:** J. Mishra y S. K. Sahay, *Modern Hardware Security: A Review of Attacks and Countermeasures*, arXiv:2501.04394, 2025. Secciones relevantes: II.B (SPA, DPA y CPA), III.C (ataques DPA a implementaciones criptográficas) y III.D (contramedidas).

## Qué se demuestra

- **Objetivo:** recuperar la clave de laboratorio de un AES-128 software sin protecciones que se ejecuta en el STM32F0 (modelo exacto por confirmar) del ChipWhisperer-Nano, a partir de trazas de consumo capturadas con el propio Nano.
- **Valor intermedio atacado:** salida de la S-box de la primera ronda, `SBox(p ⊕ k)`, para cada byte de clave por separado (16 × 256 candidatos).
- **Modelo de fuga:** peso de Hamming. Para cada candidato `k` y cada instante `t` se calcula la correlación de Pearson `ρ(k, t) = corr(HW(SBox(p_i ⊕ k)), T_i[t])` sobre las `N` trazas. Se elige el `k` con mayor `max_t |ρ(k, t)|`.
- **SPA** sirve para localizar las rondas en la traza; **DPA** (diferencia de medias por partición) se explica como antecedente; **CPA** es el ataque principal de la demo.
- **Métricas que se reportan:** correlación frente al tiempo (pico del candidato correcto), correlación máxima por candidato, rango de la clave correcta frente al número de trazas y número de trazas necesario por byte.
- **Ámbito ético:** hardware y firmware propios y una clave de laboratorio que no protege nada real. El ataque no rompe AES; explota una implementación concreta que filtra información física.
- **El éxito no está garantizado.** Depende del ruido, la sincronización, la frecuencia de muestreo, la implementación y el número de trazas.

## Decisiones

| Fecha | Decisión | Estado |
|---|---|---|
| 2026-10-18 | Memoria en LaTeX con la plantilla TFG de la ETSI, sin portada, resumen ni contraportada | Hecho |
| 2026-10-19 | Se añade a la memoria una portada propia (`memoria/portada.tex`) con el estilo de la portada azul de la plantilla, adaptada a un trabajo de asignatura (sin tutor ni departamento). El enunciado pide quitar la portada; se mantiene por decisión del equipo | Hecho |
| 2026-10-18 | Compilación en local (latexmk + XeLaTeX + biber) y CI en GitHub Actions que publica el PDF; desde `main`, en la release `memoria-latest` (el PDF no se versiona) | Hecho |
| 2026-10-18 | Citas en formato IEEE con biblatex (`style=ieee`) | Hecho |
| 2026-10-18 | Montaje DIY con ATmega328P | Sustituido (2026-11-10) |
| 2026-10-18 | Python ≥ 3.11 con `uv` y un único `pyproject.toml` en la raíz; dependencias `numpy` y `matplotlib` | Hecho |
| 2026-10-18 | El CPA se valida primero en simulación (fase 1) antes de tocar el hardware | Hecho |
| 2026-10-18 | AES-128 propio en `analisis/aes.py`, verificado contra los vectores del FIPS-197; sin dependencias criptográficas externas | Hecho |
| 2026-10-18 | Trazas sintéticas con fuga por peso de Hamming, núcleo `(0,5, 1,0, 0,5)`, ventanas de 2 muestras por byte del estado, 96 muestras por traza | Hecho |
| 2026-10-18 | Semilla fija `20261018`; la simulación guarda sus parámetros en `analisis/salida/resultados.json` (ignorado por git) | Hecho |
| 2026-10-18 | La SNR de la simulación se define sobre el ruido total de una muestra (offset por traza, deriva y ruido blanco), de modo que el pico del candidato correcto es `√(SNR/(1+SNR))`; la fuga de la última ronda usa la subclave 10 y su CPA recupera `K10`, que se invierte para obtener la clave | Hecho |
| 2026-10-18 | El DPA de un bit se mantiene solo como comparación: con 2000 trazas y SNR = 0,1 recupera entre 7 y 15 de 16 bytes según el bit (el mejor, elegido conociendo la clave) donde el CPA recupera 16 | Hecho |
| 2026-10-18 | Web explicativa con componentes interactivos en `web/`, publicada con GitHub Pages | Hecho |
| 2026-10-18 | La web no tiene dependencias ni build (HTML, CSS y módulos ES con rutas relativas) y reutiliza solo el código propio de interactive-notes (`artifact-kit/src`, `notes.css` y el harness), nada de `vendor/` ni `from-source/` | Hecho |
| 2026-10-18 | La simulación de la web replica la de Python con estadística, no valor a valor: `web/tests/sim.test.js` exige el pico teórico y las trazas de la tabla 4.1 (mediana 413 y 90 % en 578 con SNR = 0,1, factor 1,5 de margen). El CPA de la web usa estadísticos suficientes y la transformada de Walsh-Hadamard, y es exacto | Hecho |
| 2026-11-07 | Osciloscopio Tektronix TDS 220 prestado por un profesor, solo para usar en el laboratorio del departamento por la mañana. Para capturar desde Python hace falta el módulo TDS2CM o TDS2MM (ver [`hardware/README.md`](hardware/README.md)) | Descartado (2026-11-10) |
| 2026-11-07 | ATmega328P suelto en protoboard con cristal de 16 MHz, programado con una Kuman UNO R3 propia (chip DIP, Optiboot comprobado) que, sin el chip, hace de puente USB-serie. Se descarta el Nano porque su regulador y su conversor USB-serie comparten alimentación con el MCU | Descartado (2026-11-10) |
| 2026-11-07 | Shunt en VCC (como el CW304 NOTDuino de NewAE), medido en el lado del chip con acoplamiento AC; valor entre 10 y 50 Ω, a elegir midiendo | Descartado (2026-11-10) |
| 2026-11-07 | Plan B si el TDS 220 no tiene módulo: CPA con un ChipWhisperer-Nano del laboratorio y TDS 220 para SPA y caracterización de la fuga, más un CPA manual de un byte con promediado | Sustituido por el plan principal (2026-11-10) |
| 2026-11-10 | Se captura con un **ChipWhisperer-Nano** (capturador y víctima STM32F030 en la misma placa) y se dejan el TDS 220 y el montaje DIY con el ATmega328P. El material comprado para ellos se puede devolver (ver [`hardware/README.md`](hardware/README.md)) | Hecho (placa conectada el 2026-11-13) |
| 2026-11-10 | Víctima: `simpleserial-aes` de NewAE con `CRYPTO_TARGET=TINYAES128C`, compilado con `firmware/build.sh` desde el commit `c5e8151` de newaetech/chipwhisperer. No hay firmware propio salvo para la contramedida opcional | Hecho (compilado, sin probar en placa) |
| 2026-11-10 | `chipwhisperer` desde la rama `develop` fijada al mismo commit, en el grupo `captura` de `pyproject.toml`: la 6.0.0 de PyPI exige `numpy<=1.26.4` | Hecho |
| 2026-11-10 | `captura/cw.py` compara cada texto cifrado del target con `analisis/aes.py` y guarda las campañas en `datos/brutos/`; `analisis/real.py` hace el CPA de una campaña con estadísticos acumulados (rango frente a N en una pasada) | Hecho (probado con `--simular`) |
| 2026-11-13 | Placa confirmada por USB como **ChipWhisperer-Nano de NewAE** (`2b3e:ace0`, serie `5333…3039`, firmware del scope 0.65.0, el último de la biblioteca). El bootloader del chip víctima responde con el ID `0x445` (`STM32F04xxx` según NewAE), no `0x444` (STM32F030): falta leer la serigrafía. Detalles en [`hardware/README.md`](hardware/README.md) | Hecho; chip víctima por confirmar |
| 2026-11-13 | `captura/cw.py` lee `TraceContainer.trace` y `.ciphertext`: en la biblioteca 7.0 `capture_trace` ya no devuelve `.wave` ni `.textout` | Hecho |
| 2026-11-13 | Campaña de respaldo en `datos/20261113-nano-tinyaes-respaldo` (1000 trazas, muestras 0 a 1500, 1,4 MB), recortada de la de 3000 trazas | Hecho |
| 2026-11-13 | Las campañas versionadas de `datos/` son recortes de las de `datos/brutos/` hechos con `python -m captura.campana`: víctima sin proteger (1000×1500), SPA del cifrado completo (100×11 000), 500 trazas de texto fijo para ruido y alineación y las tres variantes de la contramedida (base 1000×1500, barajado 2000×1500, retardos 2000×2000). Total, ~9 MB | Hecho |
| 2026-11-13 | `analisis/reales.py` genera las figuras `real-*`, los números de `analisis/salida/reales.json` y los datos de la web a partir de `datos/`. Las curvas de éxito se estiman con 100 permutaciones de la misma campaña (10 con `--rapido`), no con campañas independientes | Hecho |
| 2026-11-13 | Contramedida de la fase 6 en `firmware/contramedida/aes-cm.c`: AES propio con la estructura de tiny-AES que sustituye a la biblioteca de NewAE y se compila con el mismo `simpleserial-aes.c`. Variantes `base` (referencia), `retardos` (`CM_DELAY`, 0 a 15 vueltas antes de cada byte de SubBytes, de cada columna de MixColumns y de cada ronda) y `barajado` (`CM_SHUFFLE`, SubBytes en orden aleatorio). Generador xorshift32 con semilla fija: sirve para medir, **no es una contramedida utilizable tal cual** | Hecho |
| 2026-11-13 | Resultado de la fase 6: el barajado de SubBytes solo multiplica por 3,6 las trazas necesarias (n90: 475 frente a 132), muy por debajo de las m² = 256 del modelo, porque ShiftRows y MixColumns siguen cargando los mismos bytes en las mismas muestras. Los retardos tumban el CPA sin preprocesado incluso con 20 000 trazas; integrando ventanas de 300 muestras antes de correlar se recuperan 7 de 16 bytes | Hecho |
| 2026-11-13 | Los números de las medidas del capítulo 4 no se escriben a mano: `analisis/reales.py` deja `memoria/capitulos/generado/reales.tex` con una macro de LaTeX por número (`\realRhoCorrectMin`, `\realTracesNinety`…) y la memoria la incluye con `\input`. El fichero se versiona porque la CI compila sin ejecutar el análisis, y `--solo-tex` lo rehace desde el JSON en segundos | Hecho |
| — | Herramienta para la presentación (ver [`presentacion/por-decidir.md`](presentacion/por-decidir.md)) | Pendiente |

## Estructura del repositorio

```
AGENTS.md              este archivo (CLAUDE.md lo importa)
README.md              portada del repo en GitHub
pyproject.toml         proyecto único de Python (uv), para captura/ y analisis/
uv.lock                versiones fijadas de las dependencias
docs/
  enunciado.md         enunciado del trabajo y rúbrica de la presentación
  contexto-inicial.md  instantánea del contexto de partida (no se actualiza)
  reunion-*.md         preguntas y respuestas de las reuniones con el profesor
  handoff-*.md         estado y cifras al cerrar una sesión de trabajo
  referencias/         PDF de terceros (artículo, rúbrica); ignorado por git
memoria/
  main.tex             documento raíz; solo estructura e \input de capítulos
  portada.tex          portada con el estilo de la plantilla, adaptada al trabajo
  capitulos/           un .tex por capítulo del esquema TFG + anexos
    generado/          números de las medidas (reales.tex); los genera analisis/reales.py
  referencias.bib      bibliografía compartida con la presentación
  latexmkrc            XeLaTeX + biber, salida en memoria/build/
  template/            plantilla UMA (estilo, fuentes Malacitana y logos); no tocar
presentacion/          por decidir
hardware/              ChipWhisperer-Nano: puesta en marcha y puntos a revisar
firmware/              build.sh compila la víctima de NewAE; los .hex van a firmware/build/ (ignorado)
  contramedida/        AES propio con CM_DELAY o CM_SHUFFLE para la fase 6, con su build.sh
captura/               captura con el ChipWhisperer (cw.py) y formato de campaña (campana.py)
analisis/              CPA, DPA, simulación de trazas, CPA de campañas reales (real.py),
                       figuras de las medidas (reales.py) y figuras
  salida/              resultados numéricos de una ejecución (ignorado por git)
figuras/               figuras generadas por scripts, compartidas por memoria y presentación
web/                   web explicativa (GitHub Pages): index.html, js/, tests/, spec/ y harness
  data/                campaña medida y PNG de la traza real; los genera analisis/reales.py
.github/workflows/     CI de la memoria (memoria.yml), del análisis (analisis.yml) y de la web (web.yml)
```

Directorios con datos:

- `datos/`: campañas recortadas y versionadas que usan la memoria y `analisis/reales.py` (un `.npz` y un `.json` por campaña, ~9 MB). Las trazas en bruto van en `datos/brutos/`, que está ignorado; los recortes se rehacen con `uv run python -m captura.campana ORIGEN DESTINO -n N --muestras 0:1500`.

## Flujo de trabajo

### Compilar la memoria

```sh
# Arch Linux: paquetes que faltan sobre la instalación base de TeX Live
sudo pacman -S --needed biber texlive-bibtexextra texlive-binextra texlive-langspanish texlive-mathscience

cd memoria && latexmk          # genera memoria/build/main.pdf
latexmk -c                     # limpia auxiliares
```

En Arch, el paquete `biber` instala el ejecutable en `/usr/bin/vendor_perl/`, que
no siempre está en el `PATH`. Si `latexmk` se queja de que no encuentra biber, se
lanza con esa ruta delante:

```sh
cd memoria && PATH="/usr/bin/vendor_perl:$PATH" latexmk
```

La plantilla usa `fontspec`, así que **no compila con pdfLaTeX**. En cada push que toque `memoria/` o `figuras/`, el workflow `Memoria` compila con TeX Live completo y deja el PDF como artefacto `memoria` en la pestaña *Actions*. En los push a `main`, además, lo publica en la release `memoria-latest`, con enlace fijo: <https://github.com/r0zh/vul-hw-grupal/releases/download/memoria-latest/memoria.pdf>.

### Ejecutar el análisis

```sh
uv sync                                      # crea .venv con numpy y matplotlib
uv run python -m analisis.tests              # comprobaciones rápidas
uv run python -m analisis.run_all            # fase 1 completa y figuras (~4 min)
uv run python -m analisis.run_all --fast     # versión de humo
uv run python -m analisis.demo               # demo en vivo del CPA (simulada, no escribe nada)
uv run python -m analisis.reales             # figuras real-* y números de las medidas (~25 min)
uv run python -m analisis.reales --rapido    # 10 ordenaciones en vez de 100 (~3 min, para probar)
uv run python -m analisis.reales --solo-tex  # solo las macros de la memoria, desde el JSON (segundos)
```

Detalles en [`analisis/README.md`](analisis/README.md). El workflow `Análisis` ejecuta las comprobaciones y el análisis reducido **dos veces** en cada push que toque `analisis/`, para comprobar que los resultados y las figuras son deterministas. `analisis.reales` no entra en la CI: tarda demasiado y necesita las campañas de `datos/`, que sí están versionadas (la campaña completa con retardos, no: si falta, se omiten esas claves del JSON).

### Probar la web

```sh
cd web
npm run serve      # http://localhost:8000/web/ (sirve la raíz del repo, como Pages bajo una subruta)
npm run check      # tests, prueba de humo, claims y auditoría visual (~45 s; Node ≥ 22 y Chromium)
```

Detalles en [`web/README.md`](web/README.md). El workflow `Web` ejecuta `npm run check` en cada push que toque `web/` y, desde `main`, publica la carpeta en GitHub Pages.

### Git

- `main` debe compilar siempre. Para cambios grandes se usan ramas cortas y PR; los arreglos pequeños pueden ir directos.
- Mensajes de commit en español, en imperativo y concretos ("Añade esqueleto del capítulo de mitigaciones").
- El repo es público: no se suben PDF de terceros, credenciales ni nada que no sea nuestro.

### Python

`uv` con un único `pyproject.toml` en la raíz para `captura/` y `analisis/`, con Python 3.11 o superior. Dependencias: `numpy` y `matplotlib`, y en el grupo `captura` (`uv sync --group captura`), `chipwhisperer`, que solo hace falta en el portátil conectado a la placa.

Los resultados numéricos van a `analisis/salida/`, que está ignorado por git: se regeneran con `uv run python -m analisis.run_all` a partir de la semilla fija. Las trazas sintéticas no se guardan; si alguna vez hace falta conservar una campaña, se usa el formato de trazas de las convenciones (`.npz` + `.json`) y se marca como simulada dentro del propio JSON.

## Convenciones

- **Idioma:** memoria, documentación, comentarios y commits en español. Los identificadores de código, en inglés.
- **Memoria:** un capítulo por archivo en `memoria/capitulos/`, con el orden y los títulos del enunciado. Cada capítulo tiene `\label{cap:...}` y se referencia con `\cref`. Registro formal e impersonal. Antes de entregar, el texto se revisa con Trinka.
- **Citas:** IEEE mediante biblatex. Claves con el formato `apellidoAñoPalabra` (`brier2004cpa`). Las fuentes web llevan `urldate`. Ejemplos de la UMA: <https://biblioguias.uma.es/citasybibliografia/ejemplosIEEE>.
- **Figuras:** las de datos se generan con scripts de `analisis/` y se guardan en `figuras/` como PDF vectorial. No se retocan a mano. En el `.tex`, un comentario junto a cada figura indica el script que la produce. Los esquemas y fotos del montaje también van en `figuras/`.
- **Formato de trazas (propuesta):** un `.npz` por campaña con `traces` (N×S, `float32`), `plaintexts` y `ciphertexts` (N×16, `uint8`) y `key` (16, `uint8`), más un `.json` de metadatos con el instrumento, la frecuencia del ADC, el reloj del target, el SHA-256 del firmware, la fecha, el commit del repo y `"simulada"`. Implementado en `captura/campana.py`.

## Reglas para agentes

1. **No inventar resultados.** El capítulo de Resultados y sus figuras solo pueden salir de datos reales de `datos/` o de simulaciones marcadas como tales. Si faltan datos, se deja un `% TODO` y no se escribe texto plausible.
2. **No inventar referencias.** Cada entrada de `referencias.bib` debe estar comprobada contra su DOI, arXiv o URL oficial. Si una afirmación no tiene fuente, se marca con `% TODO: fuente`.
3. **No dar por hecho que el montaje funciona.** Que un tutorial de NewAE recupere la clave con pocas trazas no implica que nuestra placa y nuestra captura lo consigan. Las afirmaciones sobre el hardware se tratan como hipótesis hasta que haya medidas.
4. **Precios y especificaciones** de componentes siempre con enlace y fecha de consulta. Los de `docs/contexto-inicial.md` están sin verificar.
5. **Las mitigaciones no son garantías absolutas**, y el código de tiempo constante no protege por sí solo frente al análisis de consumo.
6. **Mantener este archivo al día:** cada decisión nueva va a la tabla de decisiones y los avances, al plan de trabajo. `docs/contexto-inicial.md` es histórico y no se edita.
7. **No modificar `memoria/template/`.** Los ajustes de estilo van en `main.tex`.

## Plan de trabajo

- [x] **0. Organización:** repositorio, plantilla, CI y este archivo.
- [x] **1. Análisis validado en simulación:** CPA (y DPA como comparación) sobre trazas sintéticas con fuga HW y ruido gaussiano. Resultado: con 4000 trazas y SNR = 0,1 se recuperan los 128 bits; el barrido de ruido da las trazas necesarias por nivel (578 para el 90 % de los ensayos con SNR = 0,1) y el DPA de un bit se queda entre 7 y 15 de 16 bytes donde el CPA acierta los 16. Figuras y texto en `figuras/` y la sección 4.1 de la memoria.
- [x] **2. Instrumental:** ChipWhisperer-Nano conectado el 2026-11-13; firmware del scope al día (0.65.0). Placa CW1101 revisión 05 (serigrafía) y fotos en `figuras/nano-*.jpg`. Pendiente: serigrafía del chip víctima, ilegible en esas fotos. Devolver el RS-232, el null-modem y los cristales.
- [x] **3. Firmware:** `simpleserial-aes` con TINYAES128C programado en el Nano el 2026-11-13 (SHA-256 del `.hex` en `hardware/README.md`). Los textos cifrados de las 3050 trazas capturadas coinciden con `analisis/aes.py`.
- [x] **4. Captura:** 2026-11-13. A 18,6 trazas/s, trazas alineadas sin procesar (dispersión entre trazas del orden de un escalón del ADC), saturación despreciable y primera ronda entre las muestras ~450 y ~700. Campaña `20261113-180036-nano-tinyaes` de 3000 trazas en `datos/brutos/`.
- [x] **5. Ataque real:** 2026-11-13: con 3000 trazas se recuperan los 16 bytes (|ρ| ≈ 0,6; rango 1 estable entre 24 y 90 trazas según el byte) y hay una campaña de respaldo en `datos/`. Figuras definitivas `real-*` generadas por `analisis/reales.py` y secciones 4.2 y 4.3 de la memoria escritas con esos números.
- [x] **6. (Opcional) Contramedida:** `firmware/contramedida/` con tres variantes (base, barajado de SubBytes y retardos aleatorios de 0 a 15 vueltas), medidas con el mismo CPA. El barajado sigue recuperando los 16 bytes con 3,6 veces más trazas; los retardos lo tumban incluso con 20 000 trazas, y solo integrando ventanas de 300 muestras se recuperan 7 de 16 bytes. Sección 4.4 de la memoria y, del lado de la teoría, la sección 3.
- [x] **Web explicativa:** `web/` con `<cpa-live>` (CPA en directo con SNR, N, byte, semilla y clave y, desde 2026-11-13, `#cpa-real` con 400 trazas medidas), `<cpa-leak>` (de dónde sale la fuga) y `<cpa-sbox>` (AddRoundKey y SubBytes con un byte, y por qué atacar `p ⊕ k` empata con el complementario), tests de los modelos, claims en navegador y auditoría visual (`cd web && npm run check`), más `tests/real.test.js`, que exige que el CPA de la web recupere los 16 bytes con las trazas medidas. Se publica en <https://r0zh.github.io/vul-hw-grupal/> desde `main`. Pendiente: Manim, `<cpa-dpa>` y `<cpa-shuffle>` (opcionales).
- [ ] **7. Entregables:** redacción de la memoria, revisión con Trinka, presentación y ensayo de la demo con el plan B. Capítulos 1 a 5 escritos con los resultados reales (2026-11-13); quedan los `% TODO` de la serigrafía y la foto del chip, alguna fuente de la sección 3 y la revisión de estilo. En el portátil del Nano no hay LaTeX: la memoria se compila en la CI o en un contenedor (`docker run --rm -v "$PWD":/repo -w /repo/memoria danteev/texlive latexmk`).

## Fuentes

- Bibliografía citada: [`memoria/referencias.bib`](memoria/referencias.bib).
- Lista de lectura inicial con enlaces: [`docs/contexto-inicial.md`](docs/contexto-inicial.md), §10.
- Referencias clave: Kocher et al. 1999 (DPA), Brier et al. 2004 (CPA), Kocher et al. 2011 (introducción a DPA), Mangard et al. 2007 (libro de referencia) y los laboratorios SCA101 de ChipWhisperer (DPA y CPA sobre AES en firmware).
