# AGENTS.md

Contexto y normas del repositorio para el equipo y para cualquier agente (Claude Code, Codex, etc.). **Es la fuente de verdad del proyecto:** si una decisión cambia, se actualiza aquí.

## Proyecto

Trabajo grupal de **Vulnerabilidades Hardware** (ETSI Informática, Universidad de Málaga): demostrar y documentar un **ataque de análisis de consumo por correlación (CPA) sobre AES-128** ejecutado en un microcontrolador propio, con un montaje de medida construido por nosotros.

- **Equipo:** Juan Diego Bermúdez Ureba, Brian Polo Caballero, Alberto Bartolomé Iruela y Roberto Sánchez Martín.
- **GitHub:** <https://github.com/r0zh/vul-hw-grupal> (**público**). Colaboradores: `r0zh`, `Alman368`, `juandiego-bmu` y `plc50` (Brian; pendiente de invitar).
- **Entregables:** dos PDF, memoria y presentación. Se puede actualizar la entrega hasta el día de la presentación y solo la sube un miembro. Enunciado y rúbrica completos en [`docs/enunciado.md`](docs/enunciado.md).
- **Fecha de presentación:** aún no se conoce.
- **Artículo base:** J. Mishra y S. K. Sahay, *Modern Hardware Security: A Review of Attacks and Countermeasures*, arXiv:2501.04394, 2025. Secciones relevantes: II.B (SPA, DPA y CPA), III.C (ataques DPA a implementaciones criptográficas) y III.D (contramedidas).

## Qué se demuestra

- **Objetivo:** recuperar la clave de laboratorio de un AES-128 software sin protecciones que se ejecuta en un ATmega328P, a partir de trazas de consumo medidas con un shunt.
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
| 2026-10-18 | Compilación en local (latexmk + XeLaTeX + biber) y CI en GitHub Actions que publica el PDF; desde `main`, en la release `memoria-latest` (el PDF no se versiona) | Hecho |
| 2026-10-18 | Citas en formato IEEE con biblatex (`style=ieee`) | Hecho |
| 2026-10-18 | Montaje DIY con ATmega328P (Arduino Nano) | Decidido |
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
| — | Osciloscopio: de la universidad o comprado (Hantek 6022BE) | **Pendiente de confirmación de un profesor** |
| — | Placa Nano o ATmega328P suelto en protoboard (ver [`hardware/README.md`](hardware/README.md)) | Por evaluar |
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
  referencias/         PDF de terceros (artículo, rúbrica); ignorado por git
memoria/
  main.tex             documento raíz; solo estructura e \input de capítulos
  capitulos/           un .tex por capítulo del esquema TFG + anexos
  referencias.bib      bibliografía compartida con la presentación
  latexmkrc            XeLaTeX + biber, salida en memoria/build/
  template/            plantilla UMA (estilo y fuentes Malacitana); no tocar
presentacion/          por decidir
hardware/              montaje, material y puntos a revisar
analisis/              CPA, DPA, simulación de trazas y generación de figuras
  salida/              resultados numéricos de una ejecución (ignorado por git)
figuras/               figuras generadas por scripts, compartidas por memoria y presentación
web/                   web explicativa (GitHub Pages): index.html, js/, tests/, spec/ y harness
.github/workflows/     CI de la memoria (memoria.yml), del análisis (analisis.yml) y de la web (web.yml)
```

Directorios previstos que se crean cuando haya contenido:

- `firmware/`: AES-128 para ATmega328P, protocolo serie y GPIO de trigger.
- `captura/`: scripts de Python que controlan la placa y el osciloscopio y guardan trazas.
- `datos/`: trazas de respaldo comprimidas. Las trazas en bruto van en `datos/brutos/`, que está ignorado.

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
```

Detalles en [`analisis/README.md`](analisis/README.md). El workflow `Análisis` ejecuta las comprobaciones y el análisis reducido **dos veces** en cada push que toque `analisis/`, para comprobar que los resultados y las figuras son deterministas.

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

`uv` con un único `pyproject.toml` en la raíz para `captura/` y `analisis/`, con Python 3.11 o superior. Dependencias actuales: `numpy` y `matplotlib`; cuando llegue la captura se añadirán `pyserial` y el driver del osciloscopio que se elija.

Los resultados numéricos van a `analisis/salida/`, que está ignorado por git: se regeneran con `uv run python -m analisis.run_all` a partir de la semilla fija. Las trazas sintéticas no se guardan; si alguna vez hace falta conservar una campaña, se usa el formato de trazas de las convenciones (`.npz` + `.json`) y se marca como simulada dentro del propio JSON.

## Convenciones

