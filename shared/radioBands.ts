/**
 * Channel number → band, as BTMap labels it: "1800 (b3)", "3500 (n78)", "900" for GSM.
 * Covers the bands used in Europe (3GPP TS 36.101, 38.104, 25.101, 45.005).
 */
export interface RadioBand { code: string; mhz: number; label: string }

const LTE: Array<[band: number, mhz: number, first: number, last: number]> = [
  [1, 2100, 0, 599], [3, 1800, 1200, 1949], [7, 2600, 2750, 3449], [8, 900, 3450, 3799],
  [20, 800, 6150, 6449], [28, 700, 9210, 9659], [32, 1500, 9920, 10359], [38, 2600, 37750, 38249],
  [40, 2300, 38650, 39649], [42, 3500, 41590, 43589], [43, 3700, 43590, 45589],
];

// Downlink MHz ranges, first match wins where bands overlap.
const NR: Array<[band: number, mhz: number, low: number, high: number]> = [
  [20, 800, 791, 821], [28, 700, 758, 803], [8, 900, 925, 960], [75, 1500, 1432, 1517],
  [3, 1800, 1805, 1880], [1, 2100, 2110, 2170], [40, 2300, 2300, 2400], [7, 2600, 2620, 2690],
  [41, 2600, 2496, 2690], [38, 2600, 2570, 2620], [78, 3500, 3300, 3800], [258, 26000, 24250, 27500],
];

const UMTS: Array<[band: number, mhz: number, first: number, last: number]> = [
  [1, 2100, 10562, 10838], [8, 900, 2937, 3088],
];

export function nrArfcnMhz(arfcn: number): number | null {
  if (arfcn < 0) return null;
  if (arfcn < 600_000) return arfcn * 0.005;
  if (arfcn <= 2_016_666) return 3000 + (arfcn - 600_000) * 0.015;
  if (arfcn <= 3_279_165) return 24250.08 + (arfcn - 2_016_667) * 0.06;
  return null;
}

export function bandOfChannel(tech: string, channel: number | null | undefined): RadioBand | null {
  if (channel == null || !Number.isFinite(channel) || channel < 0) return null;
  const t = tech.toUpperCase();
  if (t === 'LTE' || t === '4G') {
    const row = LTE.find(([, , first, last]) => channel >= first && channel <= last);
    return row ? { code: `b${row[0]}`, mhz: row[1], label: `${row[1]} (b${row[0]})` } : null;
  }
  if (t === '5G' || t === 'NR') {
    const f = nrArfcnMhz(channel);
    const row = f == null ? undefined : NR.find(([, , low, high]) => f >= low && f <= high);
    return row ? { code: `n${row[0]}`, mhz: row[1], label: `${row[1]} (n${row[0]})` } : null;
  }
  if (t === 'UMTS' || t === '3G') {
    const row = UMTS.find(([, , first, last]) => channel >= first && channel <= last);
    return row ? { code: `b${row[0]}`, mhz: row[1], label: `${row[1]} (b${row[0]})` } : null;
  }
  if (t === 'GSM' || t === '2G') {
    if (channel <= 124 || (channel >= 975 && channel <= 1023)) return { code: 'gsm900', mhz: 900, label: '900' };
    if (channel >= 512 && channel <= 885) return { code: 'dcs1800', mhz: 1800, label: '1800' };
  }
  return null;
}

// Lowest downlink frequency and first channel of each LTE band (TS 36.101 table 5.7.3-1).
const LTE_DL: Array<[first: number, last: number, fDlLow: number]> = [
  [0, 599, 2110], [1200, 1949, 1805], [2750, 3449, 2620], [3450, 3799, 925], [6150, 6449, 791],
  [9210, 9659, 758], [9920, 10359, 1452], [37750, 38249, 2570], [38650, 39649, 2300],
  [41590, 43589, 3400], [43590, 45589, 3600],
];

/** Downlink frequency of a channel in MHz, rounded to 0.1; null when unknown. */
export function channelMhz(tech: string, channel: number | null | undefined): number | null {
  if (channel == null || !Number.isFinite(channel) || channel < 0) return null;
  const t = tech.toUpperCase();
  const round = (v: number) => Math.round(v * 10) / 10;
  if (t === 'LTE' || t === '4G') {
    const row = LTE_DL.find(([first, last]) => channel >= first && channel <= last);
    return row ? round(row[2] + 0.1 * (channel - row[0])) : null;
  }
  if (t === '5G' || t === 'NR') { const f = nrArfcnMhz(channel); return f == null ? null : round(f); }
  if (t === 'UMTS' || t === '3G') {
    if (channel >= 10562 && channel <= 10838) return round(channel / 5);
    if (channel >= 2937 && channel <= 3088) return round(channel / 5 + 340);
    return null;
  }
  if (t === 'GSM' || t === '2G') {
    if (channel <= 124) return round(935 + 0.2 * channel);
    if (channel >= 975 && channel <= 1023) return round(935 + 0.2 * (channel - 1024));
    if (channel >= 512 && channel <= 885) return round(1805.2 + 0.2 * (channel - 512));
  }
  return null;
}
