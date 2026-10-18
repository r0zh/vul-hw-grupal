# Ataque CPA sobre AES-128 con un montaje DIY

Trabajo grupal de **Vulnerabilidades Hardware** (ETSI Informática, Universidad de Málaga). Demostramos un ataque de análisis de consumo por correlación (CPA) contra una implementación software de AES-128 en un ATmega328P. El hardware, el firmware y la clave de laboratorio son nuestros.

**Equipo:** Juan Diego Bermúdez Ureba, Brian Polo Caballero, Alberto Bartolomé Iruela y Roberto Sánchez Martín.

## Contenido

| Ruta | Qué hay |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Contexto, decisiones, convenciones y plan de trabajo |
| [`memoria/`](memoria/) | Memoria en LaTeX (plantilla TFG de la ETSI) |
| [`presentacion/`](presentacion/) | Presentación (herramienta por decidir) |
| [`hardware/`](hardware/) | Montaje de medida y material |
| [`docs/`](docs/) | Enunciado, rúbrica y contexto inicial |

## Compilar la memoria

Requiere XeLaTeX, biber y latexmk:

```sh
cd memoria && latexmk    # → memoria/build/main.pdf
```

Cada push que toque la memoria la compila en GitHub Actions y deja el PDF como artefacto.

## Referencia principal

J. Mishra y S. K. Sahay, "Modern Hardware Security: A Review of Attacks and Countermeasures", arXiv:2501.04394, 2025. <https://arxiv.org/abs/2501.04394>
