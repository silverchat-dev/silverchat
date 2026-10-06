/**
 * Seeded randomness and 2D simplex noise for the world's shapes. Everything in Meldan is built from these, so a seed
 * gives the same city on every device and every visit.
 */

/** mulberry32: a small, fast, seeded generator; returns numbers in [0, 1). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const G = [
  [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
];

/** 2D simplex noise in [-1, 1], from a seeded permutation. */
export function simplex2(seed = 1) {
  const r = rng(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;

  return (x: number, y: number) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const corner = (gx: number, gy: number, g: number) => {
      const tt = 0.5 - gx * gx - gy * gy;
      if (tt < 0) return 0;
      const [a, b] = G[g % 8];
      return tt * tt * tt * tt * (a * gx + b * gy);
    };
    return (
      70 *
      (corner(x0, y0, perm[ii + perm[jj]]) + corner(x1, y1, perm[ii + i1 + perm[jj + j1]]) + corner(x2, y2, perm[ii + 1 + perm[jj + 1]]))
    );
  };
}

/** Fractal noise: `octaves` layers of simplex, each twice as fine and half as strong. Result roughly in [-1, 1]. */
export function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return sum / (1 - Math.pow(0.5, octaves));
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
