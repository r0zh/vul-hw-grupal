# Contexto inicial (instantánea del 2026-10-18)

> Resumen de una conversación previa con ChatGPT, guardado tal cual como punto de partida. **No se actualiza.** Lo que esté vigente (decisiones, plan, estado) está en `AGENTS.md`. Los precios y datos técnicos de aquí no se han verificado.

## 1. Objetivo

Preparar una presentación universitaria sobre seguridad hardware que demuestre un ataque de canal lateral basado en el consumo eléctrico de un microcontrolador que ejecuta AES.

La idea es construir parte del sistema nosotros mismos, no comprar una solución completamente montada, y poder explicar y mostrar cómo se mide el consumo, cómo se obtienen las trazas y cómo el análisis estadístico permite inferir una clave de prueba.

El experimento se realiza sobre hardware y firmware propios, con una clave de laboratorio.

## 2. Artículo de referencia

**J. Mishra y S. K. Sahay, "Modern Hardware Security: A Review of Attacks and Countermeasures", arXiv:2501.04394v1, 8 de enero de 2025.** <https://arxiv.org/abs/2501.04394>

Revisión general de seguridad hardware: ataques de caché, Spectre, Meltdown, análisis de consumo, análisis electromagnético, voltage glitching, cifrado de memoria, enclaves seguros, extensiones criptográficas, Secure Boot, PUF y retos de seguridad en RISC-V.

Secciones más relevantes:

- II.B: Power Side-Channels.
- II.B.1: Simple Power Analysis (SPA).
- II.B.2: Differential Power Analysis (DPA).
- II.B.3: Correlation Power Analysis (CPA).
- III.C: ejemplos de ataques DPA contra implementaciones criptográficas.
- III.D: contramedidas frente a DPA.

## 3. En qué consiste el ataque

Un canal lateral es información que se filtra durante la ejecución de una operación, aparte de sus entradas y salidas normales. En los circuitos digitales el consumo depende en parte de la actividad interna y de los datos procesados, así que sus variaciones pueden revelar información sobre operaciones criptográficas.

El ataque no rompe matemáticamente AES: aprovecha una implementación concreta que filtra información física mientras cifra con una clave secreta.

- **SPA:** identificar operaciones o patrones directamente en las trazas.
- **DPA:** muchas trazas, separadas según una hipótesis sobre un valor intermedio; se comparan estadísticamente los grupos.
- **CPA:** muchas trazas; se calcula la correlación entre el consumo medido y un modelo hipotético de fuga para cada valor de clave posible.

La demo debería centrarse en CPA y explicar DPA como antecedente.

## 4. CPA sobre AES-128

1. El microcontrolador ejecuta AES con una clave fija de prueba.
2. Se envían textos claros conocidos y se captura el consumo durante cada cifrado.
3. Para cada byte de clave se prueban sus 256 valores.
4. Para cada candidato se calcula un valor intermedio hipotético; lo habitual es la salida de la primera S-box: `SBox(plaintext_byte XOR key_guess)`.
5. Modelo de fuga: peso de Hamming (bits a uno del valor intermedio).
6. Correlación de Pearson entre la fuga predicha y cada punto de las trazas.
7. Si la implementación filtra lo suficiente, el byte correcto produce el pico de correlación más destacado cerca del instante de la operación.
8. Se repite para los 16 bytes y se compara la clave recuperada con la de prueba.

`corr(HW(SBox(P_i XOR k_guess)), trace_i[t])`, donde `P_i` es el texto claro de la ejecución `i`, `k_guess` un candidato del byte de clave, `HW` el peso de Hamming y `trace_i[t]` la muestra en el instante `t`.

El éxito no está garantizado: depende de la calidad de la señal, el ruido, la sincronización, la implementación AES, el modelo de fuga y el número de trazas. Que una demo publicada funcione con unas decenas de trazas no implica que un montaje DIY lo consiga igual de rápido.

## 5. Montaje DIY valorado

Arduino Nano compatible (ATmega328P), resistencia shunt y osciloscopio USB.

**PC → microcontrolador con AES software → shunt → osciloscopio/capturador → Python para CPA.**

Un GPIO genera el trigger que marca el inicio del cifrado para alinear las trazas.

Componentes:

- Microcontrolador con una implementación AES controlada por nosotros.
- Shunt de bajo valor para convertir variaciones de corriente en variaciones de tensión.
- Instrumento de medida o ADC externo con capacidad suficiente.
- Trigger o mecanismo fiable de sincronización.
- Amplificación analógica de bajo ruido si la señal es demasiado pequeña.
- PC con Python para guardar trazas y calcular correlaciones.

