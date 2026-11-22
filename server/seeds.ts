import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { operatorColor } from '../shared/operators.ts';

interface SeedCell { tech: string; band: string; pci: number | null; earfcn: number | null; nodeId: number | null; cellId: number | null; tac: number | null; lac: number | null }
interface SeedTower { id: string; country: string; operator: string; address: string; lat: number; lng: number; cells: SeedCell[] }
interface Seed { credit: string; createdAt: string; towers: SeedTower[] }

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), 'seeds');

/**
 * Community station sets shipped with the app (server/seeds/*.json, built by scripts/build-ntm-seed.ts),
 * for countries without a public registry. Each file is applied once per content version; a newer file
 * replaces the stations of the previous one. Node links already confirmed by users are kept.
 */
export function applySeeds(db: DatabaseSync, dir = SEED_DIR) {
  let files: string[] = [];
  try { files = readdirSync(dir).filter(f => f.endsWith('.json')).sort(); } catch { return; }
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const version = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const key = `seed:${file}`;
    const applied = db.prepare('SELECT value FROM metadata WHERE key=?').get(key) as { value?: string } | undefined;
    if (applied?.value === version) continue;
    const seed = JSON.parse(text) as Seed;
    const ids = seed.towers.map(t => t.id);
    db.exec('BEGIN');
    try {
      // Stations users have edited since are theirs now: a newer seed never overwrites them.
      const edited = new Set((db.prepare('SELECT DISTINCT towerId FROM tower_history').all() as Array<{ towerId: string }>).map(r => r.towerId));
      db.prepare('DELETE FROM towers WHERE addedBy=? AND source=? AND id NOT IN (SELECT towerId FROM tower_history)').run(seed.credit, 'BTMAP');
      db.prepare('DELETE FROM node_links WHERE addedBy=?').run(seed.credit);
      const insertTower = db.prepare(`INSERT OR REPLACE INTO towers
        (id, stationId, address, province, lat, lng, operators, source, addedBy, status, createdAt, country)
        VALUES (?, NULL, ?, '', ?, ?, ?, 'BTMAP', ?, 'APPROVED', ?, ?)`);
      const insertLink = db.prepare(`INSERT OR IGNORE INTO node_links (operator, tech, nodeId, stationId, towerId, addedBy, createdAt)
        VALUES (?, ?, ?, NULL, ?, ?, ?)`);
      for (const t of seed.towers) {
        if (edited.has(t.id)) continue;
        const operators = [{
          name: t.operator,
          color: operatorColor(t.operator),
          stationIds: [],
          bands: t.cells.map(c => ({ ...c, cellType: 'macro' })),
        }];
        insertTower.run(t.id, t.address, t.lat, t.lng, JSON.stringify(operators), seed.credit, seed.createdAt, t.country);
        for (const nodeId of new Set(t.cells.filter(c => (c.tech === 'LTE' || c.tech === '5G') && c.nodeId).map(c => `${c.tech}|${c.nodeId}`))) {
          const [tech, node] = nodeId.split('|');
          insertLink.run(t.operator, tech, Number(node), t.id, seed.credit, seed.createdAt);
        }
      }
      db.prepare('INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)').run(key, version);
      db.exec('COMMIT');
      console.log(`[seeds] ${file}: ${ids.length} stacji (${seed.credit})`);
    } catch (e) {
      db.exec('ROLLBACK');
      console.warn(`[seeds] Nie wczytano ${file}:`, (e as Error).message);
    }
  }
}
