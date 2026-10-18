"""AES-128 de referencia, en Python puro y sin dependencias externas.

Se usa para generar las trazas sintéticas de la fase 1 y para comprobar que el
valor intermedio atacado (la salida de la S-box) es el que dice la norma.
La implementación sigue FIPS-197 [nist2023fips197] y se verifica en `tests.py`
contra los ejemplos de la norma y otros vectores contrastados con OpenSSL.

El ataque no depende de esta implementación: en la fase 5 el objetivo es el
AES del firmware del ATmega328P. Aquí solo hace falta que el valor intermedio
sea exactamente el de la norma.

Convenciones:
- `state` es una lista de 16 enteros en orden de columna (FIPS-197 §3.4):
  el byte `i` corresponde a la fila `i % 4` y a la columna `i // 4`.
- Los textos claros y las claves son `bytes` de longitud 16.
"""

from __future__ import annotations

# ─────────────────────────────── S-box ────────────────────────────────────

# Caja S de AES (FIPS-197, figura 7): sustitución byte a byte.
SBOX: tuple[int, ...] = (
    0x63, 0x7C, 0x77, 0x7B, 0xF2, 0x6B, 0x6F, 0xC5, 0x30, 0x01, 0x67, 0x2B, 0xFE, 0xD7, 0xAB, 0x76,
    0xCA, 0x82, 0xC9, 0x7D, 0xFA, 0x59, 0x47, 0xF0, 0xAD, 0xD4, 0xA2, 0xAF, 0x9C, 0xA4, 0x72, 0xC0,
    0xB7, 0xFD, 0x93, 0x26, 0x36, 0x3F, 0xF7, 0xCC, 0x34, 0xA5, 0xE5, 0xF1, 0x71, 0xD8, 0x31, 0x15,
    0x04, 0xC7, 0x23, 0xC3, 0x18, 0x96, 0x05, 0x9A, 0x07, 0x12, 0x80, 0xE2, 0xEB, 0x27, 0xB2, 0x75,
    0x09, 0x83, 0x2C, 0x1A, 0x1B, 0x6E, 0x5A, 0xA0, 0x52, 0x3B, 0xD6, 0xB3, 0x29, 0xE3, 0x2F, 0x84,
    0x53, 0xD1, 0x00, 0xED, 0x20, 0xFC, 0xB1, 0x5B, 0x6A, 0xCB, 0xBE, 0x39, 0x4A, 0x4C, 0x58, 0xCF,
    0xD0, 0xEF, 0xAA, 0xFB, 0x43, 0x4D, 0x33, 0x85, 0x45, 0xF9, 0x02, 0x7F, 0x50, 0x3C, 0x9F, 0xA8,
    0x51, 0xA3, 0x40, 0x8F, 0x92, 0x9D, 0x38, 0xF5, 0xBC, 0xB6, 0xDA, 0x21, 0x10, 0xFF, 0xF3, 0xD2,
    0xCD, 0x0C, 0x13, 0xEC, 0x5F, 0x97, 0x44, 0x17, 0xC4, 0xA7, 0x7E, 0x3D, 0x64, 0x5D, 0x19, 0x73,
    0x60, 0x81, 0x4F, 0xDC, 0x22, 0x2A, 0x90, 0x88, 0x46, 0xEE, 0xB8, 0x14, 0xDE, 0x5E, 0x0B, 0xDB,
    0xE0, 0x32, 0x3A, 0x0A, 0x49, 0x06, 0x24, 0x5C, 0xC2, 0xD3, 0xAC, 0x62, 0x91, 0x95, 0xE4, 0x79,
    0xE7, 0xC8, 0x37, 0x6D, 0x8D, 0xD5, 0x4E, 0xA9, 0x6C, 0x56, 0xF4, 0xEA, 0x65, 0x7A, 0xAE, 0x08,
    0xBA, 0x78, 0x25, 0x2E, 0x1C, 0xA6, 0xB4, 0xC6, 0xE8, 0xDD, 0x74, 0x1F, 0x4B, 0xBD, 0x8B, 0x8A,
    0x70, 0x3E, 0xB5, 0x66, 0x48, 0x03, 0xF6, 0x0E, 0x61, 0x35, 0x57, 0xB9, 0x86, 0xC1, 0x1D, 0x9E,
    0xE1, 0xF8, 0x98, 0x11, 0x69, 0xD9, 0x8E, 0x94, 0x9B, 0x1E, 0x87, 0xE9, 0xCE, 0x55, 0x28, 0xDF,
    0x8C, 0xA1, 0x89, 0x0D, 0xBF, 0xE6, 0x42, 0x68, 0x41, 0x99, 0x2D, 0x0F, 0xB0, 0x54, 0xBB, 0x16,
)

