// La campaña medida de data/ (la genera analisis/reales.py): el CPA de la web
// recupera la clave igual que el de Python. Si falla, o el JSON no se ha
// regenerado o el CPA en JavaScript ha dejado de ser exacto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAccumulator, attack, fromCampaignJSON } from '../js/model/cpa.js';
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
