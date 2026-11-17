import type { DatabaseSync } from 'node:sqlite';
import { deflateSync } from 'node:zlib';

/**
 * Crowdsourced coverage: the mobile app sends anonymous measurements (position, network, band,
 * RSRP), stored only as counts in a ~100 m grid — never individual points or devices. Coverage is
 * served as PNG map tiles shaped like the operators' own coverage maps (soft blobs in the
 * operator's colour), used by both btmap.pl and the app.
 */

/** Grid step in degrees: ~111 m north–south, ~108 m east–west at 52°N. */
export const GRID_LAT = 0.001;
export const GRID_LNG = 0.0016;

/** Polish networks by MNC; shared-network codes count for the operators that broadcast them. */
const OPERATORS_BY_MNC: Record<string, string> = { '01': 'Plus', '02': 'T-Mobile', '03': 'Orange', '06': 'Play' };
export const COVERAGE_OPERATORS = ['Plus', 'T-Mobile', 'Orange', 'Play'] as const;
const OPERATOR_COLORS: Record<string, [number, number, number]> = {
  Plus: [19, 160, 76],
  'T-Mobile': [226, 0, 116],
  Orange: [255, 121, 0],
  Play: [140, 110, 200],
};
const TECHS = new Set(['LTE', '5G', 'UMTS', 'GSM']);
const BANDS = new Set(['700', '800', '900', '1500', '1800', '2100', '2300', '2600', '3500', '3600', '3700']);

export function ensureCoverageSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS coverage (
    operator TEXT NOT NULL, tech TEXT NOT NULL, band TEXT NOT NULL,
    gy INTEGER NOT NULL, gx INTEGER NOT NULL,
    samples INTEGER NOT NULL, rsrp_sum INTEGER NOT NULL, rsrp_best INTEGER NOT NULL, updated TEXT NOT NULL,
    PRIMARY KEY (operator, tech, band, gy, gx)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS coverage_grid ON coverage(operator, gy, gx);
  CREATE TABLE IF NOT EXISTS coverage_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
}

export interface CoverageSample { lat: number; lng: number; mcc: string; mnc: string; tech: string; band: string; rsrp: number }

/** Validates and stores up to 500 measurements; returns how many were accepted. */
export function addCoverage(db: DatabaseSync, body: unknown): number {
  const list = (body as { samples?: unknown })?.samples;
  if (!Array.isArray(list)) throw new Error('Brak pomiarów.');
  if (list.length > 500) throw new Error('Za dużo pomiarów w jednym zapytaniu (maks. 500).');
  const upsert = db.prepare(`INSERT INTO coverage(operator,tech,band,gy,gx,samples,rsrp_sum,rsrp_best,updated)
    VALUES(?,?,?,?,?,1,?,?,?)
    ON CONFLICT(operator,tech,band,gy,gx) DO UPDATE SET
      samples = samples + 1, rsrp_sum = rsrp_sum + excluded.rsrp_sum,
      rsrp_best = MAX(rsrp_best, excluded.rsrp_best), updated = excluded.updated`);
  const now = new Date().toISOString();
  let accepted = 0;
  db.exec('BEGIN');
  try {
    for (const raw of list) {
      const s = raw as Partial<CoverageSample>;
      const lat = Number(s.lat), lng = Number(s.lng), rsrp = Math.round(Number(s.rsrp));
      // Poland and its border area only; RSRP / RSCP / RSSI in a physically possible range.
      if (!(lat >= 48.5 && lat <= 55.2 && lng >= 13.8 && lng <= 24.5)) continue;
      if (!(rsrp >= -150 && rsrp <= -30)) continue;
      if (String(s.mcc) !== '260') continue;
      const operator = OPERATORS_BY_MNC[String(s.mnc).padStart(2, '0')];
      const tech = String(s.tech).toUpperCase() === 'NR' ? '5G' : String(s.tech).toUpperCase();
      const band = String(s.band);
      if (!operator || !TECHS.has(tech) || !BANDS.has(band)) continue;
      upsert.run(operator, tech, band, Math.floor(lat / GRID_LAT), Math.floor(lng / GRID_LNG), rsrp, rsrp, now);
      accepted++;
    }
    db.prepare("INSERT INTO coverage_meta(key,value) VALUES('version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(Date.now()));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return accepted;
}

/** Changes whenever measurements are added; used to invalidate cached tiles. */
export function coverageVersion(db: DatabaseSync): string {
  return (db.prepare("SELECT value FROM coverage_meta WHERE key='version'").get() as { value?: string } | undefined)?.value ?? '0';
}

/** Operators, technologies and bands that have data, for the filters. */
export function coverageMeta(db: DatabaseSync) {
  const rows = db.prepare('SELECT operator, tech, band, COUNT(*) AS cells FROM coverage GROUP BY operator, tech, band ORDER BY operator, tech, CAST(band AS INTEGER)').all() as Array<{ operator: string; tech: string; band: string; cells: number }>;
  const version = coverageVersion(db);
  return { version, operators: COVERAGE_OPERATORS, layers: rows };
}

// ---- Tiles ---------------------------------------------------------------------------------

const TILE = 256;

function lngToX(lng: number, z: number) { return ((lng + 180) / 360) * TILE * 2 ** z; }
function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** z;
}
function xToLng(x: number, z: number) { return (x / (TILE * 2 ** z)) * 360 - 180; }
function yToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Buffer) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgba: Uint8ClampedArray, w: number, h: number) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const EMPTY_TILE = png(new Uint8ClampedArray(TILE * TILE * 4), TILE, TILE);

