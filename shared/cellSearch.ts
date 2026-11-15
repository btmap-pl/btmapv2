/**
 * Precision Cellular Network Identifier Parser & Calculator for BTMap v2
 * Supports NetMonster, Netmode, Samsung ServiceMode (*#0011#), FieldTest, CellMapper
 */

export interface ParsedCellId {
  isCellIdQuery: boolean;
  type: 'LTE' | 'NR' | 'UMTS' | 'GSM' | 'GENERIC';
  nodeId?: number;              // eNodeB or gNodeB
  nodeIdStr?: string;           // string representation e.g. "24102"
  sectorNum?: number;           // physical antenna sector: 1, 2, 3...
  cellId?: number;              // local cell ID (LCID) 0..255
  eci?: number;                 // E-UTRAN Cell Identifier (eNB * 256 + cellId)
  nci?: number;                 // 5G NR Cell Identity
  pci?: number;                 // Physical Cell ID (0..503 in LTE, 0..1007 in NR)
  tac?: number;                 // Tracking Area Code
  rnc?: number;                 // 3G Radio Network Controller
  arfcn?: number;               // (E/NR-)ARFCN when given, e.g. "ARFCN 639072"
  arfcnMhz?: number;            // downlink frequency of that ARFCN, e.g. 3585.08
  bands?: string[];             // UKE band labels the ARFCN falls into, e.g. ["3500", "3600"]
  mnc?: string;                 // Polish MNC from a "260 06" / "26006" prefix
  operator?: string;            // operator derived from the MNC, e.g. "Play"
  /**
   * A bare cell identity ("14510115", "CI 14510115") is the same number for an LTE cell and for a 5G cell
   * with an 8-bit cell part, and NetMonster labels both "CI". Without a tech hint the cell is reported as LTE
   * with both ECI and NCI filled in, and this flag is set so the UI can say "4G / 5G".
   */
  ambiguousTech?: boolean;
  displaySummary: string;       // Polish user-friendly summary e.g. "eNodeB 24102 · Sektor 1 (CID 1)"
  stationIdCandidate?: string;  // e.g. "24102"
}

/** Polish MNCs (MCC 260) of the operators BTMap tracks. */
const POLISH_MNC_OPERATORS: Record<string, string> = {
  '01': 'Plus',
  '02': 'T-Mobile',
  '03': 'Orange',
  '06': 'Play',
};

/** UKE band label of a downlink frequency (Polish allocations). C-band is listed as 3500 or 3600 MHz. */
const DOWNLINK_BANDS: Array<{ min: number; max: number; bands: string[] }> = [
  { min: 758, max: 788, bands: ['700'] },
  { min: 791, max: 821, bands: ['800'] },
  { min: 925, max: 960, bands: ['900'] },
  { min: 1805, max: 1880, bands: ['1800'] },
  { min: 2110, max: 2170, bands: ['2100'] },
  { min: 2570, max: 2690, bands: ['2600'] },
  { min: 3400, max: 3800, bands: ['3500', '3600'] },
];

/** C-band blocks of the 2023 auction, one 100 MHz block per operator. */
const C_BAND_BLOCKS: Array<{ min: number; max: number; operator: string }> = [
  { min: 3400, max: 3500, operator: 'Plus' },
  { min: 3500, max: 3600, operator: 'Play' },
  { min: 3600, max: 3700, operator: 'Orange' },
  { min: 3700, max: 3800, operator: 'T-Mobile' },
];

/** LTE EARFCN downlink ranges: [first EARFCN, last EARFCN, first frequency in MHz]. */
const LTE_EARFCN_BANDS: Array<[number, number, number]> = [
  [0, 599, 2110], [1200, 1949, 1805], [2750, 3449, 2620], [3450, 3799, 925], [6150, 6449, 791],
  [9210, 9659, 758], [37750, 38249, 2570],
];

