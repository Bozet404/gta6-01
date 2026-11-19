// Tiny helpers shared by every Solmara module: seeded randomness, math, dom.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent approach: damp(current, target, lambda, dt)
export const damp = (cur, target, lambda, dt) => lerp(target, cur, Math.exp(-lambda * dt));
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
export const angLerp = (a, b, t) => a + angDiff(a, b) * t;
export const fmtCash = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const fmtClock = (hours) => {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
export const $ = (id) => document.getElementById(id);
// Push a circle (x, z, radius r) out of every AABB it overlaps.
// Returns { x, z, hit } with the corrected position.
export function collideCircle(x, z, r, boxes) {
  let hit = false;
  for (const b of boxes) {
    const cx = clamp(x, b.x0, b.x1);
    const cz = clamp(z, b.z0, b.z1);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: shove out along the smallest penetration.
      const pl = x - b.x0 + r; const pr = b.x1 - x + r;
      const pt = z - b.z0 + r; const pb = b.z1 - z + r;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = b.x0 - r;
      else if (m === pr) x = b.x1 + r;
      else if (m === pt) z = b.z0 - r;
      else z = b.z1 + r;
    }
  }
  return { x, z, hit };
}
export const el = (tag, cls, parent) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
};
