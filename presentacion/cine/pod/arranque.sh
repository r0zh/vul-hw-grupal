#!/bin/bash
# Deja un pod de RunPod listo para renderizar los vídeos con Cook (ver LEEME.md, al lado). Se puede repetir: lo que ya
# está no se vuelve a bajar, y lo grande va a /workspace, que es el volumen que sobrevive a parar el pod.
# Imagen runpod/base:1.0.2-ubuntu2204 con NVIDIA_DRIVER_CAPABILITIES=all (sin eso no llega la parte gráfica del driver).
#
#   curl -fsSL https://raw.githubusercontent.com/r0zh/vul-hw-grupal/presentacion/presentacion/cine/pod/arranque.sh | bash
set -euo pipefail
NODE=22.23.5 NODE_SHA=cdeb8670a0c81f51b4dc4ac61919f9b1ad917b304bf8221eb939570663d240f8
OIDN=2.5.1 OIDN_SHA=743c3e2aff8c220d5d70fe6cb970fb3d36f2702d2693c61d1d148e404cf37cd6 # el de crucible/packages/denoise-oidn
OPT=/workspace/opt REPO=/workspace/repo

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq --no-install-recommends libvulkan1 vulkan-tools libegl1 libgl1 libx11-6 libxext6 \
  ffmpeg git ca-certificates curl xz-utils > /dev/null

# Descarga, comprueba el SHA-256 y descomprime en $OPT, si no está ya.
fetch() {
  [ -d "$OPT/$3" ] && return
  curl -fsSL -o "$OPT/${1##*/}" "$1"
  (cd "$OPT" && echo "$2  ${1##*/}" | sha256sum -c - && tar -xf "${1##*/}" && rm "${1##*/}")
}
mkdir -p "$OPT"
fetch "https://nodejs.org/dist/v$NODE/node-v$NODE-linux-x64.tar.xz" $NODE_SHA "node-v$NODE-linux-x64"
fetch "https://github.com/RenderKit/oidn/releases/download/v$OIDN/oidn-$OIDN.x86_64.linux.tar.gz" $OIDN_SHA "oidn-$OIDN.x86_64.linux"
ln -sfn "$OPT/oidn-$OIDN.x86_64.linux" "$OPT/oidn" # render.mjs la busca en /workspace/opt/oidn (o en OIDN_LIBRARY_PATH)
for b in node npm npx; do ln -sf "$OPT/node-v$NODE-linux-x64/bin/$b" /usr/local/bin/$b; done

[ -d "$REPO" ] || git clone --branch presentacion --single-branch https://github.com/r0zh/vul-hw-grupal "$REPO"
git -C "$REPO" pull --ff-only
cd "$REPO/presentacion/cine"
npm ci --ignore-scripts --no-audit --no-fund
npx cook fetch-addon # comprueba el SHA-256 del addon de la versión instalada
mkdir -p /workspace/salida

# La GPU tiene que ofrecer ray queries a Vulkan; si vulkaninfo solo ve llvmpipe, faltan las bibliotecas gráficas del
# driver (README de Cook, «If the install or the render fails»).
vulkaninfo 2>/dev/null | grep VK_KHR_ray_query > /dev/null || { echo 'Sin VK_KHR_ray_query: Cook no puede trazar aquí'; exit 1; }
npx cook render node_modules/@codepawlhq/cook/fixtures/room.cookpack --output /workspace/salida/room.png --width 800 --samples 256
echo ARRANQUE_OK
