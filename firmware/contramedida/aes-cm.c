/*
 * AES-128 con contramedidas de ocultamiento para la fase 6 del trabajo.
 *
 * Sustituye a aes-independant.c de NewAE: implementa las funciones
 * aes_indep_* que llama simpleserial-aes.c, así que el protocolo y el trigger
 * son los mismos que en la víctima sin proteger.
 *
 * La estructura del cifrado (estado 4x4 por columnas, SubBytes, ShiftRows,
 * MixColumns y AddRoundKey por separado) sigue a tiny-AES128-C de kokke, que
 * es de dominio público, para que la versión sin contramedidas se parezca a
 * la víctima original.
 *
 * Opciones de compilación (CM=... en build.sh):
 *   CM_DELAY    retardo aleatorio de 0 a CM_DELAY_MASK vueltas antes de cada
 *               byte de SubBytes, de cada columna de MixColumns y al empezar
 *               cada ronda (ocultamiento en el tiempo).
 *   CM_SHUFFLE  SubBytes recorre los 16 bytes en un orden aleatorio distinto
 *               en cada cifrado (barajado). ShiftRows y MixColumns no se
 *               barajan.
 *
 * Generador: xorshift32. El STM32 de la placa no tiene generador de números
 * aleatorios por hardware y la semilla es una constante de compilación: el
 * atacante de nuestro experimento no la usa, pero con el código y la semilla
 * públicos se podrían predecir los retardos tras un reset. Una implementación
 * real necesita una fuente de entropía (TRNG) y no solo un PRNG.
 */

#include <stdint.h>
#include "aes-independant.h"

#ifndef CM_DELAY_MASK
#define CM_DELAY_MASK 0x0F
#endif

#ifndef CM_SEED
#define CM_SEED 0x9E3779B9u
#endif

typedef uint8_t state_t[4][4];

static uint8_t round_key[176];
static state_t *state;
static uint32_t prng_state = CM_SEED;

static const uint8_t sbox[256] = {
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16};

static const uint8_t rcon[11] = {0x8d, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36};

static uint32_t prng(void)
{
  uint32_t x = prng_state;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  prng_state = x;
  return x;
}

#ifdef CM_DELAY
static void random_delay(void)
{
  for (volatile uint32_t n = prng() & CM_DELAY_MASK; n > 0; n--)
    ;
}
#define DELAY() random_delay()
#else
#define DELAY() ((void)0)
#endif

static void key_expansion(const uint8_t *key)
{
  uint8_t t[4];
  for (int i = 0; i < 16; i++)
    round_key[i] = key[i];
  for (int i = 4; i < 44; i++) {
    for (int j = 0; j < 4; j++)
      t[j] = round_key[(i - 1) * 4 + j];
    if (i % 4 == 0) {
      uint8_t u = t[0];
      t[0] = sbox[t[1]] ^ rcon[i / 4];
      t[1] = sbox[t[2]];
      t[2] = sbox[t[3]];
      t[3] = sbox[u];
    }
    for (int j = 0; j < 4; j++)
      round_key[i * 4 + j] = round_key[(i - 4) * 4 + j] ^ t[j];
  }
}

static void add_round_key(uint8_t round)
{
  for (uint8_t i = 0; i < 4; i++)
    for (uint8_t j = 0; j < 4; j++)
      (*state)[i][j] ^= round_key[round * 16 + i * 4 + j];
}

static void sub_bytes(void)
{
#ifdef CM_SHUFFLE
  /* Orden (start + step * k) mod 16 con step impar: recorre los 16 bytes
     una vez cada uno y da 16 * 8 = 128 órdenes posibles por cifrado. */
  uint32_t r = prng();
  uint8_t start = r & 0x0F;
  uint8_t step = ((r >> 4) & 0x0E) | 0x01;
  for (uint8_t k = 0; k < 16; k++) {
    uint8_t idx = (uint8_t)(start + step * k) & 0x0F;
    DELAY();
    (*state)[idx >> 2][idx & 3] = sbox[(*state)[idx >> 2][idx & 3]];
  }
#else
  for (uint8_t i = 0; i < 4; i++)
    for (uint8_t j = 0; j < 4; j++) {
      DELAY();
      (*state)[i][j] = sbox[(*state)[i][j]];
    }
#endif
}

static void shift_rows(void)
{
  uint8_t t;
  t = (*state)[0][1];
  (*state)[0][1] = (*state)[1][1];
  (*state)[1][1] = (*state)[2][1];
  (*state)[2][1] = (*state)[3][1];
  (*state)[3][1] = t;

  t = (*state)[0][2];
  (*state)[0][2] = (*state)[2][2];
  (*state)[2][2] = t;
  t = (*state)[1][2];
  (*state)[1][2] = (*state)[3][2];
  (*state)[3][2] = t;

  t = (*state)[0][3];
  (*state)[0][3] = (*state)[3][3];
  (*state)[3][3] = (*state)[2][3];
  (*state)[2][3] = (*state)[1][3];
  (*state)[1][3] = t;
}

static uint8_t xtime(uint8_t x)
{
  return (uint8_t)((x << 1) ^ (((x >> 7) & 1) * 0x1b));
}

static void mix_columns(void)
{
  for (uint8_t i = 0; i < 4; i++) {
    DELAY();
    uint8_t a = (*state)[i][0];
    uint8_t all = a ^ (*state)[i][1] ^ (*state)[i][2] ^ (*state)[i][3];
    uint8_t t;
    t = (*state)[i][0] ^ (*state)[i][1]; (*state)[i][0] ^= xtime(t) ^ all;
    t = (*state)[i][1] ^ (*state)[i][2]; (*state)[i][1] ^= xtime(t) ^ all;
    t = (*state)[i][2] ^ (*state)[i][3]; (*state)[i][2] ^= xtime(t) ^ all;
    t = (*state)[i][3] ^ a;              (*state)[i][3] ^= xtime(t) ^ all;
  }
}

static void cipher(void)
{
  DELAY();
  add_round_key(0);
  for (uint8_t round = 1; round < 10; round++) {
    DELAY();
    sub_bytes();
    shift_rows();
    mix_columns();
    add_round_key(round);
  }
  DELAY();
  sub_bytes();
  shift_rows();
  add_round_key(10);
}

void aes_indep_init(void)
{
  prng_state = CM_SEED;
}

void aes_indep_key(uint8_t *key)
{
  key_expansion(key);
}

void aes_indep_enc(uint8_t *pt)
{
  state = (state_t *)pt;
  cipher();
}

void aes_indep_enc_pretrigger(uint8_t *pt)
{
  (void)pt;
}

void aes_indep_enc_posttrigger(uint8_t *pt)
{
  (void)pt;
}

void aes_indep_mask(uint8_t *m, uint8_t len)
{
  (void)m;
  (void)len;
}