/** Downlink frequency in MHz of an NR-ARFCN (TS 38.104 global raster) or an LTE EARFCN. */
export function arfcnToMhz(arfcn: number, nr: boolean): number | null {
  if (!Number.isInteger(arfcn) || arfcn < 0) return null;
  if (nr) {
    if (arfcn < 600000) return arfcn * 0.005;
    if (arfcn <= 2016666) return 3000 + (arfcn - 600000) * 0.015;
    return null;
  }
  const row = LTE_EARFCN_BANDS.find(([first, last]) => arfcn >= first && arfcn <= last);
  return row ? row[2] + 0.1 * (arfcn - row[0]) : null;
}

/** UKE band labels of a downlink frequency, e.g. 3585 MHz -> ["3500", "3600"]. */
export function bandsForMhz(mhz: number | null | undefined): string[] {
  if (mhz === null || mhz === undefined) return [];
  return DOWNLINK_BANDS.find(b => mhz >= b.min && mhz <= b.max)?.bands ?? [];
}

/** Operator owning a C-band frequency, e.g. 3585 MHz -> "Play". Boundaries belong to the upper block. */
export function cBandOperator(mhz: number | null | undefined): string | undefined {
  if (mhz === null || mhz === undefined) return undefined;
  return C_BAND_BLOCKS.find(b => mhz >= b.min && mhz < b.max)?.operator
    ?? (mhz === 3800 ? 'T-Mobile' : undefined);
}

/** Largest 28-bit E-UTRAN cell identity; anything above can only be a 36-bit NR cell identity. */
const MAX_LTE_ECI = 268435455;

/** NR-ARFCNs used in Poland start at ~151600 (n28); LTE EARFCN, UARFCN and GSM ARFCN stay far below. */
const MIN_NR_ARFCN = 100000;

/** Words that mark a query as 5G NR (compared against whole tokens, never substrings). */
const NR_TOKENS = new Set(['5g', 'nr', 'sa', 'nsa', '5gsa', '5gnsa', 'gnb', 'gnodeb', 'nci', 'nrci', 'nrarfcn', '3500', '3600']);
/** Words that mark a query as 4G LTE. */
const LTE_TOKENS = new Set(['4g', 'lte', 'enb', 'enodeb', 'eci', 'earfcn']);
/** Labelled radio fields stripped before a bare identifier is matched, e.g. "ARFCN 639072", "PCI 123", "RSRP -85". */
const CELL_FIELD_RE = /(?<![\p{L}\p{N}])(?:(?:nr-?|e|u)?arfcn|pci|tac|lac|psc|bsic|s?-?rsrp|s?-?rsrq|s?-?snr|sinr|rssi)\s*[:=]?\s*-?\d+(?:[.,]\d+)?(?:\s*db?m?)?/giu;
/** Tech tags stripped before a bare identifier is matched, e.g. "14510115 5G SA" -> "14510115". */
const TECH_TAG_RE = /(?<![\p{L}\p{N}])(?:5g|4g|lte|nr|n?sa|n\d{1,3})(?![\p{L}\p{N}])/giu;

/**
 * Splits an NR cell identity into gNodeB and cell. Polish networks report both an 8-bit cell part
 * (Play: 14510115 = 56680:35) and, for 36-bit identities, a 12-bit one.
 */
function splitNci(nci: number): { nodeId: number; cellId: number } {
  return nci >= 16777216
    ? { nodeId: Math.floor(nci / 4096), cellId: nci % 4096 }
    : { nodeId: Math.floor(nci / 256), cellId: nci % 256 };
}

/**
 * Derives the physical antenna sector index (1, 2, 3...) from cell identity.
 * In Polish mobile networks (Orange, Play, Plus, T-Mobile):
 * - Sector 1 carriers: 1, 11, 21, 31, 41, 51...
 * - Sector 2 carriers: 2, 12, 22, 32, 42, 52...
 * - Sector 3 carriers: 3, 13, 23, 33, 43, 53...
 */
export function deriveSectorNumber(cellId: number | null | undefined): number | null {
  if (cellId === null || cellId === undefined || !Number.isFinite(cellId)) return null;
  if (cellId <= 0) return 1;
  if (cellId >= 1 && cellId <= 9) return cellId;
  const lastDigit = cellId % 10;
  if (lastDigit >= 1 && lastDigit <= 6) {
    return lastDigit;
  }
  return ((cellId - 1) % 3) + 1;
}

