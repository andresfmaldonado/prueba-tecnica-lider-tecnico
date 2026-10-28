/** Reproducible test data: same seed, same data. */

/** Seeded pseudo-random generator (mulberry32). Returns numbers in [0, 1). */
export function generator(seedValue: number): () => number {
  let a = seedValue >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [min, max], both inclusive. */
export const integer = (rng: () => number, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

export const TENANTS = Array.from({ length: 30 }, (_, i) => `cliente-${String(i + 1).padStart(2, '0')}`);

export const CITIES = [
  'Medellín', 'Bogotá', 'Cali', 'Barranquilla', 'Cartagena', 'Bucaramanga',
  'Pereira', 'Manizales', 'Cúcuta', 'Ibagué', 'Santa Marta', 'Villavicencio',
];

/** Coverage as plain data, so that the oracle does not depend on the domain. */
export interface CoverageSpecification {
  /** 1 = Monday … 7 = Sunday. */
  days: number[];
  /** AAAA-MM-DD dates without service (holidays, closures). */
  unavailable: string[];
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export function randomDateISO(rng: () => number, from = '2024-01-01', until = '2031-12-31'): string {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = until.split('-').map(Number);
  const total = Math.round((Date.UTC(y2!, m2! - 1, d2!) - Date.UTC(y1!, m1! - 1, d1!)) / 86_400_000);
  return addDaysISO(from, integer(rng, 0, total));
}

export function randomCoverage(rng: () => number, todayISO: string): CoverageSpecification {
  const days = [1, 2, 3, 4, 5, 6, 7].filter(() => rng() < 0.45);
  const unavailable = Array.from({ length: integer(rng, 0, 6) }, () => addDaysISO(todayISO, integer(rng, 0, 20)));
  return { days, unavailable };
}
