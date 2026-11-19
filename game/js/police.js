// The wanted system: heat 0-100 maps to 0-5 stars, police cruisers spawn
// up to three and chase the player, ramming when they catch up. Lose them
// (get far away) and the heat cools down.
import { clamp, collideCircle, angLerp } from './util.js';
import { PoliceCar } from './vehicles.js';
import { hurtPlayer } from './player.js';

const LEVELS = [12, 30, 50, 70, 88]; // heat at which each star appears

export function levelOf(heat) {
  let lv = 0;
  for (const t of LEVELS) if (heat >= t) lv++;
  return lv;
}

export function createWanted(G) {
  return {
    heat: 0,
    level: 0,
    cars: [],
    addHeat(n) {
      const before = this.level;
      this.heat = clamp(this.heat + n, 0, 100);
      this.level = levelOf(this.heat);
      if (this.level > before) {
        G.hud.toast(`Wanted level ${this.level} — the police are coming!`);
        G.sounds.blip(220);
      }
    },
    setLevel(lv) {
      this.heat = lv <= 0 ? 0 : LEVELS[lv - 1] + 1;
      this.level = levelOf(this.heat);
    },
  };
}

function nearestPoliceDist(G) {
  let best = Infinity;
  const p = G.player.mesh.position;
  for (const c of G.wanted.cars) {
    const d = Math.hypot(c.mesh.position.x - p.x, c.mesh.position.z - p.z);
    if (d < best) best = d;
  }
  return best;
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  // Heat cools when no cruiser is close.
  if (nearestPoliceDist(G) > 70) w.heat = Math.max(0, w.heat - 2.4 * dt);
  w.level = levelOf(w.heat);

  // Spawn cruisers up to the wanted level (max 3).
  const want = Math.min(w.level, 3);
  while (w.cars.length < want) {
    const p = G.player.mesh.position;
    const a = Math.random() * Math.PI * 2;
    const c = new PoliceCar(G.scene, p.x + Math.sin(a) * 65, p.z + Math.cos(a) * 65);
    c.speed = 0;
    c.heading = 0;
    c.stuckT = 0;
    c.detourT = 0;
    c.lastX = c.mesh.position.x;
    c.lastZ = c.mesh.position.z;
    w.cars.push(c);
    G.cars.police.push(c);
  }
  // Despawn when the heat is gone.
  if (w.level === 0) {
    for (const c of w.cars) {
      G.scene.remove(c.mesh);
      const i = G.cars.police.indexOf(c);
      if (i >= 0) G.cars.police.splice(i, 1);
    }
    w.cars.length = 0;
  }

  const target = G.player.inCar && G.player.car
    ? G.player.car.mesh.position
    : G.player.mesh.position;
  let anyChasing = false;
  for (const c of w.cars) {
    anyChasing = true;
    const dx = target.x - c.mesh.position.x;
    const dz = target.z - c.mesh.position.z;
    const d = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    // If stuck against a building, detour sideways for a moment.
    c.stuckT += dt;
    if (c.stuckT > 1) {
      const moved = Math.hypot(c.mesh.position.x - c.lastX, c.mesh.position.z - c.lastZ);
      if (moved < 1.2) c.detourT = 1.4;
      c.lastX = c.mesh.position.x;
      c.lastZ = c.mesh.position.z;
      c.stuckT = 0;
    }
    if (c.detourT > 0) {
      c.detourT -= dt;
      c.heading = angLerp(c.heading, wantHeading + Math.PI / 2, Math.min(1, dt * 3));
    } else {
      c.heading = angLerp(c.heading, wantHeading, Math.min(1, dt * 2.4));
    }
    const top = 30;
    c.speed = Math.min(top, (c.speed || 0) + 12 * dt);
    const nx = c.mesh.position.x + Math.sin(c.heading) * c.speed * dt;
    const nz = c.mesh.position.z + Math.cos(c.heading) * c.speed * dt;
    const fixed = collideCircle(nx, nz, 1.7, G.city.colliders);
    if (fixed.hit) c.speed *= 0.5;
    c.mesh.position.x = clamp(fixed.x, -228, 228);
    c.mesh.position.z = clamp(fixed.z, -178, 178);
    c.mesh.rotation.y = c.heading;
    c.update(dt, true);
    // Ram: contact hurts the player and shoves the player's car.
    if (d < 3.4) {
      const p = G.player;
      if (p.inCar && p.car) {
        p.car.speed = (p.car.speed || 0) * 0.55;
        p.car.mesh.position.x += Math.sin(c.heading) * 1.2;
        p.car.mesh.position.z += Math.cos(c.heading) * 1.2;
      }
      if (!c.ramCd || c.ramCd <= 0) {
        c.ramCd = 1.2;
        hurtPlayer(G, 5, 'ram');
        G.hud.toast('Police rammed you!');
      }
    }
    if (c.ramCd) c.ramCd -= dt;
  }
  G.sounds.siren(anyChasing);
}
