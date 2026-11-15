import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCellSearch,
  deriveSectorNumber,
  resolveSectorAzimuth,
  extractEnodeBId,
  getStationSectorsInfo,
} from '../shared/cellSearch.ts';
import {
  findBandAllocation,
  getAvailableBandsForOperator,
  POLISH_BAND_PLAN,
} from '../shared/cellValidation.ts';
import { openDatabase } from '../server/database.ts';
import { getTowers } from '../server/query.ts';

test('gNB:CID format parsing and NetMonster notations', () => {
  // 1. gNB:CID format parsing (e.g., '56680:35' -> gNB 56680, sector 35)
  const gnbCid = parseCellSearch('gNB:CID 56680:35');
  assert.ok(gnbCid, 'Expected parseCellSearch to match gNB:CID 56680:35');
  assert.equal(gnbCid.isCellIdQuery, true);
  assert.equal(gnbCid.type, 'NR');
  assert.equal(gnbCid.nodeId, 56680);
  assert.equal(gnbCid.nodeIdStr, '56680');
  assert.equal(gnbCid.cellId, 35);
  assert.equal(gnbCid.sectorNum, 5);
  assert.equal(gnbCid.nci, 56680 * 256 + 35);
  assert.equal(gnbCid.stationIdCandidate, '56680');
  assert.ok(gnbCid.displaySummary.includes('gNodeB 56680'));
  assert.ok(gnbCid.displaySummary.includes('Sektor 5'));

  // 2. NetMonster colon and slash variations (gnb 56680:35, gnb: 56680:35, gNodeB 56680/35)
  const variants = [
    'gnb 56680:35',
    'gnb: 56680:35',
    'gnb:cid 56680:35',
    'gNodeB 56680:35',
    'gnodeb 56680/35',
    'gnb 56680-35',
  ];
  for (const variant of variants) {
    const parsed = parseCellSearch(variant);
    assert.ok(parsed, `Failed to parse variant: ${variant}`);
    assert.equal(parsed.type, 'NR');
    assert.equal(parsed.nodeId, 56680);
    assert.equal(parsed.cellId, 35);
    assert.equal(parsed.sectorNum, 5);
    assert.equal(parsed.stationIdCandidate, '56680');
  }

  // 3. Generic node:sector notation '56680:35'
  const plainDash = parseCellSearch('56680:35');
  assert.ok(plainDash);
  assert.equal(plainDash.isCellIdQuery, true);
  assert.equal(plainDash.nodeId, 56680);
  assert.equal(plainDash.cellId, 35);
  assert.equal(plainDash.sectorNum, 5);
  assert.equal(plainDash.stationIdCandidate, '56680');

  // 4. Explicit 5G dash notation '56680:35 5G' and '5G 56680:35'
  const fiveGTrailing = parseCellSearch('56680:35 5G');
  assert.ok(fiveGTrailing);
  assert.equal(fiveGTrailing.type, 'NR');
  assert.equal(fiveGTrailing.nodeId, 56680);
  assert.equal(fiveGTrailing.cellId, 35);
  assert.equal(fiveGTrailing.nci, 14510115);

  const fiveGLeading = parseCellSearch('5G 56680:35');
  assert.ok(fiveGLeading);
  assert.equal(fiveGLeading.type, 'NR');
  assert.equal(fiveGLeading.nodeId, 56680);
  assert.equal(fiveGLeading.cellId, 35);
  assert.equal(fiveGLeading.nci, 14510115);

  // 5. Sector derivation in Polish mobile networks
  assert.equal(deriveSectorNumber(1), 1);
  assert.equal(deriveSectorNumber(11), 1);
  assert.equal(deriveSectorNumber(21), 1);
  assert.equal(deriveSectorNumber(31), 1);
  assert.equal(deriveSectorNumber(2), 2);
  assert.equal(deriveSectorNumber(12), 2);
  assert.equal(deriveSectorNumber(22), 2);
  assert.equal(deriveSectorNumber(3), 3);
  assert.equal(deriveSectorNumber(13), 3);
  assert.equal(deriveSectorNumber(23), 3);
  assert.equal(deriveSectorNumber(35), 5);
  assert.equal(deriveSectorNumber(null), null);
  assert.equal(deriveSectorNumber(undefined), null);
});

