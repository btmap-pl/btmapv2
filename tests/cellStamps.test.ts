import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stampCells } from '../shared/cellStamps.ts';

const now = '2026-11-22T12:00:00.000Z';
const earlier = '2026-10-01T08:00:00.000Z';

test('every cell of a brand-new station is new', () => {
  const cells = stampCells([{ tech: 'LTE', band: '1800 (b3)', nodeId: 96001, cellId: 2, pci: 31, earfcn: 1600 }], null, now);
  assert.equal(cells[0].addedAt, now);
  assert.equal(cells[0].modifiedAt, undefined);
});

test('unchanged cells keep their dates, changed ones are marked modified, added ones new', () => {
  const previous = [
    { tech: 'LTE', band: '1800 (b3)', nodeId: 96001, cellId: 2, pci: 31, earfcn: 1600, addedAt: earlier },
    { tech: 'LTE', band: '800 (b20)', nodeId: 96001, cellId: 10, pci: 31, earfcn: 6350, addedAt: earlier },
  ];
  const next = [
    { tech: 'LTE', band: '1800 (b3)', nodeId: 96001, cellId: 2, pci: '31', earfcn: '1600' },
    { tech: 'LTE', band: '800 (b20)', nodeId: 96001, cellId: 10, pci: 33, earfcn: 6350 },
    { tech: 'LTE', band: '2100 (b1)', nodeId: 96001, cellId: 20, pci: 31, earfcn: 525 },
  ];
  const [same, changed, added] = stampCells(next, previous, now);
  assert.equal(same.addedAt, earlier);
  assert.equal(same.modifiedAt, undefined);
  assert.equal(changed.addedAt, earlier);
  assert.equal(changed.modifiedAt, now);
  assert.equal(added.addedAt, now);
});

test('converting a registry station does not mark its known bands as new', () => {
  const registry = [{ tech: 'LTE', band: '1800', permit: 'MNET/1' }];
  const [known, extra] = stampCells([
    { tech: 'LTE', band: '1800 (b3)', nodeId: 1, cellId: 1, pci: 1, earfcn: 1300 },
    { tech: '5G', band: '3500 (n78)', nodeId: 1, cellId: 1, pci: 1, earfcn: 640000 },
  ], registry, now);
  assert.equal(known.addedAt, undefined);
  assert.equal(extra.addedAt, now);
});