/**
 * Parses a search string to detect cellular base station identifiers.
 */
export function parseCellSearch(input: string | null | undefined): ParsedCellId | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.length < 2) return null;

  // 0. Context: PLMN prefix ("260 06", "26006-"), ARFCN and tech words decide the operator and LTE vs 5G.
  // The prefix is only taken when an identifier of 4+ digits follows, so "26006" or "26006:35" stay node IDs.
  const plmnMatch = raw.match(/^(?:plmn\s*[:=]?\s*)?260[\s-]?(0\d)[\s\/:,;-]+(?=\D*\d{4})/i);
  const mnc = plmnMatch ? plmnMatch[1] : undefined;
  const body = plmnMatch ? raw.slice(plmnMatch[0].length) : raw;

  const tokens = body.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const arfcnMatch = body.match(/(?<![\p{L}\p{N}])(nr-?|e|u)?arfcn\s*[:=]?\s*(\d{1,7})/iu);
  const arfcn = arfcnMatch ? Number(arfcnMatch[2]) : undefined;
  const arfcnIsNr = arfcn !== undefined && !arfcnMatch![1]?.match(/^[eu]$/i) && arfcn >= MIN_NR_ARFCN;
  const nrHint = arfcnIsNr || tokens.some(t => NR_TOKENS.has(t) || /^n\d{1,3}$/.test(t));
  const lteHint = !nrHint && (tokens.some(t => LTE_TOKENS.has(t)) || /^e$/i.test(arfcnMatch?.[1] ?? ''));

  // The ARFCN gives the band, and in C-band also the operator (each holds its own 100 MHz block).
  const arfcnMhz = arfcn !== undefined && !/^u$/i.test(arfcnMatch?.[1] ?? '') ? arfcnToMhz(arfcn, arfcnIsNr) : null;
  const arfcnBands = bandsForMhz(arfcnMhz);
  const operator = (mnc ? POLISH_MNC_OPERATORS[mnc] : undefined) ?? (arfcnIsNr ? cBandOperator(arfcnMhz) : undefined);

  // 1. Check for explicit keywords: eNB, eNodeB, gNB, gNodeB, ECI, NCI, CID, LCID, RNC, TAC, PCI
  const gnbCidMatch = body.match(/(?:\b|_)(?:gnb|gnodeb)(?:[:_\s]*cid)?\s*[:=]?\s*(\d{4,8})\s*[:\/-]\s*(\d{1,4})/i);
  const enbMatch = body.match(/(?:\b|_)(?:enb|enodeb)(?:\b|_|\s*[:=]?\s*)(\d{1,8})/i);
  const gnbMatch = !gnbCidMatch ? body.match(/(?:\b|_)(?:gnb|gnodeb)(?:[:_\s]*cid)?\s*[:=]?\s*(\d{1,10})/i) : null;
  const nciMatch = body.match(/(?:\b|_)(?:nci|nr\s*ci|5g\s*ci)(?:\b|_|\s*[:=]?\s*)(\d{6,12})/i);
  const explicitEciMatch = !nciMatch ? body.match(/(?:\b|_)(?:eci|global\s*cell\s*id|cgi)(?:\b|_|\s*[:=]?\s*)(\d{6,11})/i) : null;
  const cellIdFallback = !enbMatch && !gnbMatch && !gnbCidMatch && !nciMatch && !explicitEciMatch
    ? body.match(/(?:\b|_)(?:cell\s*id|ci)(?:\b|_|\s*[:=]?\s*)(\d{6,11})/i)
    : null;

  // Local Cell ID / Sector (1..999)
  const cidMatch = body.match(/(?:\b|_)(?:cid|lcid|cell\s*id|sector|sektor)(?:\b|_|\s*[:=]?\s*)(\d{1,4})/i)
                || body.match(/(?:enb|gnb)\s*[:=]?\s*\d+\s*[,;\/-]\s*(?:cid\s*[:=]?\s*)?(\d{1,3})/i);

  const pciMatch = body.match(/(?:\b|_)(?:pci)(?:\b|_|\s*[:=]?\s*)(\d{1,4})/i);
  const tacMatch = body.match(/(?:\b|_)(?:tac|lac)(?:\b|_|\s*[:=]?\s*)(\d{1,6})/i);
  const rncMatch = body.match(/(?:\b|_)(?:rnc)(?:\b|_|\s*[:=]?\s*)(\d{1,5})/i);

  // 2. Bare identifiers once tech tags are stripped: "14510115 5G", "5G SA 56680", "56680 35", "56680:35 n78".
  const keywordMatched = gnbCidMatch || enbMatch || gnbMatch || nciMatch || explicitEciMatch || cellIdFallback;
  const core = keywordMatched ? '' : body.replace(CELL_FIELD_RE, ' ').replace(TECH_TAG_RE, ' ').replace(/^[\s,;:\/-]+|[\s,;:\/-]+$/g, '').replace(/\s+/g, ' ');
  const plainCiMatch = core.match(/^(\d{7,11})$/);
  const dashPattern = !plainCiMatch
    ? core.match(/^(\d{3,8})\s*[-\/:_]\s*(\d{1,4})$/) || core.match(/^(\d{4,8}) (\d{1,4})$/)
    : null;
  const plainNodeIdMatch = !plainCiMatch && !dashPattern ? core.match(/^(\d{4,6})$/) : null;

  let type: 'LTE' | 'NR' | 'UMTS' | 'GSM' | 'GENERIC' = 'GENERIC';
  let nodeId: number | null = null;
  let cellId: number | null = null;
  let sectorNum: number | null = null;
  let eci: number | null = null;
  let nci: number | null = null;
  let ambiguousTech = false;

  const bareCi = cellIdFallback || plainCiMatch;
  if (gnbCidMatch) {
    type = 'NR';
    nodeId = Number(gnbCidMatch[1]);
    cellId = Number(gnbCidMatch[2]);
    nci = nodeId * 256 + cellId;
  } else if (nciMatch) {
    type = 'NR';
    nci = Number(nciMatch[1]);
    ({ nodeId, cellId } = splitNci(nci));
  } else if (explicitEciMatch) {
    const rawVal = Number(explicitEciMatch[1]);
    if (rawVal >= 256 && rawVal <= MAX_LTE_ECI) {
      type = 'LTE';
      eci = rawVal;
      nodeId = Math.floor(rawVal / 256);
      cellId = rawVal % 256;
    }
  } else if (bareCi) {
    const rawVal = Number(bareCi[1]);
    if (nrHint || rawVal > MAX_LTE_ECI) {
      type = 'NR';
      nci = rawVal;
      ({ nodeId, cellId } = splitNci(rawVal));
    } else if (rawVal >= 256) {
      type = 'LTE';
      eci = rawVal;
      nodeId = Math.floor(rawVal / 256);
      cellId = rawVal % 256;
      if (!lteHint) {
        ambiguousTech = true;
        nci = rawVal;
      }
    }
  } else if (enbMatch) {
    type = 'LTE';
    nodeId = Number(enbMatch[1]);
  } else if (gnbMatch) {
    type = 'NR';
    nodeId = Number(gnbMatch[1]);
  } else if (dashPattern) {
    type = nrHint ? 'NR' : 'LTE';
    nodeId = Number(dashPattern[1]);
    cellId = Number(dashPattern[2]);
    if (type === 'NR') nci = nodeId * 256 + cellId;
  } else if (plainNodeIdMatch) {
    nodeId = Number(plainNodeIdMatch[1]);
    type = nrHint ? 'NR' : lteHint ? 'LTE' : 'GENERIC';
  }

  if (cidMatch && cellId === null) {
    cellId = Number(cidMatch[1]);
  }
  if (cellId !== null) sectorNum = deriveSectorNumber(cellId);

  if (nodeId !== null && cellId !== null && eci === null && type === 'LTE') {
    eci = nodeId * 256 + cellId;
  }

  const pci = pciMatch ? Number(pciMatch[1]) : undefined;
  const tac = tacMatch ? Number(tacMatch[1]) : undefined;
  const rnc = rncMatch ? Number(rncMatch[1]) : undefined;

  if (nodeId === null && eci === null && cellId === null) {
    return null;
  }

  const nodeIdStr = nodeId !== null ? String(nodeId) : undefined;
  let displaySummary = '';
  if (ambiguousTech && nodeIdStr) {
    displaySummary = `eNodeB/gNodeB ${nodeIdStr}`;
    if (cellId !== null) displaySummary += ` · Sektor ${sectorNum ?? cellId} (CID ${cellId})`;
    if (eci !== null) displaySummary += ` · CI ${eci}`;
  } else if (type === 'LTE' && nodeIdStr) {
    displaySummary = `eNodeB ${nodeIdStr}`;
    if (cellId !== null) displaySummary += ` · Sektor ${sectorNum ?? cellId} (CID ${cellId})`;
    if (eci !== null) displaySummary += ` · ECI ${eci}`;
  } else if (type === 'NR' && nodeIdStr) {
    displaySummary = `gNodeB ${nodeIdStr}`;
    if (cellId !== null) displaySummary += ` · Sektor ${sectorNum ?? cellId} (CID ${cellId})`;
    if (nci !== null) displaySummary += ` · NCI ${nci}`;
  } else if (nodeIdStr) {
    displaySummary = `Stacja ${nodeIdStr}`;
    if (cellId !== null) displaySummary += ` · Sektor ${sectorNum ?? cellId}`;
  }
  if (operator) displaySummary = `${operator} · ${displaySummary}`;

  return {
    isCellIdQuery: true,
    type,
    nodeId: nodeId ?? undefined,
    nodeIdStr,
    sectorNum: sectorNum ?? undefined,
    cellId: cellId ?? undefined,
    eci: eci ?? undefined,
    nci: nci ?? undefined,
    pci,
    tac,
    rnc,
    arfcn,
    arfcnMhz: arfcnMhz === null ? undefined : Math.round(arfcnMhz * 100) / 100,
    bands: arfcnBands.length ? arfcnBands : undefined,
    mnc,
    operator,
    ambiguousTech: ambiguousTech || undefined,
    displaySummary,
    stationIdCandidate: nodeIdStr,
  };
}

