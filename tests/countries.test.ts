import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.ts';
import { applySeeds } from '../server/seeds.ts';
import { getTowers } from '../server/query.ts';
import { countryAt } from '../shared/countries.ts';
import { validateStationSubmission } from '../shared/cellValidation.ts';
import { parseCellSearch } from '../shared/cellSearch.ts';
import { bandOfChannel } from '../shared/radioBands.ts';

const seed = {
  credit: 'Test import',
  createdAt: '2026-11-22',
  towers: [{
    id: 'BTMAP_RO_test1', country: 'RO', operator: 'Orange RO', address: 'MM, Satu Test', lat: 47.4961, lng: 23.7903,
    cells: [
      { tech: 'LTE', band: '1800 (b3)', pci: 31, earfcn: 1600, nodeId: 96001, cellId: 2, tac: 20004, lac: null },
      { tech: 'LTE', band: '800 (b20)', pci: 31, earfcn: 6350, nodeId: 96001, cellId: 10, tac: 20004, lac: null },
    ],
  }],
};

function seededDb() {
  const dir = mkdtempSync(join(tmpdir(), 'btmap-seed-'));
  writeFileSync(join(dir, 'ro.json'), JSON.stringify(seed));
  const db = openDatabase(':memory:');
  applySeeds(db, dir);
  return { db, dir };
}

test('countries are found by position', () => {
  assert.equal(countryAt(52.23, 21.01)?.code, 'PL');
  assert.equal(countryAt(47.5, 23.8)?.code, 'RO');
  assert.equal(countryAt(48.85, 2.35), null);
});

test('a seed adds Romanian stations once, with node links', () => {
  const { db, dir } = seededDb();
  const row = db.prepare('SELECT country, source, addedBy FROM towers WHERE id=?').get('BTMAP_RO_test1') as Record<string, unknown>;
  assert.deepEqual({ ...row }, { country: 'RO', source: 'BTMAP', addedBy: 'Test import' });
  assert.equal(Number((db.prepare('SELECT COUNT(*) c FROM node_links WHERE nodeId=96001').get() as { c: number }).c), 1);
  applySeeds(db, dir);
  assert.equal(Number((db.prepare('SELECT COUNT(*) c FROM towers').get() as { c: number }).c), 1);
});

test('Romanian stations show on the map and filter by operator and band', () => {
  const { db } = seededDb();
  const box = { minLat: '47', maxLat: '48', minLng: '23', maxLng: '24', view: 'map', zoom: '12' };
  assert.equal(getTowers(db, box).items.length, 1);
  assert.equal(getTowers(db, { ...box, operators: 'Orange RO' }).items.length, 1);
  assert.equal(getTowers(db, { ...box, operators: 'Orange' }).items.length, 0);
  assert.equal(getTowers(db, { ...box, bands: '800' }).items.length, 1);
  assert.equal(getTowers(db, { ...box, bands: '2600' }).items.length, 0);
  assert.equal(getTowers(db, { q: '96001' }).items[0]?.id, 'BTMAP_RO_test1');
});

test('stations can be submitted in Romania with Romanian operators', () => {
  const base = { stationId: 'RO1', address: 'Cluj-Napoca', lat: 46.77, lng: 23.59, cells: [{ id: 'a', tech: 'LTE' as const, band: '1800 (b3)', pci: '31', earfcn: '1600', cellId: '2', nodeId: '96001' }] };
  assert.equal(validateStationSubmission({ ...base, operator: 'Orange RO' }).valid, true);
  const polish = validateStationSubmission({ ...base, operator: 'Play' });
  assert.equal(polish.valid, false);
  assert.match(polish.stationErrors.operator, /Rumunia/);
  assert.equal(validateStationSubmission({ ...base, operator: 'Orange RO', lat: 48.85, lng: 2.35 }).valid, false);
});

test('Romanian PLMN in cell search names the operator', () => {
  assert.equal(parseCellSearch('226 10 eNB 96699')?.operator, 'Orange RO');
  assert.equal(parseCellSearch('260 06 eNB 24102')?.operator, 'Play');
});

test('channels map to BTMap band labels', () => {
  assert.equal(bandOfChannel('LTE', 1600)?.label, '1800 (b3)');
  assert.equal(bandOfChannel('5G', 152190)?.label, '700 (n28)');
  assert.equal(bandOfChannel('5G', 644160)?.label, '3500 (n78)');
  assert.equal(bandOfChannel('GSM', 982)?.label, '900');
});

test('statistics are kept per country', async () => {
  const { getTelecomStats, romanianCounty } = await import('../server/stats.ts');
  const { db } = seededDb();
  db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,status) VALUES('pl1','P1','Warszawa','Mazowieckie',52.23,21.01,?,'UKE','APPROVED')")
    .run(JSON.stringify([{ name: 'Play', bands: [{ tech: 'LTE', band: '1800' }] }]));
  const ro = getTelecomStats(db, 'ALL', 'RO');
  assert.equal(ro.country, 'RO');
  assert.equal(ro.summary.totalTowers, 1);
  assert.equal(ro.summary.totalCells, 2);
  assert.deepEqual(ro.operators.map(o => o.name), ['Orange RO']);
  assert.deepEqual(ro.bands.map(b => b.key).sort(), ['LTE 1800', 'LTE 800']);
  assert.equal(ro.provinces[0].province, 'Maramureș');
  const pl = getTelecomStats(db, 'ALL', 'PL');
  assert.equal(pl.summary.totalTowers, 1);
  assert.deepEqual(pl.operators.map(o => o.name), ['Play']);
  assert.equal(romanianCounty('CJ, Cluj-Napoca'), 'Cluj');
  assert.equal(romanianCounty('Satu bez kodu'), 'Nieznany');
});
