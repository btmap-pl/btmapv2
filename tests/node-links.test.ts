import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../server/database.ts';
import {getTowers} from '../server/query.ts';
import {createApp} from '../server/app.ts';
import {getNearestTowers, saveNodeLink} from '../server/nodeLinks.ts';
import {parseCellSearch, arfcnToMhz, bandsForMhz, cBandOperator} from '../shared/cellSearch.ts';

// Play cell from NetMonster: gNB:CID 56680:35, NR-ARFCN 639072 (n78). UKE knows the station only as GDA1010.
function fixture() {
  const db = openDatabase(':memory:');
  const insert = db.prepare("INSERT INTO towers(id,stationId,address,province,lat,lng,operators,source,status) VALUES(?,?,?,'Pomorskie',?,?,?,'UKE','APPROVED')");
  const ops = (name: string, stationId: string, ...bands: object[]) => JSON.stringify([{name, stationIds: [stationId], bands}]);
  insert.run('UKE_play_near', 'GDA1010', 'Gdańsk, Bliska 1', 54.352, 18.646, ops('Play', 'GDA1010', {tech: '5G', band: '3600'}, {tech: 'LTE', band: '1800'}));
  insert.run('UKE_play_far', 'GDA2020', 'Gdańsk, Daleka 2', 54.40, 18.60, ops('Play', 'GDA2020', {tech: '5G', band: '3600'}));
  insert.run('UKE_play_lte', 'GDA3030', 'Gdańsk, Obok 3', 54.3525, 18.6465, ops('Play', 'GDA3030', {tech: 'LTE', band: '800'}));
  insert.run('UKE_orange', '56680', 'Gdańsk, Orange 4', 54.3521, 18.6461, ops('Orange', '56680', {tech: '5G', band: '3600'}));
  return db;
}

test('the ARFCN gives the band and, in C-band, the operator', () => {
  assert.equal(Math.round(arfcnToMhz(639072, true)! * 100) / 100, 3586.08);
  assert.equal(arfcnToMhz(432050, true), 2160.25);
  assert.equal(arfcnToMhz(1850, false), 1870);
  assert.deepEqual(bandsForMhz(3586.08), ['3500', '3600']);
  assert.equal(cBandOperator(3450), 'Plus');
  assert.equal(cBandOperator(3586.08), 'Play');
  assert.equal(cBandOperator(3650), 'Orange');
  assert.equal(cBandOperator(3750), 'T-Mobile');

  const cell = parseCellSearch('gNB:CID 56680:35 ARFCN 639072');
  assert.ok(cell);
  assert.equal(cell.operator, 'Play');
  assert.deepEqual(cell.bands, ['3500', '3600']);
  // The PLMN prefix wins over the ARFCN.
  assert.equal(parseCellSearch('260 03 56680:35 ARFCN 639072')?.operator, 'Orange');
  // 2100 MHz is shared, so it gives the band but no operator.
  assert.equal(parseCellSearch('gNB:CID 56680:35 ARFCN 432050')?.operator, undefined);
});

test('a linked gNB leads straight to the Play station, and the link survives a registry re-sync', () => {
  const db = fixture();
  try {
    // Before linking, "56680" only hits the Orange station with that number.
    assert.deepEqual(getTowers(db, {q: '56680:35 5G'}).items.map(t => t.id), ['UKE_orange']);

    saveNodeLink(db, {operator: 'Play', tech: '5G', nodeId: 56680, stationId: 'GDA1010', towerId: 'UKE_play_near'}, 'Anna');
    const found = getTowers(db, {q: 'gNB:CID 56680:35'}).items.map(t => t.id);
    assert.equal(found[0], 'UKE_play_near', 'the linked station ranks first');
    // With the operator known from the ARFCN, the Orange station with the same number drops out of first place.
    assert.equal(getTowers(db, {q: 'gNB:CID 56680:35 ARFCN 639072'}).items[0].id, 'UKE_play_near');

    // A sync re-creates the record under a new ID (moved coordinates); the link follows the station ID.
    db.prepare("UPDATE towers SET id='UKE_play_moved', lat=54.3521 WHERE id='UKE_play_near'").run();
    assert.equal(getTowers(db, {q: '14510115 5G'}).items[0].id, 'UKE_play_moved');
  } finally { db.close(); }
});