test('Full NR Cell Identity (NCI) conversion and calculation', () => {
  // Conversion formula: NCI = gNB * 256 + cellId
  // For gNB 56680 and sector/cell 35:
  // 56680 * 256 = 14510080
  // 14510080 + 35 = 14510115
  const expectedGnb = 56680;
  const expectedCellId = 35;
  const expectedNci = expectedGnb * 256 + expectedCellId;
  assert.equal(expectedNci, 14510115);

  // 1. Explicit NCI search
  const nciResult = parseCellSearch('NCI 14510115');
  assert.ok(nciResult);
  assert.equal(nciResult.isCellIdQuery, true);
  assert.equal(nciResult.type, 'NR');
  assert.equal(nciResult.nodeId, expectedGnb);
  assert.equal(nciResult.nodeIdStr, '56680');
  assert.equal(nciResult.cellId, expectedCellId);
  assert.equal(nciResult.nci, expectedNci);
  assert.equal(nciResult.sectorNum, 5);
  assert.equal(nciResult.stationIdCandidate, '56680');
  assert.ok(nciResult.displaySummary.includes('gNodeB 56680'));
  assert.ok(nciResult.displaySummary.includes('NCI 14510115'));

  // 2. 5G CI variations
  const fiveGCi = parseCellSearch('5G CI 14510115');
  assert.ok(fiveGCi);
  assert.equal(fiveGCi.type, 'NR');
  assert.equal(fiveGCi.nodeId, expectedGnb);
  assert.equal(fiveGCi.cellId, expectedCellId);
  assert.equal(fiveGCi.nci, expectedNci);

  const nrCi = parseCellSearch('NR CI: 14510115');
  assert.ok(nrCi);
  assert.equal(nrCi.type, 'NR');
  assert.equal(nrCi.nodeId, expectedGnb);
  assert.equal(nrCi.nci, expectedNci);

  // 3. Generic CI fallback
  const genericCi = parseCellSearch('CI 14510115');
  assert.ok(genericCi);
  assert.equal(genericCi.nodeId, expectedGnb);
  assert.equal(genericCi.cellId, expectedCellId);
  assert.equal(genericCi.stationIdCandidate, '56680');

  // 4. Large 12-bit NCI (> 16777216)
  const largeNciVal = 45000 * 4096 + 12; // 184320012
  const largeNci = parseCellSearch(`NCI ${largeNciVal}`);
  assert.ok(largeNci);
  assert.equal(largeNci.type, 'NR');
  assert.equal(largeNci.nodeId, 45000);
  assert.equal(largeNci.cellId, 12);
  assert.equal(largeNci.nci, largeNciVal);

  // 5. Azimuth and station sector resolution
  const azMatch1 = resolveSectorAzimuth([0, 120, 240], 1);
  assert.deepEqual(azMatch1, { azimuth: 0, sectorNum: 1 });
  const azMatch2 = resolveSectorAzimuth([0, 120, 240], 2);
  assert.deepEqual(azMatch2, { azimuth: 120, sectorNum: 2 });
  const azMatch3 = resolveSectorAzimuth([0, 120, 240], 3);
  assert.deepEqual(azMatch3, { azimuth: 240, sectorNum: 3 });
  const azMatch5 = resolveSectorAzimuth([0, 120, 240], 5);
  assert.deepEqual(azMatch5, { azimuth: 120, sectorNum: 5 });

  // 6. extractEnodeBId helper
  assert.equal(extractEnodeBId('56680'), 56680);
  assert.equal(extractEnodeBId('BT56680'), 56680);
  assert.equal(extractEnodeBId('WAW56680'), 56680);

  const sectors = getStationSectorsInfo('56680', [0, 120, 240]);
  assert.equal(sectors.length, 3);
  assert.equal(sectors[0].cid, 1);
  assert.equal(sectors[0].eci, 56680 * 256 + 1);
  assert.equal(sectors[1].cid, 2);
  assert.equal(sectors[1].eci, 56680 * 256 + 2);
  assert.equal(sectors[2].cid, 3);
  assert.equal(sectors[2].eci, 56680 * 256 + 3);
});

