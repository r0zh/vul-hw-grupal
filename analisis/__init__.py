"""Análisis del ataque CPA sobre AES-128 (fase 1: validación en simulación).

Módulos:

- `aes`: AES-128 de referencia y valores intermedios que ataca el CPA.
- `simulate`: generación de trazas sintéticas con fuga por peso de Hamming.
- `attacks`: CPA, DPA y utilidades de detección.
- `statistics`: correlación de Pearson, rangos y márgenes.
- `experiments`: campañas, barridos y resultados numéricos.
- `figures`: figuras en PDF vectorial para `figuras/`.
- `config`: parámetros de la simulación.
- `run_all`: regenera todas las figuras y los resultados de una vez.
- `tests`: comprobaciones rápidas (AES, ataque sin ruido, utilidades).

Todo lo que produce este paquete es **simulación** y así se etiqueta en las
figuras y en la memoria.
"""

__all__ = [
    "aes",
    "attacks",
    "config",
    "experiments",
    "figures",
    "simulate",
    "statistics",
    "tests",
]