test('nearest stations: operator, technology and band, nearest first, already-linked stations last', () => {
  const db = fixture();
  try {
    const near = {lat: '54.3520', lng: '18.6460', operators: 'Play', techs: '5G', bands: '3500,3600', nodeId: '56680'};
    assert.deepEqual(getNearestTowers(db, near).map(t => t.id), ['UKE_play_near', 'UKE_play_far'], 'LTE-only and Orange stations are left out');
    const first = getNearestTowers(db, near)[0];
    assert.ok(first.distanceKm < 0.1);

    // The near station already carries another gNB, so it is a weaker candidate.
    saveNodeLink(db, {operator: 'Play', tech: '5G', nodeId: 11111, stationId: 'GDA1010', towerId: 'UKE_play_near'}, 'Anna');
    const ranked = getNearestTowers(db, near);
    assert.deepEqual(ranked.map(t => t.id), ['UKE_play_far', 'UKE_play_near']);
    assert.equal(ranked[1].linkedElsewhere, true);

    assert.throws(() => getNearestTowers(db, {lat: 'x', lng: '1'}), /położenie/);
  } finally { db.close(); }
});

test('linking a gNB through the API: moderated for users, immediate for admins', async () => {
  const db = fixture();
  const server = createApp(db).listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api`;
  const json = {'Content-Type': 'application/json'};
  try {
    const register = async (email: string, nick: string) => {
      const r = await fetch(`${base}/auth/register`, {method: 'POST', headers: json, body: JSON.stringify({email, nick, password: 'long-password-123'})});
      return r.headers.get('set-cookie')!.split(';')[0];
    };
    const userCookie = await register('user@example.com', 'User');
    const submit = (cookie: string, data: object) => fetch(`${base}/submit`, {method: 'POST', headers: {...json, cookie}, body: JSON.stringify({type: 'NODE_LINK', data})});

    // Validation: operator must be on the station, number must be valid.
    assert.equal((await submit(userCookie, {towerId: 'UKE_play_near', operator: 'Orange', tech: '5G', nodeId: 56680})).status, 400);
    assert.equal((await submit(userCookie, {towerId: 'UKE_play_near', operator: 'Play', tech: 'LTE', nodeId: 99999999})).status, 400);
    assert.equal((await submit(userCookie, {towerId: 'nope', operator: 'Play', tech: '5G', nodeId: 56680})).status, 400);

    const pending = await submit(userCookie, {towerId: 'UKE_play_near', operator: 'Play', tech: '5G', nodeId: 56680});
    assert.equal(pending.status, 201);
    const {id, status} = await pending.json();
    assert.equal(status, 'PENDING');
    assert.equal(getTowers(db, {q: 'gnb 56680'}).items[0]?.id, 'UKE_orange', 'not linked before moderation');

    const adminCookie = await register('admin@example.com', 'Admin');
    db.prepare("UPDATE users SET role='ADMIN' WHERE nick='Admin'").run();
    const moderate = await fetch(`${base}/admin/moderate`, {method: 'POST', headers: {...json, cookie: adminCookie}, body: JSON.stringify({id, action: 'APPROVE'})});
    assert.equal(moderate.status, 200, await moderate.text());

    const links = await (await fetch(`${base}/towers/UKE_play_near/node-links`)).json();
    assert.deepEqual(links, [{operator: 'Play', tech: '5G', nodeId: 56680}]);
    const search = await (await fetch(`${base}/towers?q=${encodeURIComponent('14510115 5G')}`)).json();
    assert.equal(search.items[0].id, 'UKE_play_near');
    assert.deepEqual(search.items[0].nodeLinks, [{operator: 'Play', tech: '5G', nodeId: 56680}]);

    // An admin's link is saved at once.
    const direct = await submit(adminCookie, {towerId: 'UKE_play_far', operator: 'Play', tech: 'LTE', nodeId: 123456});
    assert.equal((await direct.json()).status, 'APPROVED');
    assert.equal(getTowers(db, {q: 'eNB 123456'}).items[0].id, 'UKE_play_far');

    const nearest = await (await fetch(`${base}/towers/nearest?lat=54.352&lng=18.646&operators=Play&techs=5G&bands=3500,3600&nodeId=777`)).json();
    assert.deepEqual(nearest.items.map((t: {id: string}) => t.id), ['UKE_play_far', 'UKE_play_near']);
  } finally {
    server.close();
    db.close();
  }
});