test('UKE permit matching for 5G SA C-Band (3500-3600 MHz) with operator band assignments', () => {
  // 1. Verify Polish Band Plan C-Band n78 allocation
  const n78Alloc = POLISH_BAND_PLAN.find(b => b.bandCode === 'n78');
  assert.ok(n78Alloc, 'n78 band allocation must exist in POLISH_BAND_PLAN');
  assert.equal(n78Alloc.tech, '5G');
  assert.equal(n78Alloc.freqMhz, 3500);
  assert.equal(n78Alloc.channelType, 'NR-ARFCN');
  assert.equal(n78Alloc.duplex, 'TDD');

  // Verify Polish C-Band auction block allocations (3.4 - 3.8 GHz)
  // Block A (3400-3500 MHz): Plus
  assert.ok(n78Alloc.operatorRanges['Plus']);
  assert.equal(n78Alloc.operatorRanges['Plus'].min, 626667);
  assert.equal(n78Alloc.operatorRanges['Plus'].max, 633333);
  assert.equal(n78Alloc.operatorRanges['Plus'].standard, 630000);

  // Block B (3500-3600 MHz): Play
  assert.ok(n78Alloc.operatorRanges['Play']);
  assert.equal(n78Alloc.operatorRanges['Play'].min, 633334);
  assert.equal(n78Alloc.operatorRanges['Play'].max, 639999);
  assert.equal(n78Alloc.operatorRanges['Play'].standard, 636667);

  // Block C (3600-3700 MHz): Orange
  assert.ok(n78Alloc.operatorRanges['Orange']);
  assert.equal(n78Alloc.operatorRanges['Orange'].min, 640000);
  assert.equal(n78Alloc.operatorRanges['Orange'].max, 646666);
  assert.equal(n78Alloc.operatorRanges['Orange'].standard, 643333);

  // Block D (3700-3800 MHz): T-Mobile
  assert.ok(n78Alloc.operatorRanges['T-Mobile']);
  assert.equal(n78Alloc.operatorRanges['T-Mobile'].min, 646667);
  assert.equal(n78Alloc.operatorRanges['T-Mobile'].max, 653333);
  assert.equal(n78Alloc.operatorRanges['T-Mobile'].standard, 650000);

  // 2. Band lookup helpers for 5G C-Band
  assert.equal(findBandAllocation('5G', '3500')?.bandCode, 'n78');
  assert.equal(findBandAllocation('5G', '3600')?.bandCode, 'n78');
  assert.equal(findBandAllocation('5G', 'n78')?.freqMhz, 3500);

  // Verify all 4 major operators have n78 C-band in their available bands
  for (const op of ['Orange', 'Play', 'T-Mobile', 'Plus']) {
    const available = getAvailableBandsForOperator(op, '5G');
    assert.ok(
      available.some(b => b.bandCode === 'n78'),
      `Operator ${op} must have n78 in available 5G bands`
    );
  }

  // 3. Database & SQL query tests for UKE permits matching 5G SA C-Band
  const db = openDatabase(':memory:');
  try {
    const insert = db.prepare(`
      INSERT INTO towers (id, stationId, address, province, lat, lng, operators, source, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')
    `);

    // Tower 1: Play with 5G 3500 MHz UKE permit (C-band ready for SA)
    insert.run(
      'play-cband',
      '56680',
      'Warszawa, Marszałkowska 10',
      'Mazowieckie',
      52.22,
      21.01,
      JSON.stringify([{
        name: 'Play',
        bands: [{ tech: '5G', band: '3500' }, { tech: 'LTE', band: '1800' }],
      }]),
      'UKE'
    );

    // Tower 2: Orange with 5G 3600 MHz UKE permit (C-band ready for SA)
    insert.run(
      'orange-cband',
      '24102',
      'Kraków, Floriańska 5',
      'Małopolskie',
      50.06,
      19.93,
      JSON.stringify([{
        name: 'Orange',
        bands: [{ tech: '5G', band: '3600' }, { tech: 'LTE', band: '2100' }],
      }]),
      'UKE'
    );

    // Tower 3: T-Mobile with 5G 3600 MHz UKE permit
    insert.run(
      'tmobile-cband',
      '38401',
      'Gdańsk, Długa 20',
      'Pomorskie',
      54.35,
      18.65,
      JSON.stringify([{
        name: 'T-Mobile',
        bands: [{ tech: '5G', band: '3600' }],
      }]),
      'UKE'
    );

    // Tower 4: Plus with 5G 2600 TDD permit
    insert.run(
      'plus-2600',
      '11200',
      'Wrocław, Rynek 1',
      'Dolnośląskie',
      51.10,
      17.03,
      JSON.stringify([{
        name: 'Plus',
        bands: [{ tech: '5G', band: '2600' }],
      }]),
      'UKE'
    );

    // Tower 5: Orange LTE only (no 5G)
    insert.run(
      'orange-lte-only',
      '99001',
      'Poznań, Stary Rynek 3',
      'Wielkopolskie',
      52.40,
      16.93,
      JSON.stringify([{
        name: 'Orange',
        bands: [{ tech: 'LTE', band: '1800' }],
      }]),
      'UKE'
    );

    // Query 1: Filter by modes5g: 'SA'
    // A UKE permit does not say whether a 5G cell runs SA or NSA. C-band and 2600 permits used to be counted
    // as SA by band; the mode filter now covers only BTMap cells with a recorded mode (tests/mode5g-filter.test.ts).
    assert.equal(getTowers(db, { modes5g: 'SA' }).total, 0, 'UKE permits are not treated as 5G SA');
    assert.equal(getTowers(db, { modes5g: 'NSA' }).total, 0, 'UKE permits are not treated as 5G NSA either');
    // The C-band permits are still found by band.
    assert.equal(getTowers(db, { techs: '5G', bands: '3500,3600' }).total, 3);

    // Query 2: Filter by operator Play and band 3500
    const play3500 = getTowers(db, { operators: 'Play', bands: '3500' });
    assert.equal(play3500.total, 1);
    assert.equal(play3500.items[0].id, 'play-cband');

    // Query 3: Filter by operator Orange and band 3600
    const orange3600 = getTowers(db, { operators: 'Orange', bands: '3600' });
    assert.equal(orange3600.total, 1);
    assert.equal(orange3600.items[0].id, 'orange-cband');

    // Query 4: Cell search query matching 5G SA station by gNB:CID
    const cellSearchQuery = getTowers(db, { q: 'gnb:cid 56680:35' });
    assert.ok(cellSearchQuery.total >= 1);
    assert.equal(cellSearchQuery.items[0].id, 'play-cband');

    // Query 5: Cell search query matching by NCI conversion
    const nciSearchQuery = getTowers(db, { q: 'NCI 14510115' });
    assert.ok(nciSearchQuery.total >= 1);
    assert.equal(nciSearchQuery.items[0].id, 'play-cband');

    // Query 6: Cell search query matching by plain colon format
    const plainSearchQuery = getTowers(db, { q: '56680:35' });
    assert.ok(plainSearchQuery.total >= 1);
    assert.equal(plainSearchQuery.items[0].id, 'play-cband');
  } finally {
    db.close();
  }
});