export interface CoverageFilter { operator: string; tech?: string; band?: string }

/**
 * One 256 px coverage tile. Each covered grid cell becomes a disc slightly larger than the cell,
 * so neighbouring cells merge into soft blobs; the result is one flat colour per operator, like the
 * operators' own maps. Measurement counts are kept server-side only.
 */
export function coverageTile(db: DatabaseSync, z: number, x: number, y: number, f: CoverageFilter): Buffer {
  if (!COVERAGE_OPERATORS.includes(f.operator as never)) throw new Error('Nieznany operator.');
  if (z < 5 || z > 18) return EMPTY_TILE;
  const north = yToLat(y * TILE, z), south = yToLat((y + 1) * TILE, z);
  const west = xToLng(x * TILE, z), east = xToLng((x + 1) * TILE, z);
  // Margin so blobs crossing the tile edge are drawn on both tiles.
  const mLat = GRID_LAT * 2, mLng = GRID_LNG * 2;
  const params: Array<string | number> = [f.operator,
    Math.floor((south - mLat) / GRID_LAT), Math.floor((north + mLat) / GRID_LAT),
    Math.floor((west - mLng) / GRID_LNG), Math.floor((east + mLng) / GRID_LNG)];
  let extra = '';
  if (f.tech) { extra += ' AND tech = ?'; params.push(f.tech === 'NR' ? '5G' : f.tech); }
  if (f.band) { extra += ' AND band = ?'; params.push(f.band); }
  const cells = db.prepare(`SELECT DISTINCT gy, gx FROM coverage WHERE operator = ? AND gy BETWEEN ? AND ? AND gx BETWEEN ? AND ?${extra}`).all(...params) as Array<{ gy: number; gx: number }>;
  if (!cells.length) return EMPTY_TILE;

  const mask = new Float32Array(TILE * TILE);
  const ox = x * TILE, oy = y * TILE;
  for (const c of cells) {
    const lat0 = c.gy * GRID_LAT, lng0 = c.gx * GRID_LNG;
    const px0 = lngToX(lng0, z) - ox, px1 = lngToX(lng0 + GRID_LNG, z) - ox;
    const py0 = latToY(lat0 + GRID_LAT, z) - oy, py1 = latToY(lat0, z) - oy;
    const cx = (px0 + px1) / 2, cy = (py0 + py1) / 2;
    // Disc radius: a bit more than half the cell diagonal, at least ~1.5 px when zoomed out.
    const r = Math.max(1.5, Math.hypot(px1 - px0, py1 - py0) * 0.75);
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(TILE - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(TILE - 1, Math.ceil(cy + r));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      const a = Math.min(1, Math.max(0, r - d + 0.5)); // anti-aliased edge
      const i = py * TILE + px;
      if (a > mask[i]) mask[i] = a;
    }
  }
  // Soften into blobs: blur the mask and re-threshold it, so nearby cells merge and edges curve,
  // like the operators' coverage maps. Blur radius follows the cell size in pixels.
  const cellPx = Math.max(1, lngToX(GRID_LNG, z) - lngToX(0, z));
  const blurR = Math.max(2, Math.min(10, Math.round(cellPx * 0.8)));
  boxBlur(mask, blurR); boxBlur(mask, blurR);
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    // Smooth step around 0.18–0.32: blob edge, anti-aliased.
    mask[i] = v <= 0.18 ? 0 : v >= 0.32 ? 1 : (v - 0.18) / 0.14;
  }
  const [cr, cg, cb] = OPERATOR_COLORS[f.operator];
  const out = new Uint8ClampedArray(TILE * TILE * 4);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    out[i * 4] = cr; out[i * 4 + 1] = cg; out[i * 4 + 2] = cb; out[i * 4 + 3] = Math.round(mask[i] * 150);
  }
  return png(out, TILE, TILE);
}

/** Separable box blur in place (horizontal then vertical). */
function boxBlur(m: Float32Array, r: number) {
  const tmp = new Float32Array(m.length);
  const w = r * 2 + 1;
  for (let y = 0; y < TILE; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += m[y * TILE + Math.min(TILE - 1, Math.max(0, x))];
    for (let x = 0; x < TILE; x++) {
      tmp[y * TILE + x] = acc / w;
      acc += m[y * TILE + Math.min(TILE - 1, x + r + 1)] - m[y * TILE + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < TILE; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(TILE - 1, Math.max(0, y)) * TILE + x];
    for (let y = 0; y < TILE; y++) {
      m[y * TILE + x] = acc / w;
      acc += tmp[Math.min(TILE - 1, y + r + 1) * TILE + x] - tmp[Math.max(0, y - r) * TILE + x];
    }
  }
}

/** Small in-memory tile cache, cleared whenever new measurements arrive. */
export function createTileCache(max = 2000) {
  const cache = new Map<string, Buffer>();
  let version = '';
  return {
    get(key: string, currentVersion: string, make: () => Buffer) {
      if (currentVersion !== version) { cache.clear(); version = currentVersion; }
      const hit = cache.get(key);
      if (hit) return hit;
      const tile = make();
      if (cache.size >= max) cache.delete(cache.keys().next().value as string);
      cache.set(key, tile);
      return tile;
    },
  };
}
