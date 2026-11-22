/**
 * Turns a NetMonster `.ntm` export into a BTMap seed file (community stations of one country).
 *
 *   node --experimental-strip-types scripts/build-ntm-seed.ts <file.ntm> <out.json> [credit]
 *
 * Rows without coordinates are skipped: a station needs a place on the map. Cells of one
 * operator at one place become one station; eNB/gNB numbers become node links, so the station
 * is found by cell search and by the BTMap app.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { countryByMcc, operatorByMnc } from '../shared/countries.ts';
import { bandOfChannel } from '../shared/radioBands.ts';

const [input, output, credit = 'NetMonster import'] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: build-ntm-seed.ts <file.ntm> <out.json> [credit]');
  process.exit(1);
}

const UNKNOWN = 2147483647;
const num = (s: string | undefined) => {
  const v = Number(String(s ?? '').trim());
  return String(s ?? '').trim() !== '' && Number.isFinite(v) && v >= 0 && v !== UNKNOWN ? v : null;
};
const TECH: Record<string, string> = { '2G': 'GSM', GSM: 'GSM', '3G': 'UMTS', UMTS: 'UMTS', '4G': 'LTE', LTE: 'LTE', '5G': '5G', NR: '5G' };

interface SeedCell { tech: string; band: string; pci: number | null; earfcn: number | null; nodeId: number | null; cellId: number | null; tac: number | null; lac: number | null }
interface SeedTower { id: string; country: string; operator: string; address: string; lat: number; lng: number; cells: SeedCell[] }

const lines = readFileSync(input, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);

// NetMonster files the same cell under every network that broadcast it (RAN sharing, national
// roaming), so one eNB + TAC shows up under several MNCs. Its real network is the one it was seen
// with most often.
const nodeVotes = new Map<string, Map<number, number>>();
const nodeKey = (f: string[]) => `${TECH[f[0]?.trim().toUpperCase()]}|${num(f[5]) ?? ''}|${num(f[4]) ?? ''}`;
for (const raw of lines) {
  const f = raw.split(';');
  const mnc = num(f[2]);
  if (mnc == null || !num(f[5])) continue;
  const votes = nodeVotes.get(nodeKey(f)) ?? new Map<number, number>();
  votes.set(mnc, (votes.get(mnc) ?? 0) + 1);
  nodeVotes.set(nodeKey(f), votes);
}
const ownerMnc = (f: string[], mnc: number) => {
  const votes = nodeVotes.get(nodeKey(f));
  if (!votes) return mnc;
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] === mnc ? -1 : b[0] === mnc ? 1 : 0))[0][0];
};

const towers = new Map<string, SeedTower>();
let skipped = 0;
for (const raw of lines) {
  if (!raw.trim()) continue;
  const f = raw.split(';');
  const tech = TECH[f[0]?.trim().toUpperCase()];
  const mcc = num(f[1]), mnc = num(f[2]);
  const lat = Number(f[7]), lng = Number(f[8]);
  const country = mcc == null ? null : countryByMcc(mcc);
  if (!tech || mnc == null || !country || !f[7]?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) { skipped++; continue; }
  const channel = num(f.length > 10 ? f[f.length - 1] : undefined);
  const description = f.slice(9, f.length > 10 ? f.length - 1 : f.length).join(';').trim();
  let cid = num(f[3]);
  let node = num(f[5]);
  if (node === 0) node = null;
  // Some exporters put the full ECI/NCI in CID.
  if (tech === 'LTE' && node == null && cid != null && cid > 255) { node = Math.floor(cid / 256); cid = cid % 256; }
  if (tech === '5G' && cid != null && cid > 16383) { node ??= Math.floor(cid / 4096); cid = cid % 4096; }
  if (tech === 'LTE' && cid != null && cid > 255) cid = cid % 256;
  const operator = operatorByMnc(country, ownerMnc(f, mnc));
  const band = bandOfChannel(tech, channel);
  const address = description && description !== '-' ? description : `${operator} ${node ?? ''}`.trim();
  const key = `${operator}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  let tower = towers.get(key);
  if (!tower) {
    const id = 'BTMAP_' + country.code + '_' + createHash('sha256').update(key).digest('hex').slice(0, 14);
    tower = { id, country: country.code, operator, address, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), cells: [] };
    towers.set(key, tower);
  }
  // A described row names the place better than a "-" row of the same site.
  if (tower.address.startsWith(operator) && address !== tower.address && !address.startsWith(operator)) tower.address = address;
  const pci = num(f[6]);
  const area = num(f[4]);
  const cell: SeedCell = {
    tech, band: band?.label ?? '', pci, earfcn: channel, nodeId: node, cellId: cid,
    tac: tech === 'LTE' || tech === '5G' ? area : null, lac: tech === 'GSM' || tech === 'UMTS' ? area : null,
  };
  const duplicate = tower.cells.some(c => c.tech === cell.tech && c.nodeId === cell.nodeId && c.cellId === cell.cellId && c.earfcn === cell.earfcn);
  if (!duplicate) tower.cells.push(cell);
}

const list = [...towers.values()].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(output, JSON.stringify({ credit, createdAt: new Date().toISOString().slice(0, 10), towers: list }) + '\n');
console.log(`${list.length} stations, ${list.reduce((n, t) => n + t.cells.length, 0)} cells, ${skipped} rows skipped -> ${output}`);
