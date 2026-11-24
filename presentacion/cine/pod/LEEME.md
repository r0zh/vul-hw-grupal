# Render de los vídeos en una GPU de RunPod

Los vídeos path-traced de la presentación salen de `presentacion/cine/` con Cook, el path tracer nativo de
Crucible (Vulkan con ray queries). El portátil no tiene una GPU que sirva, así que el render va en un pod de
RunPod; en local solo se exporta el modelo y se revisan los resultados.

| Fichero | Qué hace |
|---|---|
| `../exportar-glb.mjs` | Exporta la placa de `js/escenas/placa.js` a `../modelos/cw1101.glb` (Chromium sin ventana, en local) |
| `../estudio.mjs` | Estudio claro común a los planos y carga de los modelos en Node |
| `../planos/<id>.mjs` | Un plano: la escena y `frame(t)` (cámara y, si cambian, piezas y luces) |
| `../render.mjs` | Renderiza un plano en PNG; `--nativo` en la GPU, `--previa` en la CPU |
| `../codificar.sh` | PNG → MP4 H.264 para el navegador, con su póster |
| `arranque.sh` | Deja un pod listo desde cero |

La placa se exporta en local, en un segundo: `CHROME=/ruta/a/chrome node presentacion/cine/exportar-glb.mjs`. El
script comprueba que Crucible lee el GLB en el navegador y en Node, que es donde lo leen los planos.

## Crear el pod

En la consola de RunPod, *Community Cloud*:

- GPU: **RTX 3070** (8 GB) u otra NVIDIA RTX o serie A; Cook necesita `VK_KHR_ray_query`. El piloto usa menos
  de 2 GB de VRAM, así que cualquier tarjeta RTX vale.
- Imagen `runpod/base:1.0.2-ubuntu2204`.
- Variable de entorno `NVIDIA_DRIVER_CAPABILITIES=all`: sin ella el contenedor no recibe la parte gráfica del
  driver y `vulkaninfo` solo ve `llvmpipe`.
- Volumen de 30 GB en `/workspace` y puertos `22/tcp` y `8000/http`.
- Precio pagado: 0,13 $/h (RTX 3070, 18 vCPU, 2026-11-23). Se cobra mientras el pod esté encendido, se use o no.

Dentro del pod (consola web o SSH):

```sh
curl -fsSL https://raw.githubusercontent.com/r0zh/vul-hw-grupal/main/presentacion/cine/pod/arranque.sh | bash
```

Tarda un par de minutos y acaba en `ARRANQUE_OK`. Instala con apt el cargador de Vulkan y ffmpeg; baja Node
22.23.5 y Open Image Denoise 2.5.1 a `/workspace/opt` comprobando su SHA-256; clona el repo (rama `main`) en
`/workspace/repo`; instala `presentacion/cine` con `npm ci`; baja el addon de Cook (`npx cook fetch-addon`, que
también comprueba su SHA-256), y comprueba la GPU con la escena de prueba de Cook. Se puede repetir: lo que ya está
no se vuelve a bajar. Tras parar y volver a encender el pod hay que repetirlo, porque apt y los enlaces de
`/usr/local/bin` no están en el volumen.

## Flujo de trabajo

**Código al pod.** Commit y push de la rama de trabajo, solo con los ficheros propios (`git add` con rutas
explícitas), y en el pod `cd /workspace/repo && git fetch && git checkout <rama> && git pull --ff-only`. Un modelo de menos de 10 MB se versiona en `../modelos/`
junto con el script que lo genera; uno más grande no se versiona y se copia al pod aparte.

**Render.** En el pod, en segundo plano, para que siga aunque se cierre la consola o la sesión de SSH:

```sh
cd /workspace/repo/presentacion/cine
nohup node render.mjs planos/piloto.mjs --nativo --ancho 960 --alto 540 --muestras 64 > /workspace/piloto.log 2>&1 &
tail -3 /workspace/piloto.log
```

- Previa: 960×540 y 64 muestras (un segundo por fotograma). Final: 1920×1080 y 256 muestras, los valores por
  defecto de `--nativo`.
- `--desde N --hasta M` hace un trozo. Un PNG que ya existe no se repite, así que un render cortado se reanuda
  lanzándolo otra vez.
- Cada ajuste va a su carpeta, `salida/<id>/<ancho>x<alto>-<muestras>-<denoise>/`. Cambiar el plano **no** invalida
  los PNG que ya hay: hay que borrar esa carpeta. Y no hay que mover ni borrar una carpeta mientras un render
  escribe en ella (el proceso la vuelve a crear y mezcla fotogramas de los dos).
