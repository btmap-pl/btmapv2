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
