import type { Stop, StopCat } from './types';

export const DAY_START = 9 * 60 + 30; // 9:30 AM in minutes

export function fmtMin(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function hhmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function legMin(a: Stop, b: Stop): number {
  // Mock drive time based on price diff as a proxy for distance
  const base = 8 + Math.abs(a.price - b.price);
  return Math.min(Math.max(base, 5), 35);
}

export function tempAt(min: number): string {
  const hour = Math.floor(min / 60);
  if (hour < 11) return '62°';
  if (hour < 14) return '68°';
  if (hour < 17) return '74°';
  if (hour < 20) return '71°';
  return '65°';
}

export interface ComputedStop extends Stop {
  arrMin: number;
  depMin: number;
}

export function computeTimes(stops: Stop[]): ComputedStop[] {
  const result: ComputedStop[] = [];
  let cursor = DAY_START;
  for (let i = 0; i < stops.length; i++) {
    if (i > 0) {
      cursor += legMin(stops[i - 1], stops[i]);
    }
    const arrMin = cursor;
    cursor += stops[i].dur;
    result.push({ ...stops[i], arrMin, depMin: cursor });
  }
  return result;
}

export function totals(stops: Stop[]): {
  drive: string;
  budget: string;
  gas: string;
  miles: string;
} {
  let driveMin = 0;
  let budget = 0;
  let miles = 0;
  for (let i = 0; i < stops.length; i++) {
    budget += stops[i].price;
    if (i > 0) {
      const leg = legMin(stops[i - 1], stops[i]);
      driveMin += leg;
      miles += Math.round(leg * 0.5);
    }
  }
  const gasGallons = miles / 30;
  return {
    drive: fmtMin(driveMin),
    budget: `$${budget}`,
    gas: `$${Math.round(gasGallons * 4.2)}`,
    miles: `${miles}mi`,
  };
}

const ACT_MAP: Record<string, StopCat> = {
  coffee: 'food', brunch: 'food', lunch: 'food', dinner: 'food',
  drinks: 'nightlife', bar: 'nightlife', club: 'nightlife',
  shopping: 'shopping', thrift: 'shopping', vintage: 'shopping',
  museum: 'attractions', park: 'attractions', hike: 'attractions',
  gallery: 'attractions', beach: 'attractions',
};

export function normAct(label: string): string {
  return label.toLowerCase().trim();
}

export function bucketFor(key: string): StopCat {
  return ACT_MAP[key] ?? 'attractions';
}

export function durFor(key: string): number {
  const durs: Record<string, number> = {
    coffee: 30, brunch: 60, lunch: 60, dinner: 90,
    drinks: 60, bar: 90, club: 120,
    shopping: 60, thrift: 45, vintage: 45,
    museum: 90, park: 60, hike: 120,
    gallery: 45, beach: 120,
  };
  return durs[key] ?? 60;
}

export const PRICE_COST: Record<string, number> = {
  coffee: 8, brunch: 22, lunch: 18, dinner: 35,
  drinks: 20, bar: 25, club: 30,
  shopping: 40, thrift: 15, vintage: 20,
  museum: 18, park: 0, hike: 0,
  gallery: 0, beach: 0,
};
