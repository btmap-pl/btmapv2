import { OPERATORS } from './operators.ts';

/**
 * Countries the map covers. Poland has the UKE registry; elsewhere stations come only from the
 * community (NetMonster imports and submissions), because the local regulator publishes no
 * station list (Romania: ANCOM shows measured coverage, not sites).
 */
export type CountryCode = 'PL' | 'RO';

export interface CountryOperator { name: string; color: string; mnc?: number[] }

export interface Country {
  code: CountryCode;
  name: { pl: string; en: string };
  mcc: number;
  /** Bounding box; checked in order, so overlapping neighbours never steal a country. */
  bounds: { south: number; north: number; west: number; east: number };
  /** Regulator with a public station registry, if any. */
  registry: string | null;
  operators: CountryOperator[];
  /** Band filter values (MHz). */
  bands: string[];
  provinces: string[];
  /** Technology filter values that have data there. */
  techs: string[];
  /**
   * Map tools backed by Polish sources: SI2PEM (PEM layer, and the antenna parameters the terrain
   * profile needs), UKE radiolines, the audit of the four Polish operators, and the crowdsourced
   * coverage map (Polish networks only so far).
   */
  features: { pem: boolean; radiolines: boolean; areaEvaluation: boolean; terrainProfile: boolean; coverage: boolean };
}

export const ROMANIAN_OPERATORS: CountryOperator[] = [
  { name: 'Orange RO', color: '#ff7900', mnc: [10] },
  { name: 'Vodafone RO', color: '#e60000', mnc: [1] },
  { name: 'Telekom RO', color: '#e20074', mnc: [3] },
  { name: 'Digi RO', color: '#1f6fd1', mnc: [5] },
];

export const COUNTRIES: Record<CountryCode, Country> = {
  PL: {
    code: 'PL',
    name: { pl: 'Polska', en: 'Poland' },
    mcc: 260,
    bounds: { south: 49.0, north: 55.0, west: 14.0, east: 24.5 },
    registry: 'UKE',
    operators: OPERATORS.map(op => ({ name: op.name, color: op.color })),
    bands: ['420', '450', '700', '800', '900', '1800', '2100', '2600', '3500', '3600'],
    techs: ['5G', 'LTE', 'UMTS', 'GSM', 'IOT', 'CDMA'],
    features: { pem: true, radiolines: true, areaEvaluation: true, terrainProfile: true, coverage: true },
    provinces: ['Dolnośląskie', 'Kujawsko-pomorskie', 'Lubelskie', 'Lubuskie', 'Łódzkie', 'Małopolskie', 'Mazowieckie', 'Opolskie', 'Podkarpackie', 'Podlaskie', 'Pomorskie', 'Śląskie', 'Świętokrzyskie', 'Warmińsko-mazurskie', 'Wielkopolskie', 'Zachodniopomorskie'],
  },
  RO: {
    code: 'RO',
    name: { pl: 'Rumunia', en: 'Romania' },
    mcc: 226,
    bounds: { south: 43.6, north: 48.3, west: 20.2, east: 29.8 },
    registry: null,
    operators: [...ROMANIAN_OPERATORS, { name: 'Inne', color: '#788992' }],
    bands: ['700', '800', '900', '1800', '2100', '2600', '3500'],
    provinces: [],
    techs: ['5G', 'LTE', 'UMTS', 'GSM'],
    features: { pem: false, radiolines: false, areaEvaluation: false, terrainProfile: false, coverage: false },
  },
};

export function countryAt(lat: number, lng: number): Country | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const country of Object.values(COUNTRIES)) {
    const b = country.bounds;
    if (lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east) return country;
  }
  return null;
}

export function countryByMcc(mcc: number): Country | null {
  return Object.values(COUNTRIES).find(c => c.mcc === mcc) ?? null;
}

/** Operator of a network in [country] by MNC, or 'Inne'. */
export function operatorByMnc(country: Country, mnc: number): string {
  return country.operators.find(op => op.mnc?.includes(mnc))?.name ?? 'Inne';
}
