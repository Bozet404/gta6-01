// The people of Solmara: pedestrians strolling the sidewalks, taxi
// customers waiting with a raised hand, and the Vultures gang holding the
// docks. Pedestrians wander their loops; Vultures stand their ground and
// shoot at the player when close.
import { makeRng, clamp, angDiff, dist2 } from './util.js';

function bodyMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.8, 0.34),
    new THREE.MeshLambertMaterial({ color: shirt })
  );
  torso.position.y = 1.05;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin })
  );
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.7, 0.24),
      new THREE.MeshLambertMaterial({ color: pants })
    );
    leg.position.set(s * 0.16, 0.35, 0);
    g.add(leg);
  }
  return g;
}

const SHIRTS = [0xd84a4a, 0x4a7fd8, 0x4ad87e, 0xe8c94a, 0x9a5fd8, 0xe8e2d2, 0x3a3f4a];
const SKINS = [0xe8b88a, 0xc98d5f, 0x8a5a3b, 0xf2c9a0];

export class Pedestrian {
  constructor(scene, loop, rng, startSeg = 0) {
    this.loop = loop;
    this.seg = startSeg % loop.length;
    this.speed = rng.range(1.1, 2.0);
    this.mesh = bodyMesh(rng.pick(SHIRTS), rng.pick([0x2c313a, 0x4a3b2c, 0x5a6a7a]), rng.pick(SKINS));
    const p = loop[this.seg];
    this.mesh.position.set(p.x, 0, p.z);
    this.heading = rng.range(0, Math.PI * 2);
    this.taxi = false;
    scene.add(this.mesh);
  }

  update(dt) {
    if (this.taxi) return; // waiting customers stand still, hand raised
    const target = this.loop[(this.seg + 1) % this.loop.length];
    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    if (Math.hypot(dx, dz) < 2) { this.seg = (this.seg + 1) % this.loop.length; return; }
    const want = Math.atan2(dx, dz);
    this.heading += clamp(angDiff(this.heading, want), -2.2 * dt, 2.2 * dt);
    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    // Simple walk bob.
    this.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.006 + this.seg)) * 0.05;
  }
}

// A Vulture: an armed gang member at the docks. Shoots when the player is
// near; three hits take him down.
export class Vulture {
  constructor(scene, x, z, rng) {
    this.mesh = bodyMesh(0x1e2226, 0x2c313a, rng.pick(SKINS));
    // Red bandana reads "gang" at a glance.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.12, 0.54),
      new THREE.MeshLambertMaterial({ color: 0xc22e2e })
    );
    band.position.y = 1.82;
    this.mesh.add(band);
    this.mesh.position.set(x, 0, z);
    this.heading = rng.range(0, Math.PI * 2);
    this.mesh.rotation.y = this.heading;
    this.hp = 3;
    this.alive = true;
    this.shootCd = rng.range(0.5, 1.5);
    scene.add(this.mesh);
  }

  // Returns 'hit' when a shot lands on the player, else null.
  update(dt, px, pz) {
    if (!this.alive) return null;
    const d = dist2(this.mesh.position.x, this.mesh.position.z, px, pz);
    this.mesh.rotation.y = Math.atan2(px - this.mesh.position.x, pz - this.mesh.position.z);
    if (d > 26) return null;
    this.shootCd -= dt;
    if (this.shootCd <= 0) {
      this.shootCd = 1.1 + Math.random() * 0.7;
      // Close shots land more often; long shots mostly miss.
      return Math.random() < (d < 12 ? 0.42 : 0.2) ? 'hit' : 'miss';
    }
    return null;
  }

  takeHit() {
    if (!this.alive) return false;
    this.hp -= 1;
    if (this.hp <= 0) {
      this.alive = false;
      this.mesh.visible = false;
      return true;
    }
    return false;
  }
}

export function spawnPedestrians(scene, walkLoops, rng, count = 24) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(new Pedestrian(scene, walkLoops[i % walkLoops.length], rng, Math.floor(i / walkLoops.length) + i));
  }
  return out;
}

// Taxi customers: a few pedestrians planted near the taxi stand, waiting.
export function spawnTaxiCustomers(scene, rng, spots) {
  const out = [];
  for (const [x, z] of spots) {
    const p = new Pedestrian(scene, [{ x, z }], rng, 0);
    p.taxi = true;
    // Raised hand: a small yellow marker above the head.
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xffd23b, emissive: 0xaa8800 })
    );
    mark.position.y = 2.3;
    p.mesh.add(mark);
    p.marker = mark;
    out.push(p);
  }
  return out;
}