# Caja S inversa (FIPS-197, figura 14), derivada de la anterior.
INV_SBOX: tuple[int, ...] = tuple(
    next(i for i, v in enumerate(SBOX) if v == x) for x in range(256)
)

# Constantes de ronda (FIPS-197 §5.2).
RCON: tuple[int, ...] = (
    0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36,
)


# ──────────────────────────── Utilidades internas ────────────────────────

def _xtime(a: int) -> int:
    """Multiplicación por x (0x02) en GF(2^8) con el polinomio de AES."""
    return ((a << 1) ^ 0x1B) & 0xFF if a & 0x80 else (a << 1) & 0xFF


def _gmul(a: int, b: int) -> int:
    """Multiplicación en GF(2^8) módulo x^8 + x^4 + x^3 + x + 1."""
    result = 0
    while b:
        if b & 1:
            result ^= a
        a = _xtime(a)
        b >>= 1
    return result


def _sub_bytes(state: list[int], box: tuple[int, ...]) -> None:
    for i, value in enumerate(state):
        state[i] = box[value]


def _shift_rows(state: list[int]) -> None:
    """Desplaza cíclicamente la fila r, r posiciones a la izquierda."""
    for row in range(1, 4):
        indices = [row + 4 * col for col in range(4)]  # de columna en columna
        values = [state[i] for i in indices]
        rotated = values[row:] + values[:row]
        for i, value in zip(indices, rotated):
            state[i] = value


def _inv_shift_rows(state: list[int]) -> None:
    for row in range(1, 4):
        indices = [row + 4 * col for col in range(4)]
        values = [state[i] for i in indices]
        rotated = values[-row:] + values[:-row]
        for i, value in zip(indices, rotated):
            state[i] = value


def _mix_columns(state: list[int]) -> None:
    """Multiplica cada columna por la matriz fija del enunciado de AES."""
    for col in range(4):
        i = 4 * col
        a0, a1, a2, a3 = state[i], state[i + 1], state[i + 2], state[i + 3]
        state[i] = _gmul(a0, 2) ^ _gmul(a1, 3) ^ a2 ^ a3
        state[i + 1] = a0 ^ _gmul(a1, 2) ^ _gmul(a2, 3) ^ a3
        state[i + 2] = a0 ^ a1 ^ _gmul(a2, 2) ^ _gmul(a3, 3)
        state[i + 3] = _gmul(a0, 3) ^ a1 ^ a2 ^ _gmul(a3, 2)


def _inv_mix_columns(state: list[int]) -> None:
    for col in range(4):
        i = 4 * col
        a0, a1, a2, a3 = state[i], state[i + 1], state[i + 2], state[i + 3]
        state[i] = _gmul(a0, 14) ^ _gmul(a1, 11) ^ _gmul(a2, 13) ^ _gmul(a3, 9)
        state[i + 1] = _gmul(a0, 9) ^ _gmul(a1, 14) ^ _gmul(a2, 11) ^ _gmul(a3, 13)
        state[i + 2] = _gmul(a0, 13) ^ _gmul(a1, 9) ^ _gmul(a2, 14) ^ _gmul(a3, 11)
        state[i + 3] = _gmul(a0, 11) ^ _gmul(a1, 13) ^ _gmul(a2, 9) ^ _gmul(a3, 14)


def _add_round_key(state: list[int], round_key: list[int]) -> None:
    for i in range(16):
        state[i] ^= round_key[i]


# ───────────────────────────── Expansión de clave ────────────────────────

