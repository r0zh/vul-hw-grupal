#!/usr/bin/env bash
# Compila las variantes de la víctima con contramedidas (fase 6) y deja los
# .hex en firmware/build/:
#
#   firmware/contramedida/build.sh            # base, retardos y barajado para CWNANO
#   PLATFORM=CWLITEARM firmware/contramedida/build.sh
#
# Usa el mismo clon de NewAE que firmware/build.sh (CW_DIR), fijado al mismo
# commit; ejecuta antes firmware/build.sh si el clon no existe.
set -euo pipefail

CW_DIR=${CW_DIR:-$HOME/Programacion/ext/chipwhisperer}
PLATFORM=${PLATFORM:-CWNANO}
SRC=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "$SRC/.." && pwd)/build
[ -d "$CW_DIR/firmware/mcu" ] || { echo "No existe $CW_DIR: ejecuta firmware/build.sh" >&2; exit 1; }

declare -A VARIANTS=(
  [base]=""
  [retardos]="-DCM_DELAY"
  [barajado]="-DCM_SHUFFLE"
)

for name in base retardos barajado; do
  work="$OUT/cm-$name"
  mkdir -p "$work"
  make -C "$work" -f "$SRC/makefile" \
    CW_FW="$CW_DIR/firmware/mcu" CM_SRC="$SRC" \
    TARGET="simpleserial-aes-cm-$name" CM_DEFS="${VARIANTS[$name]}" \
    PLATFORM="$PLATFORM" SS_VER=SS_VER_1_1 -j"$(nproc)" >/dev/null
  cp "$work/simpleserial-aes-cm-$name-$PLATFORM.hex" "$OUT/"
  echo "firmware/build/simpleserial-aes-cm-$name-$PLATFORM.hex"
done
