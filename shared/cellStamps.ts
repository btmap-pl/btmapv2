/**
 * When a community station is saved, each cell keeps the date it was added and, when a field
 * changed, the date of that change. The station card highlights recent ones (green / yellow).
 */
export interface StampableCell {
  tech?: unknown; band?: unknown; nodeId?: unknown; cellId?: unknown; pci?: unknown; earfcn?: unknown;
  addedAt?: string; modifiedAt?: string; [key: string]: unknown;
}

const COMPARED = ['band', 'pci', 'earfcn', 'azimuth', 'mode', 'tac', 'lac', 'rnc', 'bsic', 'bandwidth', 'cellType', 'isIot'];

const tech = (c: StampableCell) => (String(c.tech ?? '').toUpperCase() === 'NR' ? '5G' : String(c.tech ?? '').toUpperCase());
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const mhz = (band: unknown) => String(band ?? '').match(/\d{3,5}/)?.[0] ?? '';

/** A cell is the same cell when its identity matches: node + cell id, otherwise channel + PCI. */
function identity(c: StampableCell) {
  if (text(c.nodeId) && text(c.cellId)) return `${tech(c)}|n${text(c.nodeId)}|c${text(c.cellId)}`;
  return `${tech(c)}|ch${text(c.earfcn)}|p${text(c.pci)}|${mhz(c.band)}`;
}

/**
 * @param previous cells of the station before this save; null for a station that did not exist.
 *   Cells from the UKE registry (no field identity) count as already known when the same technology
 *   and band were there, so converting a registry station does not mark everything as new.
 */
export type Stamped<T> = T & { addedAt?: string; modifiedAt?: string };

export function stampCells<T extends StampableCell>(next: T[], previous: StampableCell[] | null, now: string): Array<Stamped<T>> {
  const old = new Map((previous ?? []).map(c => [identity(c), c]));
  const registryBands = new Set((previous ?? []).filter(c => !text(c.nodeId) && !text(c.pci)).map(c => `${tech(c)}|${mhz(c.band)}`));
  return next.map(cell => {
    const before = old.get(identity(cell));
    const { addedAt: _a, modifiedAt: _m, ...rest } = cell;
    if (!before) {
      if (previous && registryBands.has(`${tech(cell)}|${mhz(cell.band)}`)) return rest as Stamped<T>;
      return { ...rest, addedAt: now } as Stamped<T>;
    }
    const changed = COMPARED.some(key => text(before[key]) !== text(cell[key]));
    return {
      ...rest,
      ...(before.addedAt ? { addedAt: before.addedAt } : {}),
      ...(changed ? { modifiedAt: now } : before.modifiedAt ? { modifiedAt: before.modifiedAt } : {}),
    } as Stamped<T>;
  });
}