El ADC del Arduino Nano no sirve como capturador rápido; hace falta un osciloscopio o capturador externo.

**Riesgo principal:** no basta con conectar un shunt a cualquier osciloscopio. Puede ser difícil conseguir una señal limpia, repetible y alineada. Hay que verificar la instrumentación antes de comprar y comprobar si la universidad dispone de un osciloscopio adecuado.

## 6. Presupuesto preliminar (sin verificar)

| Componente | Estimación |
|---|---:|
| Arduino Nano compatible | 5–9 € |
| Resistencia shunt | 1–3 € |
| Protoboard, cables y conectores | 10–20 € |
| Cables o adaptadores adicionales | 5–15 € |
| Amplificador analógico, si se necesita | ~7 € |
| Osciloscopio USB Hantek 6022BE | 96,26 € con IVA (listado consultado) |

Con instrumental comprado desde cero: ~120–150 €. Con osciloscopio de la universidad: ~20–45 €.

ChipWhisperer-Nano: 60 USD en la tienda de NewAE (sin impuestos ni envío). Integra un STM32F030, ADC de 8 bits a hasta 20 MS/s, muestreo sincronizable y entorno Python. El DIY compensa por aprendizaje y control del experimento, no necesariamente por precio.

La cifra de ~193 € para el PicoScope 2204A no está confirmada: los listados de RS consultados mostraban ~336,56–386,78 € con IVA.

## 7. Estrategia recomendada

1. Validar el análisis CPA con trazas de ejemplo o simulación.
2. Construir la parte física propia: microcontrolador, AES software, shunt, trigger y captura.
3. Priorizar instrumental prestado de la universidad antes de comprar un osciloscopio barato.
4. Guardar trazas y resultados de respaldo por si la captura en directo falla.
5. Mostrar una traza real, un pico de correlación y la comparación entre la clave recuperada y la de laboratorio.

## 8. Contramedidas (según el artículo)

- **Masking:** valores aleatorios en los cálculos para desligar secreto y consumo.
- **Aleatorización:** alterar representación o ejecución para dificultar el análisis estadístico.
- **Lógica balanceada:** reducir diferencias de consumo entre operaciones o valores.
- **Inyección de ruido:** dificultar identificar la señal dependiente de los datos.
- **Re-keying:** renovar claves para limitar las operaciones expuestas con una misma clave.

Ninguna es una garantía absoluta. Una implementación de tiempo constante no queda automáticamente protegida frente a ataques de consumo.

## 9. Presentación oral

Rúbrica en `docs/enunciado.md`. Estructura posible:

1. Pregunta inicial: ¿puede filtrarse una clave AES sin leer la memoria ni romper el algoritmo?
2. Índice y objetivo.
3. Qué es un canal lateral.
4. Cómo cambia el consumo durante el cifrado.
5. SPA, DPA y CPA.
6. Montaje físico y captura de trazas.
7. Gráfico de correlación y resultado experimental.
8. Contramedidas y limitaciones.
9. Conclusiones y preguntas.

Diapositivas con poco texto, un esquema del montaje, una traza medida y una visualización del resultado CPA.

## 10. Fuentes para aprender

1. Artículo base: <https://arxiv.org/abs/2501.04394>
2. Introducción a ChipWhisperer: <https://chipwhisperer.readthedocs.io/en/latest/getting-started.html>
3. Tutorial CPA sobre AES: <https://github.com/newaetech/chipwhisperer-tutorials/blob/master/courses_sca101_SOLN_Lab%204_2%20-%20CPA%20on%20Firmware%20Implementation%20of%20AES-CWNANO-CWNANO.rst>
4. Tutorial DPA sobre AES: <https://github.com/newaetech/chipwhisperer-tutorials/blob/master/courses_sca101_SOLN_Lab%203_3%20-%20DPA%20on%20Firmware%20Implementation%20of%20AES-CWNANO-CWNANO.rst>
5. Módulo CPA/Analyzer: <https://chipwhisperer.readthedocs.io/en/latest/analyzer-api.html>
6. Kocher, Jaffe, Jun y Rohatgi, "Introduction to Differential Power Analysis" (2011): <https://doi.org/10.1007/s13389-011-0006-y>
7. Ficha del ChipWhisperer-Nano: <https://www.newae.com/product-page/chipwhisperer-nano>
