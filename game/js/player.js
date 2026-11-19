// The player on foot: WASD movement relative to the camera, sprint, an
// orbit camera the mouse drags, entering and leaving cars, and hitscan
// shooting with tracers, impact sparks and a hit marker for feedback.
import { clamp, angLerp, collideCircle } from './util.js';

const WALK_SPEED = 6.2;
const SPRINT_SPEED = 9.6;
const MAG_SIZE = 12;
const RELOAD_TIME = 1.2;

export function createPlayer(scene) {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xffb02e });
  const denim = new THREE.MeshLambertMaterial({ color: 0x2c4a6e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.82, 0.36), jacket);
  torso.position.y = 1.06;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skin);
  head.position.y = 1.7;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x1e2226 })
  );
  cap.position.y = 1.92;
  g.add(cap);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), denim);
    leg.position.set(s * 0.17, 0.36, 0);
    g.add(leg);
    legs.push(leg);
  }
  // The gun the player holds: a small dark box on the right hand side.
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x14161a })
  );
  gun.position.set(0.42, 1.05, 0.25);
  g.add(gun);
  scene.add(g);
  return {
    mesh: g,
    legs,
    heading: 0,
    hp: 100,
    ammo: MAG_SIZE,
    reloading: false,
    reloadT: 0,
    inCar: false,
    car: null,
    speed: 0,
    camYaw: Math.PI,
    camPitch: 0.32,
    walkPhase: 0,
  };
}

// Move on foot. `move` is {x, z} in world space, already normalised.
export function updatePlayerOnFoot(G, dt, move) {
  const p = G.player;
  const sprint = G.keys.has('ShiftLeft') || G.keys.has('ShiftRight');
  const target = sprint ? SPRINT_SPEED : WALK_SPEED;
  const mx = move.x * target;
  const mz = move.z * target;
  p.speed = Math.hypot(mx, mz);
  if (p.speed > 0.1) {
    const want = Math.atan2(mx, mz);
    p.heading = angLerp(p.heading, want, Math.min(1, dt * 12));
    p.mesh.rotation.y = p.heading;
    p.walkPhase += dt * p.speed * 1.6;
    p.legs[0].rotation.x = Math.sin(p.walkPhase) * 0.5;
    p.legs[1].rotation.x = -Math.sin(p.walkPhase) * 0.5;
  } else {
    p.legs[0].rotation.x *= 0.8;
    p.legs[1].rotation.x *= 0.8;
  }
  const nx = p.mesh.position.x + mx * dt;
  const nz = p.mesh.position.z + mz * dt;
  const fixed = collideCircle(nx, nz, 0.6, G.city.colliders);
  p.mesh.position.x = clamp(fixed.x, -228, 228);
  p.mesh.position.z = clamp(fixed.z, -178, 178);
}

// Reload countdown runs whether the player is on foot or driving, so
// re-pressing R in a car after a drive-by actually refills the magazine.
export function updateReload(G, dt) {
  const p = G.player;
  if (!p.reloading) return;
  p.reloadT -= dt;
  if (p.reloadT <= 0) {
    p.reloading = false;
    p.ammo = MAG_SIZE;
    G.hud.setHint('');
  }
}

// One hitscan shot from the camera centre. Returns the hit point and the
// vulture hit, if any. Creates a tracer + impact sparks for feedback.
export function shootOnce(G) {
  const p = G.player;
  if (p.reloading || p.ammo <= 0) {
    if (p.ammo <= 0 && !p.reloading) startReload(G);
    return null;
  }
  p.ammo -= 1;
  G.sounds.shot();
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: 0, y: 0 }, G.camera);
  ray.far = 70;
  const targets = [];
  for (const v of G.vultures) if (v.alive) targets.push(v.mesh);
  for (const c of G.cars.traffic) targets.push(c.mesh);
  for (const c of G.cars.parked) targets.push(c.mesh);
  for (const c of G.cars.police) targets.push(c.mesh);
  const hits = ray.intersectObjects(targets, true);
  let point = null;
  let vulture = null;
  if (hits.length > 0) {
    const h = hits[0];
    point = h.point.clone();
    let node = h.object;
    while (node && !node.userData.vulture) node = node.parent;
    if (node && node.userData.vulture) vulture = node.userData.vulture;
  } else {
    point = ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(60));
  }
  // Tracer from the gun (or the car) to the hit point.
  const from = p.inCar && p.car
    ? p.car.mesh.position.clone().add(new THREE.Vector3(0, 1.3, 0))
    : p.mesh.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  spawnTracer(G, from, point);
  spawnSparks(G, point);
  if (vulture) {
    const down = vulture.takeHit();
    G.hud.hitmarker();
    G.wanted.addHeat(6);
    if (down) {
      G.missions.onVultureDown();
      G.hud.toast('Vulture down!');
    }
  } else if (hits.length > 0) {
    G.wanted.addHeat(2);
  }
  if (p.ammo === 0) startReload(G);
  return { point, vulture };
}

export function startReload(G) {
  const p = G.player;
  if (p.reloading || p.ammo === MAG_SIZE) return;
  p.reloading = true;
  p.reloadT = RELOAD_TIME;
  G.hud.setHint('Reloading…');
}

export function spawnTracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xffe9a0, transparent: true, opacity: 0.9,
  }));
  G.scene.add(line);
  G.effects.tracers.push({ line, life: 0.09 });
}

export function spawnSparks(G, point) {
  const n = 10;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = point.x;
    pos[i * 3 + 1] = point.y;
    pos[i * 3 + 2] = point.z;
    vel.push(new THREE.Vector3(
      (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6
    ));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffc45a, size: 0.28, transparent: true, opacity: 1,
  }));
  G.scene.add(pts);
  G.effects.sparks.push({ pts, vel, life: 0.35 });
}

export function updateEffects(G, dt) {
  for (let i = G.effects.tracers.length - 1; i >= 0; i--) {
    const t = G.effects.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      G.scene.remove(t.line);
      t.line.geometry.dispose();
      G.effects.tracers.splice(i, 1);
    }
  }
  for (let i = G.effects.sparks.length - 1; i >= 0; i--) {
    const s = G.effects.sparks[i];
    s.life -= dt;
    const arr = s.pts.geometry.attributes.position.array;
    for (let j = 0; j < s.vel.length; j++) {
      arr[j * 3] += s.vel[j].x * dt;
      arr[j * 3 + 1] += s.vel[j].y * dt;
      arr[j * 3 + 2] += s.vel[j].z * dt;
      s.vel[j].y -= 12 * dt;
    }
    s.pts.geometry.attributes.position.needsUpdate = true;
    s.pts.material.opacity = Math.max(0, s.life / 0.35);
    if (s.life <= 0) {
      G.scene.remove(s.pts);
      s.pts.geometry.dispose();
      G.effects.sparks.splice(i, 1);
    }
  }
}

export function hurtPlayer(G, dmg, cause) {
  const p = G.player;
  if (p.hp <= 0) return;
  p.hp = Math.max(0, p.hp - dmg);
  G.hud.flashDamage();
  G.sounds.thud();
  if (p.hp <= 0) {
    G.state = 'wasted';
    G.hud.showWasted();
    G.sounds.stopEngine();
    G.sounds.siren(false);
  }
}