/**
 * Resolves the antenna sector azimuth for a station given a sector number (1, 2, 3...)
 */
export function resolveSectorAzimuth(
  azimuths: number[] | null | undefined,
  sectorNum: number | null | undefined
): { azimuth: number; sectorNum: number } | null {
  if (!Array.isArray(azimuths) || azimuths.length === 0) return null;
  if (!sectorNum || sectorNum < 1) return null;
  const idx = (sectorNum - 1) % azimuths.length;
  return {
    azimuth: azimuths[idx],
    sectorNum,
  };
}

export interface SectorCellInfo {
  sectorNum: number;
  azimuth?: number;
  cid: number;
  eci: number;
}

export function extractEnodeBId(stationId: string | null | undefined): number | null {
  if (!stationId) return null;
  const m = stationId.match(/(?:BT)?(\d{4,6})\b/i) || stationId.match(/\d{4,6}/);
  if (m) {
    const num = Number(m[1] || m[0]);
    if (num > 0 && num < 10000000) return num;
  }
  return null;
}

export function getStationSectorsInfo(
  stationId: string | null | undefined,
  azimuths?: number[]
): SectorCellInfo[] {
  const enb = extractEnodeBId(stationId);
  if (!enb) return [];
  const azList = Array.isArray(azimuths) && azimuths.length > 0 ? azimuths : [0, 120, 240];
  return azList.map((az, idx) => {
    const sectorNum = idx + 1;
    const cid = sectorNum;
    const eci = enb * 256 + cid;
    return {
      sectorNum,
      azimuth: az,
      cid,
      eci,
    };
  });
}

