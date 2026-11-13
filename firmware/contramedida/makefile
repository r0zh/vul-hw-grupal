# Víctima con contramedidas: simpleserial-aes.c de NewAE (sin cambios) con
# aes-cm.c en lugar de la biblioteca de AES. Se llama desde build.sh, que
# fija CW_FW (firmware/mcu del clon de NewAE), CM_SRC (este directorio),
# TARGET y CM_DEFS (-DCM_DELAY, -DCM_SHUFFLE o nada).

FIRMWAREPATH = $(CW_FW)
SRC += simpleserial-aes.c aes-cm.c
VPATH += :$(CW_FW)/simpleserial-aes:$(CM_SRC)
CFLAGS += $(CM_DEFS)
CRYPTO_TARGET = NONE

include $(FIRMWAREPATH)/simpleserial/Makefile.simpleserial
include $(FIRMWAREPATH)/Makefile.inc