def key_expansion(key: bytes) -> list[list[int]]:
    """Devuelve las 11 claves de ronda (FIPS-197 §5.2) como listas de 16 bytes."""
    if len(key) != 16:
        raise ValueError("la clave debe tener 16 bytes")
    words = [list(key[4 * i:4 * i + 4]) for i in range(4)]
    for i in range(4, 44):
        temp = list(words[i - 1])
        if i % 4 == 0:
            temp = temp[1:] + temp[:1]              # RotWord
            temp = [SBOX[b] for b in temp]          # SubWord
            temp[0] ^= RCON[i // 4]
        words.append([words[i - 4][j] ^ temp[j] for j in range(4)])
    return [[b for word in words[4 * r:4 * r + 4] for b in word] for r in range(11)]


# ────────────────────────────────── AES ──────────────────────────────────

def encrypt_block(plaintext: bytes, round_keys: list[list[int]]) -> bytes:
    """Cifra un bloque de 16 bytes (FIPS-197, figura 5)."""
    if len(plaintext) != 16:
        raise ValueError("el texto claro debe tener 16 bytes")
    state = list(plaintext)
    _add_round_key(state, round_keys[0])
    for rnd in range(1, 10):
        _sub_bytes(state, SBOX)
        _shift_rows(state)
        _mix_columns(state)
        _add_round_key(state, round_keys[rnd])
    _sub_bytes(state, SBOX)
    _shift_rows(state)
    _add_round_key(state, round_keys[10])
    return bytes(state)


def decrypt_block(ciphertext: bytes, round_keys: list[list[int]]) -> bytes:
    """Descifra un bloque de 16 bytes (FIPS-197, figura 12)."""
    if len(ciphertext) != 16:
        raise ValueError("el criptograma debe tener 16 bytes")
    state = list(ciphertext)
    _add_round_key(state, round_keys[10])
    for rnd in range(9, 0, -1):
        _inv_shift_rows(state)
        _sub_bytes(state, INV_SBOX)
        _add_round_key(state, round_keys[rnd])
        _inv_mix_columns(state)
    _inv_shift_rows(state)
    _sub_bytes(state, INV_SBOX)
    _add_round_key(state, round_keys[0])
    return bytes(state)


def encrypt_block_with_key(plaintext: bytes, key: bytes) -> bytes:
    """Atajo para cifrar un bloque con una clave de 16 bytes."""
    return encrypt_block(plaintext, key_expansion(key))


# ─────────── Versión vectorizada (muchos bloques a la vez, con numpy) ─────
#
# Las funciones `*_batch` operan sobre un array (N, 16) en `numpy.uint8` y
# reproducen exactamente el mismo algoritmo que las de arriba. Se usan para
# generar las trazas sintéticas de miles de ejecuciones sin bucles en Python;
# `tests.py` comprueba que ambos caminos coinciden.


def _as_bytes_array(values) -> "object":
    """Convierte `bytes` o un iterable de enteros en `numpy.uint8` sin copiar."""
    import numpy as np

    if isinstance(values, (bytes, bytearray, memoryview)):
        return np.frombuffer(bytes(values), dtype=np.uint8)
    return np.asarray(values, dtype=np.uint8)


def key_expansion_batch(key) -> "object":
    """Claves de ronda como array (11, 16) de `numpy.uint8`."""
    import numpy as np

    if len(key) != 16:
        raise ValueError("la clave debe tener 16 bytes")
    box = np.asarray(SBOX, dtype=np.uint8)
    rcon = np.asarray(RCON, dtype=np.uint8)
    words = _as_bytes_array(key).reshape(4, 4).copy()
    expanded = [words[i].copy() for i in range(4)]           # palabras (4,)
    for i in range(4, 44):
        temp = expanded[i - 1].copy()
        if i % 4 == 0:
            temp = np.roll(temp, -1)        # RotWord
            temp = box[temp].copy()         # SubWord
            temp[0] ^= rcon[i // 4]
        expanded.append(expanded[i - 4] ^ temp)
    words = np.asarray(expanded, dtype=np.uint8)            # (44, 4)
    return words.reshape(11, 16)                            # clave de cada ronda


def _shift_rows_index() -> "object":
    """Permutación de índices que aplica ShiftRows sobre un estado aplanado.

    El estado se guarda en orden de columna (`state[4·col + fila]`), así que
    tras `ShiftRows` la posición `4·col + fila` contiene el byte que estaba en
    la columna `(col + fila) mod 4` de esa misma fila.
    """
    import numpy as np

    index = np.empty(16, dtype=np.intp)
    for col in range(4):
        for row in range(4):
            index[4 * col + row] = 4 * ((col + row) % 4) + row
    return index


_SHIFT_ROWS_INDEX = _shift_rows_index()

#: Permutación de ShiftRows: la posición `j` del criptograma sale de la
#: posición de estado `SHIFT_ROWS_INDEX[j]` de la última `SubBytes`.
SHIFT_ROWS_INDEX = _SHIFT_ROWS_INDEX


def _shift_rows_batch(state):
    """Aplica ShiftRows a un lote de estados (N, 16)."""
    return state[:, _SHIFT_ROWS_INDEX]


def _mix_columns_batch(state):
    """Aplica MixColumns a un lote de estados (N, 16)."""
    import numpy as np

    # `grid[:, fila, columna] = state[4·columna + fila]`, que es el orden de
    # columna con el que FIPS-197 numera el estado.
    grid = state.reshape(-1, 4, 4).transpose(0, 2, 1)
    a0, a1, a2, a3 = (grid[:, row, :] for row in range(4))
    double = lambda a: ((a << 1) ^ np.where(a & 0x80, 0x1B, 0x00)).astype(np.uint8)
    b0, b1, b2, b3 = double(a0), double(a1), double(a2), double(a3)
    out = np.empty_like(grid)
    out[:, 0, :] = b0 ^ (b1 ^ a1) ^ a2 ^ a3
    out[:, 1, :] = a0 ^ b1 ^ (b2 ^ a2) ^ a3
    out[:, 2, :] = a0 ^ a1 ^ b2 ^ (b3 ^ a3)
    out[:, 3, :] = (b0 ^ a0) ^ a1 ^ a2 ^ b3
    return out.transpose(0, 2, 1).reshape(-1, 16)


def _encrypt_batch_states(plaintexts, round_keys):
    """Cifra N bloques y devuelve también la entrada de la última `SubBytes`.

    Devuelve `(criptogramas, entrada)`, ambos (N, 16) en orden de estado.
    """
    import numpy as np

    state = np.asarray(plaintexts, dtype=np.uint8) ^ round_keys[0]
    box = np.asarray(SBOX, dtype=np.uint8)
    for rnd in range(1, 10):
        state = box[state]
        state = _shift_rows_batch(state)
        state = _mix_columns_batch(state)
        state = state ^ round_keys[rnd]
    last_input = state
    state = box[state]
    state = _shift_rows_batch(state)
    return state ^ round_keys[10], last_input


def encrypt_batch(plaintexts, round_keys):
    """Cifra N bloques: `plaintexts` (N, 16) uint8 y `round_keys` (11, 16)."""
    return _encrypt_batch_states(plaintexts, round_keys)[0]


def cipher_intermediates(plaintexts, key):
    """Valores intermedios de un lote de cifrados con `key`.

    Devuelve un diccionario con:

    - `first_sbox`: salida de la S-box de la primera ronda, `SBox(p_j ^ k_j)`,
      de forma (N, 16). Es el valor intermedio que ataca el CPA.
    - `last_sbox_input`: entrada de la `SubBytes` de la última ronda, (N, 16),
      en orden de estado: la columna `i` es el byte que la S-box procesa en la
      posición `i`. Depende de la subclave 10, no de la clave maestra.
    - `ciphertexts`: criptogramas, (N, 16).
    """
    import numpy as np

    ciphertexts, last_input = _encrypt_batch_states(
        plaintexts, key_expansion_batch(key)
    )
    box = np.asarray(SBOX, dtype=np.uint8)
    plaintexts = np.asarray(plaintexts, dtype=np.uint8)
    key_array = _as_bytes_array(key)
    return {
        "first_sbox": box[plaintexts ^ key_array],
        "last_sbox_input": last_input,
        "ciphertexts": ciphertexts,
    }


# ─────────────────── Valores intermedios relevantes para el CPA ──────────

def first_round_sbox_outputs(plaintexts, key) -> "object":
    """Salida de la S-box de la primera ronda, `SBox(p_j ^ k_j)`.

    Devuelve un array de forma (N, 16) con `numpy.uint8`: es el valor
    intermedio que ataca el CPA según AGENTS.md.
    """
    import numpy as np

    plaintexts = np.asarray(plaintexts, dtype=np.uint8)
    key = _as_bytes_array(key)
    box = np.asarray(SBOX, dtype=np.uint8)
    return box[plaintexts ^ key]


def last_round_sbox_inputs(ciphertexts, round_key_10) -> "object":
    """Entrada de la S-box de la última ronda, `InvSBox(c_j ^ K10_j)`.

    La última ronda es `SubBytes` → `ShiftRows` → `AddRoundKey` con la subclave
    10, así que `c_j ^ K10_j` es la salida de la S-box y su inversa, la entrada.
    El resultado va en el orden del criptograma: la columna `j` es el byte que
    la S-box procesa en la posición de estado `SHIFT_ROWS_INDEX[j]`. Devuelve
    (N, 16) en `numpy.uint8`.

    Con la clave maestra en lugar de `K10` el resultado no es ningún valor
    intermedio de AES: el ataque a la última ronda recupera `K10`, y la clave
    maestra se obtiene después con `invert_key_schedule`.
    """
    import numpy as np

    ciphertexts = np.asarray(ciphertexts, dtype=np.uint8)
    round_key_10 = _as_bytes_array(round_key_10)
    inv_box = np.asarray(INV_SBOX, dtype=np.uint8)
    return inv_box[ciphertexts ^ round_key_10]


def invert_key_schedule(round_key_10) -> bytes:
    """Clave maestra a partir de la subclave 10 (FIPS-197 §5.2, al revés).

    La expansión de AES-128 es invertible: `w[i-4] = w[i] ^ g(w[i-1])`, donde
    `g` es `RotWord`, `SubWord` y `Rcon` cuando `i` es múltiplo de 4 y la
    identidad en otro caso.
    """
    round_key_10 = bytes(_as_bytes_array(round_key_10))
    if len(round_key_10) != 16:
        raise ValueError("la subclave debe tener 16 bytes")
    words: list[list[int] | None] = [None] * 44
    for j in range(4):
        words[40 + j] = list(round_key_10[4 * j:4 * j + 4])
    for i in range(43, 3, -1):
        temp = list(words[i - 1])
        if i % 4 == 0:
            temp = temp[1:] + temp[:1]              # RotWord
            temp = [SBOX[b] for b in temp]          # SubWord
            temp[0] ^= RCON[i // 4]
        words[i - 4] = [words[i][j] ^ temp[j] for j in range(4)]
    return bytes(b for word in words[:4] for b in word)


def aes_test_vectors() -> list[tuple[bytes, bytes, bytes]]:
    """Vectores de prueba de AES-128.

    Los dos primeros son los ejemplos de FIPS-197 [nist2023fips197]: el del
    apéndice B (cuya clave es la clave de laboratorio de la simulación) y el
    del apéndice C.1. Los otros tres son casos extremos (todo a cero, todo a
    uno) que no están en la norma; sus criptogramas se han contrastado con
    OpenSSL (`openssl enc -aes-128-ecb -nopad`), una implementación
    independiente.

    Devuelve una lista de tuplas `(clave, texto claro, criptograma)`.
    """
    return [
        # FIPS-197, apéndice B.
        (
            bytes.fromhex("2b7e151628aed2a6abf7158809cf4f3c"),
            bytes.fromhex("3243f6a8885a308d313198a2e0370734"),
            bytes.fromhex("3925841d02dc09fbdc118597196a0b32"),
        ),
        # FIPS-197, apéndice C.1.
        (
            bytes.fromhex("000102030405060708090a0b0c0d0e0f"),
            bytes.fromhex("00112233445566778899aabbccddeeff"),
            bytes.fromhex("69c4e0d86a7b0430d8cdb78070b4c55a"),
        ),
        # Clave y texto claro nulos (contrastado con OpenSSL).
        (
            bytes.fromhex("00000000000000000000000000000000"),
            bytes.fromhex("00000000000000000000000000000000"),
            bytes.fromhex("66e94bd4ef8a2c3b884cfa59ca342b2e"),
        ),
        # Clave nula, texto claro todo a uno (contrastado con OpenSSL).
        (
            bytes.fromhex("00000000000000000000000000000000"),
            bytes.fromhex("ffffffffffffffffffffffffffffffff"),
            bytes.fromhex("3f5b8cc9ea855a0afa7347d23e8d664e"),
        ),
        # Texto claro nulo, clave todo a uno (contrastado con OpenSSL).
        (
            bytes.fromhex("ffffffffffffffffffffffffffffffff"),
            bytes.fromhex("00000000000000000000000000000000"),
            bytes.fromhex("a1f6258c877d5fcd8964484538bfc92c"),
        ),
    ]


if __name__ == "__main__":  # comprobación rápida, sin pytest
    for index, (key, plaintext, expected) in enumerate(aes_test_vectors(), start=1):
        round_keys = key_expansion(key)
        ciphertext = encrypt_block(plaintext, round_keys)
        recovered = decrypt_block(ciphertext, round_keys)
        assert ciphertext == expected, f"vector {index}: {ciphertext.hex()} != {expected.hex()}"
        assert recovered == plaintext, f"vector {index}: descifrado incorrecto"
        print(f"vector {index}: correcto ({ciphertext.hex()})")
