# Dependencias incluidas

La presentación tiene que funcionar sin red en el aula, así que sus dependencias van copiadas aquí, sin
build. Se sacaron de los paquetes de npm con `npm pack` el 2026-11-22.

| Carpeta | Paquete | Versión | Licencia | Qué se copió |
|---|---|---|---|---|
| `three/` | `three` | 0.187.0 | MIT | `build/three.module.js`, `build/three.core.js` y los addons de `examples/jsm` que se usan (`addons/`) |
| `fonts/` | `@fontsource-variable/inter` y `@fontsource-variable/jetbrains-mono` | 5.3.0 | OFL-1.1 | Subconjunto latino: Inter con ejes `opsz` y `wght`, JetBrains Mono con `wght` |
| `cuelume/` | `cuelume` | 0.2.8 | MIT | `dist/**/*.js` (sonidos sintetizados con Web Audio, sin ficheros de audio) |

Las páginas resuelven `three` y `three/addons/` con un import map que apunta a `three/three.module.js` y
`three/addons/`. Para añadir otro addon, se copia de `examples/jsm` del mismo paquete con su ruta y sus
dependencias relativas.
