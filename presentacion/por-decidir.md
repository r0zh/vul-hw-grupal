# Presentación: por decidir

Todavía no hemos elegido herramienta. Cuando se decida, se apunta en `AGENTS.md` (registro de decisiones) y se sustituye este archivo por el fuente de la presentación.

## Opciones

| Opción | A favor | En contra |
|---|---|---|
| Beamer (LaTeX) en este repo | Versionado; reutiliza `figuras/` y `memoria/referencias.bib`; compila en CI como la memoria | Editar en grupo es más lento; animaciones limitadas |
| Google Slides / PowerPoint | Edición simultánea y visual; animaciones fáciles | Fuera del repo: solo se guarda el PDF exportado y las figuras se copian a mano |

En cualquier caso, la entrega es un PDF.

## Requisitos (enunciado y rúbrica)

- Esquema parecido al de la memoria, con poco texto.
- Animaciones y transiciones comedidas, solo para acompañar la explicación.
- Rúbrica: estructura 2, contenido 2, transparencias 1, lenguaje verbal y corporal 2,5, interés y participación 2,5 (ver `docs/enunciado.md`).

## Estructura propuesta

1. Pregunta inicial: ¿puede filtrarse una clave AES sin leer la memoria ni romper el algoritmo?
2. Índice y objetivo.
3. Qué es un canal lateral.
4. Cómo cambia el consumo durante el cifrado.
5. SPA, DPA y CPA.
6. Montaje físico y captura de trazas.
7. Gráfico de correlación y resultado experimental.
8. Contramedidas y limitaciones.
9. Conclusiones y preguntas.

Material visual mínimo: esquema del montaje, una traza real, correlación frente al tiempo con el pico de la clave correcta y comparación entre la clave recuperada y la de laboratorio. Llevar trazas y resultados de respaldo por si falla la demo en directo.
