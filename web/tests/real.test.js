// La campaña medida de data/ (la genera analisis/reales.py): el CPA de la web
// recupera la clave igual que el de Python. Si falla, o el JSON no se ha
// regenerado o el CPA en JavaScript ha dejado de ser exacto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAccumulator, attack, cloud, fromCampaignJSON } from '../js/model/cpa.js';
import { toHex } from '../js/model/aes.js';

const campaign = fromCampaignJSON(
  JSON.parse(readFileSync(new URL('../data/nano-tinyaes.json', import.meta.url), 'utf8')),
);

test('la campaña real es una medida, con clave y 400 trazas', () => {
  assert.equal(campaign.synthetic, false);
  assert.equal(campaign.n, 400);
  assert.equal(toHex(campaign.key), '2b7e151628aed2a6abf7158809cf4f3c');
});

test('con las 400 trazas medidas, el CPA recupera los 16 bytes', () => {
  const res = attack(createAccumulator(campaign.nSamples).add(campaign), campaign.key);
  assert.deepEqual(res.map((r) => r.rank), Array(16).fill(1));
  for (const r of res) assert.ok(r.correctPeak > 0.4 && r.bestWrongPeak < 0.3, `byte ${r.byte}`);
});

// Lo que dicen la portada y los pasos de la sección 10 de estas trazas, en el
// orden en que se capturaron.
const firstSample = campaign.meta.muestras[0];
const attackWith = (n) => attack(createAccumulator(campaign.nSamples).add(campaign, 0, n), campaign.key);

test('la ventana son las muestras 440 a 740 de la traza', () => {
  assert.deepEqual(campaign.meta.muestras, [440, 740]);
  assert.equal(campaign.nSamples, 300);
});

test('con 75 trazas falta algún byte; a partir de la 76, la clave completa', () => {
  assert.ok(attackWith(75).some((r) => r.rank !== 1));
  for (const n of [76, 77, 78, 80, 85, 90, 100, 120, 150, 200, 300, 400]) {
    assert.ok(attackWith(n).every((r) => r.rank === 1), `con ${n} trazas falta algún byte`);
  }
});

test('cada byte tiene su pico en su instante: 0, 4, 8 y 12, y después 1', () => {
  const res = attackWith(400);
  const at = (j) => firstSample + res[j].at[res[j].correct];
  assert.deepEqual([0, 4, 8, 12, 1].map(at), [462, 473, 484, 495, 512]);
});

test('la nube del candidato correcto sube en el instante de su S-box, y solo ahí', () => {
  const res = attackWith(400)[0], leak = res.at[res.correct];
  const good = cloud(campaign, 0, res.correct, leak);
  assert.ok(Math.abs(good.rho - res.rho[res.correct * campaign.nSamples + leak]) < 1e-9, 'cloud() no da la ρ del CPA');
  assert.ok(good.rho > 0.5 && good.slope > 0.5, `ρ = ${good.rho}, pendiente ${good.slope}`);
  assert.equal(good.classes.reduce((a, c) => a + c.count, 0), 400);
  // Las medias por columna suben con la predicción (donde hay bastantes trazas).
  const means = good.classes.filter((c) => c.count >= 9).map((c) => c.mean);
  for (let i = 1; i < means.length; i++) assert.ok(means[i] > means[i - 1], `medias sin ordenar: ${means}`);
  // Un candidato falso, o el correcto en otro instante, no explican nada.
  assert.ok(Math.abs(cloud(campaign, 0, res.correct ^ 0x55, leak).rho) < 0.2);
  assert.ok(Math.abs(cloud(campaign, 0, res.correct, (leak + 150) % 300).rho) < 0.2);
});