- `--denoise oidn` (por defecto) usa OIDN en la GPU (CUDA); `atrous` es el filtro de Cook, más rápido y más
  borroso; `none`, la imagen tal cual.
- El primer fotograma compila los shaders (12 a 13 s). Si el plano solo mueve la cámara, los demás mandan solo la
  cámara a la sesión; si mueve piezas o cambia materiales, se reempaqueta la escena y `session.update` la cambia sin
  recompilar.
- `--previa` usa el trazador de CPU de Crucible, que no hace profundidad de campo ni light linking: solo sirve
  para comprobar un encuadre sin GPU.

**Codificar.** `sh codificar.sh salida/piloto/1920x1080-256-oidn /workspace/salida/piloto.mp4` deja
`piloto.mp4` (H.264, yuv420p, CRF 17, BT.709, faststart, 30 fps) y `piloto.jpg` (el primer fotograma, para
`<video poster>`).

**Bajar los resultados.** Se copia (o se enlaza) a `/workspace/salida` lo que se quiera bajar y, en el pod, se abre
un servidor que solo sirve esa carpeta:

```sh
nohup python3 -m http.server 8000 --directory /workspace/salida > /workspace/http.log 2>&1 &
```

En el portátil: `curl -fO https://<id-del-pod>-8000.proxy.runpod.net/piloto.mp4`. Esa URL es pública: ahí solo van
renders, y el servidor se para al acabar: `pkill -f '[h]ttp.server 8000'` (con los corchetes; sin ellos, si la
orden va dentro de un `sh -c`, el patrón casa con ese mismo `sh -c` y pkill lo mata).

**Al terminar**, parar el pod (*Stop*: conserva `/workspace` y sigue cobrando el disco) o borrarlo (*Terminate*).

## Tiempos y coste medidos

Piloto (`planos/piloto.mjs`: la placa, 761 piezas instanciadas y 7783 triángulos únicos, 3 luces de área y 3
texturas), RTX 3070, OIDN 2.5.1 en CUDA, 2026-11-23. Segundos por fotograma sin contar el primero, que suma de
12 a 13 s de compilación; la VRAM es el pico de toda la tarjeta según `nvidia-smi`.

| Ajuste | Segundos por fotograma | De ellos, trazado | VRAM | Coste por segundo de vídeo (30 fps) |
|---|---:|---:|---:|---:|
| 960×540, 64 muestras (previa) | 1,2 | 0,7 | 1,4 GB | 0,0013 $ |
| 1920×1080, 128 muestras | 7,5 | 5,6 | 1,6 GB | 0,008 $ |
| 1920×1080, 256 muestras | 12,9 | 11,0 | 1,6 GB | 0,014 $ |

| Foto fija | Segundos | De ellos, trazado | VRAM | Coste |
|---|---:|---:|---:|---:|
| 3840×2160, 512 muestras | 110 (97 sin compilar) | 88,6 | 2,7 GB | 0,004 $ |

- El coste es tiempo × 0,13 $/h: un segundo de vídeo son 30 fotogramas, así que a 1080p y 256 muestras cuesta
  30 × 12,9 s = 6,5 min de GPU; un vídeo de 10 s, 65 min y 0,14 $.
- La GPU traza unos **48 millones de muestras por segundo** en esta escena (el mismo número en las cuatro medidas).
  Para otro tamaño: segundos por fotograma ≈ ancho × alto × muestras / 48·10⁶ + 0,85 s por megapíxel (lectura,
  OIDN, tone map y PNG en la CPU), más unos 13 s de compilación al empezar cada render.
- OIDN en CUDA tarda 0,04 s a 960×540, 0,13 s a 1080p y 0,6 s a 4K.
- Con 128 o 256 muestras y OIDN, los fotogramas del piloto no se distinguen: la diferencia media es de 0,25 niveles
  sobre 255. Para el piloto bastan 128; más muestras, solo si un plano tiene ruido que se vea (luces emisivas
  pequeñas, cáusticas).
- Mover piezas en cada fotograma (`frame` devuelve `parts`) cuesta unos 0,3 s más por fotograma a 960×540 que mover
  solo la cámara (reempaquetar la escena y reconstruir el TLAS), y no recompila: probado subiendo los chips 6 mm en
  6 fotogramas de la misma sesión.
- El fondo sale bien: el borde de los PNG mide de media (244,7; 244,4; 246,1) y, tras codificar y decodificar el MP4,
  (243,7; 243,0; 245,2), frente a #f5f5f7 = (245, 245, 247). Solo se desvían unos píxeles de las cuatro esquinas, que
  OIDN deja mal.
- Lo caro es tener el pod encendido sin renderizar: 0,13 $/h son 3,12 $ al día.