- **Idioma:** memoria, documentación, comentarios y commits en español. Los identificadores de código, en inglés.
- **Memoria:** un capítulo por archivo en `memoria/capitulos/`, con el orden y los títulos del enunciado. Cada capítulo tiene `\label{cap:...}` y se referencia con `\cref`. Registro formal e impersonal. Antes de entregar, el texto se revisa con Trinka.
- **Citas:** IEEE mediante biblatex. Claves con el formato `apellidoAñoPalabra` (`brier2004cpa`). Las fuentes web llevan `urldate`. Ejemplos de la UMA: <https://biblioguias.uma.es/citasybibliografia/ejemplosIEEE>.
- **Figuras:** las de datos se generan con scripts de `analisis/` y se guardan en `figuras/` como PDF vectorial. No se retocan a mano. En el `.tex`, un comentario junto a cada figura indica el script que la produce. Los esquemas y fotos del montaje también van en `figuras/`.
- **Formato de trazas (propuesta):** un `.npz` por campaña con `traces` (N×S, `float32`), `plaintexts` y `ciphertexts` (N×16, `uint8`) y `key` (16, `uint8`), más un `.json` de metadatos con la frecuencia de muestreo, el reloj del MCU, el shunt, el osciloscopio, la fecha y el commit del firmware.

## Reglas para agentes

1. **No inventar resultados.** El capítulo de Resultados y sus figuras solo pueden salir de datos reales de `datos/` o de simulaciones marcadas como tales. Si faltan datos, se deja un `% TODO` y no se escribe texto plausible.
2. **No inventar referencias.** Cada entrada de `referencias.bib` debe estar comprobada contra su DOI, arXiv o URL oficial. Si una afirmación no tiene fuente, se marca con `% TODO: fuente`.
3. **No dar por hecho que el montaje funciona.** Que un tutorial recupere la clave con pocas trazas no implica que nuestro montaje lo consiga. Las afirmaciones sobre el hardware se tratan como hipótesis hasta que haya medidas.
4. **Precios y especificaciones** de componentes siempre con enlace y fecha de consulta. Los de `docs/contexto-inicial.md` están sin verificar.
5. **Las mitigaciones no son garantías absolutas**, y el código de tiempo constante no protege por sí solo frente al análisis de consumo.
6. **Mantener este archivo al día:** cada decisión nueva va a la tabla de decisiones y los avances, al plan de trabajo. `docs/contexto-inicial.md` es histórico y no se edita.
7. **No modificar `memoria/template/`.** Los ajustes de estilo van en `main.tex`.

## Plan de trabajo

- [x] **0. Organización:** repositorio, plantilla, CI y este archivo.
- [x] **1. Análisis validado en simulación:** CPA (y DPA como comparación) sobre trazas sintéticas con fuga HW y ruido gaussiano. Resultado: con 4000 trazas y SNR = 0,1 se recuperan los 128 bits; el barrido de ruido da las trazas necesarias por nivel (578 para el 90 % de los ensayos con SNR = 0,1) y el DPA de un bit se queda entre 7 y 15 de 16 bytes donde el CPA acierta los 16. Figuras y texto en `figuras/` y la sección 4.1 de la memoria.
- [ ] **2. Instrumental:** respuesta del profesor sobre el osciloscopio y lista de compra definitiva con precios verificados.
- [ ] **3. Firmware:** AES-128 en el ATmega328P verificado con los vectores de prueba de FIPS-197, protocolo serie y trigger por GPIO.
- [ ] **4. Captura:** primera traza real, rondas visibles (SPA), alineación con el trigger y captura automatizada de miles de trazas.
- [ ] **5. Ataque real:** CPA sobre las trazas medidas, métricas y figuras definitivas. Guardar una campaña de respaldo en `datos/`.
- [ ] **6. (Opcional) Contramedida:** p. ej., *shuffling* o retardos aleatorios en el firmware, y medir cómo se degrada el ataque. Alimenta Mitigaciones y Resultados.
- [x] **Web explicativa:** `web/` con `<cpa-live>` (CPA en directo con SNR, N, byte, semilla y clave) y `<cpa-leak>` (de dónde sale la fuga), tests de los modelos, claims en navegador y auditoría visual (`cd web && npm run check`). Se publica en <https://r0zh.github.io/vul-hw-grupal/> desde `main`. Pendiente: Manim, `<cpa-dpa>` y `<cpa-shuffle>` (opcionales) y cargar trazas reales en la fase 5.
- [ ] **7. Entregables:** redacción de la memoria, revisión con Trinka, presentación y ensayo de la demo con el plan B.

## Fuentes

- Bibliografía citada: [`memoria/referencias.bib`](memoria/referencias.bib).
- Lista de lectura inicial con enlaces: [`docs/contexto-inicial.md`](docs/contexto-inicial.md), §10.
- Referencias clave: Kocher et al. 1999 (DPA), Brier et al. 2004 (CPA), Kocher et al. 2011 (introducción a DPA), Mangard et al. 2007 (libro de referencia) y los laboratorios SCA101 de ChipWhisperer (DPA y CPA sobre AES en firmware).
