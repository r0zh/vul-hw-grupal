// AES-128 contra los ejemplos de FIPS-197 [nist2023fips197].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, encryptDetailed, keyExpansion, invertKeySchedule, SBOX, INV_SBOX, HW, fromHex, toHex } from '../js/model/aes.js';

test('FIPS-197, apéndice C.1', () => {
  const c = encrypt(fromHex('00112233445566778899aabbccddeeff'), fromHex('000102030405060708090a0b0c0d0e0f'));
  assert.equal(toHex(c), '69c4e0d86a7b0430d8cdb78070b4c55a');
});

test('FIPS-197, apéndice B (la clave de laboratorio)', () => {
  const c = encrypt(fromHex('3243f6a8885a308d313198a2e0370734'), fromHex('2b7e151628aed2a6abf7158809cf4f3c'));
  assert.equal(toHex(c), '3925841d02dc09fbdc118597196a0b32');
});

test('subclave 10 del apéndice A.1 y su inversión', () => {
  const key = fromHex('2b7e151628aed2a6abf7158809cf4f3c');
  const k10 = keyExpansion(key)[10];
  assert.equal(toHex(k10), 'd014f9a8c9ee2589e13f0cc8b6630ca6');
  assert.equal(toHex(invertKeySchedule(k10)), toHex(key));
});

test('la entrada de la última SubBytes reproduce el criptograma', () => {
  const key = fromHex('000102030405060708090a0b0c0d0e0f');
  const rk = keyExpansion(key);
  const { ciphertext, lastInput } = encryptDetailed(fromHex('00112233445566778899aabbccddeeff'), rk);
  // c_j = SBox(x_{SR[j]}) ⊕ K10_j: deshaciendo la última ronda sale x.
  const SR = Array.from({ length: 16 }, (_, i) => 4 * (((i >> 2) + (i & 3)) % 4) + (i & 3));
  for (let j = 0; j < 16; j++) assert.equal(INV_SBOX[ciphertext[j] ^ rk[10][j]], lastInput[SR[j]]);
});

test('tablas', () => {
  for (let v = 0; v < 256; v++) assert.equal(INV_SBOX[SBOX[v]], v);
  assert.deepEqual([HW[0], HW[1], HW[0x0f], HW[0xff]], [0, 1, 4, 8]);
});