test('5G SA queries copied from NetMonster', () => {
  // Play 5G SA n78 cell: CI 14510115, gNB:CID 56680:35, TAC 1420, PCI 123, ARFCN 639072.
  for (const q of ['14510115 5G', '5G 14510115', 'NR 14510115', '14510115 5G SA', '14510115 n78', 'ARFCN 639072 CI 14510115']) {
    const parsed = parseCellSearch(q);
    assert.ok(parsed, `Failed to parse: ${q}`);
    assert.equal(parsed.type, 'NR', q);
    assert.equal(parsed.nodeId, 56680, q);
    assert.equal(parsed.cellId, 35, q);
    assert.equal(parsed.nci, 14510115, q);
    assert.equal(parsed.eci, undefined, q);
  }

  const pasted = parseCellSearch('CI\t14510115\ngNB:CID\t56680:35\nTAC\t1420\nPCI\t123\nARFCN\t639072');
  assert.ok(pasted);
  assert.equal(pasted.type, 'NR');
  assert.equal(pasted.nodeId, 56680);
  assert.equal(pasted.cellId, 35);
  assert.equal(pasted.tac, 1420);
  assert.equal(pasted.pci, 123);
  assert.equal(pasted.arfcn, 639072);

  // gNB only, tagged as 5G SA
  for (const q of ['5G SA 56680', '56680 sa', '56680 5G']) {
    const parsed = parseCellSearch(q);
    assert.ok(parsed, q);
    assert.equal(parsed.type, 'NR', q);
    assert.equal(parsed.nodeId, 56680, q);
  }

  // gNB and cell separated by a space
  const spaced = parseCellSearch('56680 35 5G');
  assert.ok(spaced);
  assert.equal(spaced.type, 'NR');
  assert.equal(spaced.nodeId, 56680);
  assert.equal(spaced.cellId, 35);

  // PLMN prefix picks the operator
  const withPlmn = parseCellSearch('260 06 56680:35 5G');
  assert.ok(withPlmn);
  assert.equal(withPlmn.mnc, '06');
  assert.equal(withPlmn.operator, 'Play');
  assert.equal(withPlmn.nodeId, 56680);
  assert.equal(withPlmn.nci, 14510115);
  assert.ok(withPlmn.displaySummary.startsWith('Play · gNodeB 56680'));
  assert.equal(parseCellSearch('26006 14510115')?.operator, 'Play');
  // ...but a bare five-digit number or "26006:35" is still a station / node ID
  assert.equal(parseCellSearch('26006')?.nodeId, 26006);
  assert.equal(parseCellSearch('26006:35')?.nodeId, 26006);

  // A bare CI is the same number for LTE and 5G: both identities are kept and the tech is flagged as ambiguous.
  const bare = parseCellSearch('CI 14510115');
  assert.ok(bare);
  assert.equal(bare.ambiguousTech, true);
  assert.equal(bare.eci, 14510115);
  assert.equal(bare.nci, 14510115);
  assert.equal(parseCellSearch('ECI 14510115')?.ambiguousTech, undefined);
  assert.equal(parseCellSearch('LTE 14510115')?.ambiguousTech, undefined);

  // Identities above the 28-bit ECI range can only be NR.
  const big = parseCellSearch('58055131139');
  assert.ok(big);
  assert.equal(big.type, 'NR');
  assert.equal(big.nci, 58055131139);

  // Band numbers inside an identifier no longer flip it to 5G (used to match the substring "3500").
  assert.equal(parseCellSearch('14535001')?.type, 'LTE');
  // LTE EARFCN keeps a cell LTE.
  assert.equal(parseCellSearch('EARFCN 1850 CI 14510115')?.type, 'LTE');
  // Addresses are not cell IDs.
  assert.equal(parseCellSearch('Marszałkowska 3500'), null);
});

