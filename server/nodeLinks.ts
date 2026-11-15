import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { normalizeTower, towerWhere, getNewEntryWindow } from './query.ts';
export { linkedTowerSql } from './query.ts';

/**
 * eNB/gNB numbers linked to stations by the community.
 *
 * UKE publishes neither eNB nor gNB numbers, and Play's station IDs (e.g. GDA1010) cannot be derived from them,
 * so a cell seen in NetMonster ("gNB:CID 56680:35") can only be found once someone has linked its gNB to the
 * station. Links are submitted from the station card and go through moderation like other submissions.
 */

export const NODE_LINK_OPERATORS = ['Orange', 'T-Mobile', 'Play', 'Plus'] as const;
export const NODE_LINK_TECHS = ['5G', 'LTE'] as const;
/** gNB IDs are at most 32 bits; eNB IDs 20 bits. */
const MAX_NODE_ID: Record<string, number> = { '5G': 4294967295, LTE: 1048575 };

export interface NodeLink {
  operator: string;
  tech: '5G' | 'LTE';
  nodeId: number;
  stationId: string | null;
  towerId: string;
  addedBy?: string | null;
  createdAt?: string;
}

export interface NodeLinkRequest {
  towerId: string;
  operator: string;
  tech: '5G' | 'LTE';
  nodeId: number;
}

/** Validates a link request; returns an error message in Polish, or the clean request. */
export function cleanNodeLinkRequest(data: Record<string, unknown>): NodeLinkRequest | { error: string } {
  const towerId = String(data.towerId ?? '').trim().slice(0, 200);
  const operator = String(data.operator ?? '').trim();
  const tech = String(data.tech ?? '').trim().toUpperCase() === 'NR' ? '5G' : String(data.tech ?? '').trim().toUpperCase();
  const nodeId = Number(data.nodeId);
  if (!towerId) return { error: 'Wybierz stację.' };
  if (!(NODE_LINK_OPERATORS as readonly string[]).includes(operator)) return { error: 'Wybierz operatora stacji.' };
  if (tech !== '5G' && tech !== 'LTE') return { error: 'Wybierz technologię: 5G (gNB) albo LTE (eNB).' };
  if (!Number.isInteger(nodeId) || nodeId < 1 || nodeId > MAX_NODE_ID[tech]) {
    return { error: tech === '5G' ? 'Podaj numer gNB (liczba całkowita).' : 'Podaj numer eNB (liczba całkowita, maks. 1048575).' };
  }
  return { towerId, operator, tech, nodeId };
}

