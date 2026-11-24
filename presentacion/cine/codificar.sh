#!/bin/sh
# Une los PNG de un plano (0000.png, 0001.png…) en un MP4 H.264 para el navegador y saca su póster (el primer
# fotograma, en JPEG), que es lo que enseña <video poster> antes de arrancar.
#
#   sh codificar.sh salida/piloto/1920x1080-256-oidn [piloto.mp4] [fps] [opciones de x264…]   → piloto.mp4 y piloto.jpg
#
# Las opciones de después van al codificador: un vídeo que se arrastra (V1 del guion) lleva -g 10 -bf 0.
#
# yuv420p con BT.709 en la conversión y en las marcas del vídeo: sin la matriz explícita, ffmpeg convierte el RGB con
# la de BT.601 y el navegador, que lee BT.709, desplaza los colores. Así, el fondo #f5f5f7 vuelve a salir a ±2 niveles
# (comprobado decodificando el MP4). Las marcas van con setparams: con -color_primaries y -color_trc, ffmpeg 9 las pierde.
set -eu
dir=${1:?carpeta con los PNG}
out=${2:-$(basename "$dir").mp4}
fps=${3:-30}
shift $(($# < 3 ? $# : 3))
ffmpeg -y -loglevel error -framerate "$fps" -i "$dir/%04d.png" \
  -vf 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv' \
  -c:v libx264 -preset slow -crf 17 "$@" -movflags +faststart "$out"
ffmpeg -y -loglevel error -i "$dir/0000.png" -q:v 2 "${out%.mp4}.jpg"
echo "$out ($(du -h "$out" | cut -f1)) y ${out%.mp4}.jpg"