test('5G cell search ranks 5G stations and the PLMN operator first', () => {
  const db = openDatabase(':memory:');
  try {
    const insert = db.prepare(`
      INSERT INTO towers (id, stationId, address, province, lat, lng, operators, source, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')
    `);
    insert.run('a-orange-lte', '56680', 'Aaa, Orange 1', 'Mazowieckie', 52.1, 21.0,
      JSON.stringify([{ name: 'Orange', bands: [{ tech: 'LTE', band: '1800' }] }]), 'UKE');
    insert.run('b-play-5g', '56680', 'Bbb, Play 1', 'Mazowieckie', 52.2, 21.0,
      JSON.stringify([{ name: 'Play', bands: [{ tech: '5G', band: '3500' }] }]), 'UKE');
    insert.run('c-tmobile-5g', '56680', 'Ccc, T-Mobile 1', 'Mazowieckie', 52.3, 21.0,
      JSON.stringify([{ name: 'T-Mobile', bands: [{ tech: '5G', band: '3600' }] }]), 'UKE');

    // Without hints the address order applies.
    assert.equal(getTowers(db, { q: '56680:35' }).items[0].id, 'a-orange-lte');
    // A 5G query puts 5G stations ahead of LTE-only ones.
    const nr = getTowers(db, { q: '14510115 5G' }).items.map(t => t.id);
    assert.deepEqual(nr, ['b-play-5g', 'c-tmobile-5g', 'a-orange-lte']);
    // The "260 06" prefix puts Play first.
    const tmobileFirst = getTowers(db, { q: '260 02 56680:35 5G' }).items.map(t => t.id);
    assert.equal(tmobileFirst[0], 'c-tmobile-5g');
    assert.equal(getTowers(db, { q: '260 06 14510115' }).items[0].id, 'b-play-5g');
  } finally {
    db.close();
  }
});