function parseOperators(raw: unknown): Array<{ name?: string; stationIds?: string[] }> {
  try {
    const value = JSON.parse(String(raw || '[]'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** Resolves the station a request points at; the station must carry that operator. */
export function resolveNodeLink(db: DatabaseSync, request: NodeLinkRequest): NodeLink | { error: string } {
  const tower = db.prepare("SELECT id, stationId, operators FROM towers WHERE id = ? AND status = 'APPROVED'").get(request.towerId) as
    | { id: string; stationId: string | null; operators: string }
    | undefined;
  if (!tower) return { error: 'Nie znaleziono stacji w bazie.' };
  const op = parseOperators(tower.operators).find(o => o?.name === request.operator);
  if (!op) return { error: `Na tej stacji nie ma operatora ${request.operator}.` };
  const stationId = (Array.isArray(op.stationIds) && op.stationIds.find(Boolean)) || tower.stationId || null;
  return { ...request, stationId: stationId ? String(stationId) : null, towerId: tower.id };
}

/** Stores a link. A gNB/eNB number belongs to one station, so a newer link replaces an older one. */
export function saveNodeLink(db: DatabaseSync, link: NodeLink, addedBy: string) {
  db.prepare(`INSERT INTO node_links (operator, tech, nodeId, stationId, towerId, addedBy, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(operator, tech, nodeId) DO UPDATE SET
      stationId = excluded.stationId, towerId = excluded.towerId, addedBy = excluded.addedBy, createdAt = excluded.createdAt`)
    .run(link.operator, link.tech, link.nodeId, link.stationId, link.towerId, addedBy, new Date().toISOString());
}

/** Links of the given towers, keyed by tower ID. */
export function nodeLinksForTowers(db: DatabaseSync, towers: Array<Record<string, unknown>>) {
  const result = new Map<string, NodeLink[]>();
  if (!towers.length) return result;
  const ids = towers.map(t => String(t.id));
  const byStation = new Map<string, string[]>();
  for (const tower of towers) {
    const ops = Array.isArray(tower.operators) ? tower.operators as Array<{ name?: string; stationIds?: string[] }> : parseOperators(tower.operators);
    for (const op of ops) {
      for (const sid of Array.isArray(op?.stationIds) ? op.stationIds : []) {
        const key = `${op.name}|${sid}`;
        byStation.set(key, [...(byStation.get(key) ?? []), String(tower.id)]);
      }
    }
  }
  const stationIds = [...new Set([...byStation.keys()].map(k => k.slice(k.indexOf('|') + 1)))];
  const params: SQLInputValue[] = [...ids, ...stationIds];
  const rows = db.prepare(`SELECT * FROM node_links WHERE towerId IN (${ids.map(() => '?').join(',')})
    ${stationIds.length ? `OR stationId IN (${stationIds.map(() => '?').join(',')})` : ''}
    ORDER BY tech, nodeId`).all(...params) as unknown as NodeLink[];
  for (const row of rows) {
    const targets = new Set<string>();
    if (ids.includes(row.towerId)) targets.add(row.towerId);
    for (const id of byStation.get(`${row.operator}|${row.stationId}`) ?? []) targets.add(id);
    for (const id of targets) {
      const list = result.get(id) ?? [];
      if (!list.some(l => l.operator === row.operator && l.tech === row.tech && l.nodeId === row.nodeId)) list.push(row);
      result.set(id, list);
    }
  }
  return result;
}

export function withNodeLinks<T extends Record<string, unknown>>(db: DatabaseSync, towers: T[]): Array<T & { nodeLinks?: Array<{ operator: string; tech: string; nodeId: number }> }> {
  const links = nodeLinksForTowers(db, towers);
  return towers.map(t => {
    const list = links.get(String(t.id));
    return list?.length ? { ...t, nodeLinks: list.map(({ operator, tech, nodeId }) => ({ operator, tech, nodeId })) } : t;
  });
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Stations near a point that could carry an unlinked cell: same operator, same technology and band (from the
 * ARFCN), nearest first. Stations already linked to another node of the same technology go last, since a
 * site normally has one gNB/eNB per operator.
 */
export function getNearestTowers(db: DatabaseSync, query: Record<string, unknown>) {
  const lat = Number(query.lat), lng = Number(query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Nieprawidłowe położenie.');
  }
  const radiusKm = Math.min(50, Math.max(1, Number(query.radiusKm) || 25));
  const limit = Math.min(10, Math.max(1, Number(query.limit) || 5));
  const nodeId = Number(query.nodeId);
  const tech = String(query.techs ?? '') === 'LTE' ? 'LTE' : '5G';
  const dLat = radiusKm / 111, dLng = radiusKm / (111 * Math.max(0.2, Math.cos(toRad(lat))));
  const window = getNewEntryWindow(db);
  const { sql, params } = towerWhere({
    operators: query.operators,
    techs: query.techs,
    bands: query.bands,
    minLat: String(lat - dLat), maxLat: String(lat + dLat), minLng: String(lng - dLng), maxLng: String(lng + dLng),
  }, window);
  const cos = Math.cos(toRad(lat));
  const rows = db.prepare(`SELECT t.* FROM towers t WHERE ${sql}
    ORDER BY ((t.lat - ?) * (t.lat - ?) + (t.lng - ?) * (t.lng - ?) * ?) LIMIT 60`)
    .all(...params, lat, lat, lng, lng, cos * cos);
  const towers = rows.map(row => normalizeTower(row, window));
  const linked = withNodeLinks(db, towers);
  const operator = typeof query.operators === 'string' && !query.operators.includes(',') ? query.operators : undefined;
  return linked
    .map(t => {
      const own = (t.nodeLinks ?? []).filter(l => l.tech === tech && (!operator || l.operator === operator));
      return Object.assign(t, {
        distanceKm: Math.round(distanceKm(lat, lng, Number(t.lat), Number(t.lng)) * 100) / 100,
        linkedElsewhere: own.length > 0 && !own.some(l => l.nodeId === nodeId),
      });
    })
    .filter(t => t.distanceKm <= radiusKm)
    .sort((a, b) => Number(a.linkedElsewhere) - Number(b.linkedElsewhere) || a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
