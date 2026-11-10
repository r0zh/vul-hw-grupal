#!/usr/bin/env bash
# Compila el firmware víctima (simpleserial-aes de NewAE, AES-128 en C sin
# protecciones: CRYPTO_TARGET=TINYAES128C) y deja los .hex en firmware/build/.
#
#   firmware/build.sh                 # CWNANO, CWLITEARM y CWLITEXMEGA
#   firmware/build.sh CWNANO          # solo una plataforma
#
# Necesita arm-none-eabi-gcc (STM32) y avr-gcc (XMEGA). El código de NewAE se
# clona fuera del repo, fijado al mismo commit que el paquete de Python del
# grupo `captura` (pyproject.toml). CW_DIR permite usar otro clon.
set -euo pipefail

COMMIT=c5e8151e794e86cf588aeca6ed9d9c5f5f245c28
CW_DIR=${CW_DIR:-$HOME/Programacion/ext/chipwhisperer}
OUT=$(cd "$(dirname "$0")" && pwd)/build
PLATFORMS=("${@:-CWNANO CWLITEARM CWLITEXMEGA}")

if [ ! -d "$CW_DIR/.git" ]; then
  git clone --filter=blob:none https://github.com/newaetech/chipwhisperer.git "$CW_DIR"
fi
git -C "$CW_DIR" fetch --depth 1 origin "$COMMIT" 2>/dev/null || true
git -C "$CW_DIR" checkout -q "$COMMIT"

mkdir -p "$OUT"
cd "$CW_DIR/firmware/mcu/simpleserial-aes"
for p in ${PLATFORMS[@]}; do
  make PLATFORM="$p" CRYPTO_TARGET=TINYAES128C SS_VER=SS_VER_1_1 -j"$(nproc)" >/dev/null
  cp "simpleserial-aes-$p.hex" "$OUT/"
  echo "firmware/build/simpleserial-aes-$p.hex"
done
