// Driving the player's car: arcade physics with speed-sensitive steering,
// building and traffic collisions, and the two chase cameras (on foot the
// mouse orbits; in a car the camera trails behind). Camera clipping is kept
// out of buildings by shrinking the camera distance when it would be inside one.
import { clamp, damp, collideCircle, angLerp } from './util.js';

const TOP_SPEED = 32;
const TOP_REVERSE = -9;
const ACCEL = 15;
const BRAKE = 26;

export function enterCar(G, car) {
  const p = G.player;
  p.inCar = true;
  p.car = car;
  p.mesh.visible = false;
  car.taken = true;
  car.stolen = true;
  G.sounds.blip(660);
  G.hud.setHint('W/S drive · A/D steer · E exit · Click drive-by');
  setTimeout(() => { if (G.state === 'playing') G.hud.setHint(''); }, 4000);
}

export function exitCar(G) {
  const p = G.player;
  if (!p.inCar || !p.car) return;
  const c = p.car;
  const side = { x: Math.cos(c.heading), z: -Math.sin(c.heading) };
  p.mesh.position.set(
    c.mesh.position.x + side.x * 2.4, 0, c.mesh.position.z + side.z * 2.4
  );
  p.mesh.visible = true;
  p.heading = c.heading;
  p.mesh.rotation.y = p.heading;
  p.camYaw = c.heading + Math.PI;
  p.inCar = false;
  p.car = null;
  G.sounds.stopEngine();
  G.hud.setHint('');
}

export function updateDriving(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const fwd = G.keys.has('KeyW') ? 1 : 0;
  const back = G.keys.has('KeyS') ? 1 : 0;
  const left = G.keys.has('KeyA') ? 1 : 0;
  const right = G.keys.has('KeyD') ? 1 : 0;
  let speed = car.speed || 0;
  if (fwd) speed += ACCEL * dt;
  if (back) speed -= (speed > 0.5 ? BRAKE : ACCEL * 0.7) * dt;
  if (!fwd && !back) speed *= Math.exp(-0.7 * dt);
  speed = clamp(speed, TOP_REVERSE, TOP_SPEED);
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const grip = clamp(Math.abs(speed) / 9, 0, 1);
  car.heading += steer * grip * 1.9 * dt * (speed < 0 ? -1 : 1);
  const nx = car.mesh.position.x + Math.sin(car.heading) * speed * dt;
  const nz = car.mesh.position.z + Math.cos(car.heading) * speed * dt;
  const fixed = collideCircle(nx, nz, 1.7, G.city.colliders);
  if (fixed.hit && Math.abs(speed) > 6) {
    speed *= 0.45;
    G.sounds.thud();
    G.hud.flashDamage();
  }
  car.mesh.position.x = clamp(fixed.x, -228, 228);
  car.mesh.position.z = clamp(fixed.z, -178, 178);
  car.mesh.rotation.y = car.heading;
  car.speed = speed;
  const spin = speed * dt / 0.36;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  // Shove traffic cars we bump into, and knock down pedestrians in the way.
  for (const t of G.cars.traffic) {
    if (t.stolen) continue;
    const dx = t.mesh.position.x - car.mesh.position.x;
    const dz = t.mesh.position.z - car.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.6 && d > 0.01) {
      t.mesh.position.x += (dx / d) * (3.6 - d);
      t.mesh.position.z += (dz / d) * (3.6 - d);
      speed *= 0.92;
      car.speed = speed;
    }
  }
  for (const ped of G.peds) {
    if (ped.knocked) continue;
    const dx = ped.mesh.position.x - car.mesh.position.x;
    const dz = ped.mesh.position.z - car.mesh.position.z;
    if (Math.hypot(dx, dz) < 2.3 && Math.abs(speed) > 3) {
      ped.knocked = true;
      ped.knockT = 20;
      ped.mesh.visible = false;
      G.wanted.addHeat(15);
      G.hud.toast('Pedestrian hit! The cops noticed.');
      G.sounds.thud();
    }
  }
  G.sounds.engine(Math.abs(speed) / TOP_SPEED, true);
}

function cameraClear(x, y, z, boxes) {
  for (const b of boxes) {
    if (x > b.x0 - 0.5 && x < b.x1 + 0.5 && z > b.z0 - 0.5 && z < b.z1 + 0.5 && y < 60) return false;
  }
  return true;
}

export function updateFootCamera(G, dt) {
  const p = G.player;
  const target = p.mesh.position;
  const pitch = clamp(p.camPitch, -0.1, 1.1);
  for (let dist = 7; dist >= 2.5; dist -= 1.1) {
    const cx = target.x + Math.sin(p.camYaw) * Math.cos(pitch) * dist;
    const cy = target.y + 1.7 + Math.sin(pitch) * dist;
    const cz = target.z + Math.cos(p.camYaw) * Math.cos(pitch) * dist;
    if (cameraClear(cx, cy, cz, G.city.colliders) || dist <= 2.6) {
      G.camera.position.x = damp(G.camera.position.x, cx, 14, dt);
      G.camera.position.y = damp(G.camera.position.y, Math.max(0.7, cy), 14, dt);
      G.camera.position.z = damp(G.camera.position.z, cz, 14, dt);
      break;
    }
  }
  G.camera.lookAt(target.x, target.y + 1.5, target.z);
}

export function updateCarCamera(G, dt) {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const h = car.heading;
  const bx = car.mesh.position.x - Math.sin(h) * 10;
  const bz = car.mesh.position.z - Math.cos(h) * 10;
  const by = 4.4;
  G.camera.position.x = damp(G.camera.position.x, bx, 5, dt);
  G.camera.position.y = damp(G.camera.position.y, by, 5, dt);
  G.camera.position.z = damp(G.camera.position.z, bz, 5, dt);
  G.camera.lookAt(
    car.mesh.position.x + Math.sin(h) * 9,
    1.4,
    car.mesh.position.z + Math.cos(h) * 9
  );
}

export function speedKmh(G) {
  const p = G.player;
  if (p.inCar && p.car) return Math.round(Math.abs(p.car.speed || 0) * 3.6);
  return Math.round(p.speed * 3.6);
}
