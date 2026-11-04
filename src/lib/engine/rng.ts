export type Rng = () => number;
export function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return h >>> 0;
}
export function mulberry32(seedStr: string): Rng {
  let a = hashSeed(seedStr);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomSeed(): string {
  const c = (globalThis as any).crypto;
  if (c?.getRandomValues) { const b = new Uint32Array(3); c.getRandomValues(b); return Array.from(b).map((n) => n.toString(36)).join(''); }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
export function pick<T>(rng: Rng, arr: T[]): T { return arr[Math.floor(rng() * arr.length)]; }
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
