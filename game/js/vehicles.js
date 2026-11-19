// Cars of Solmara: box-built bodies with cabins, wheels and headlights,
// traffic that loops the city's ring roads, parked cars you can steal,
// and black-and-white police cruisers with flashing light bars.
import { makeRng, clamp, angDiff } from './util.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3fae6a, 0xd8d3c8, 0x7a4a9e, 0x22262e, 0xc26a2e];
const TAXI_COLOR = 0xf2c230;

export function makeCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.58, 2.1), glass);
  cabin.position.set(0, 1.12, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.6), paint);
    bed.position.set(0, 0.95, 1.3);
    g.add(bed);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf80 });
  for (const lx of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lampMat);
    lamp.position.set(lx, 0.62, 2.16);
    g.add(lamp);
  }
  g.userData.wheels = wheels;
  return g;
}

function policeBar(car) {
  const bar = new THREE.Group();
  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xff2a22, emissive: 0x881111 })
  );
  red.position.x = -0.35;
  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2255ff, emissive: 0x111188 })
  );
  blue.position.x = 0.35;
  bar.add(red); bar.add(blue);
  bar.position.set(0, 1.48, -0.25);
  car.add(bar);
  return { red, blue };
}

// A traffic car looping one rectangular route around the blocks.
export class TrafficCar {
  constructor(scene, loop, rng, offset) {
    this.loop = loop;
    this.seg = 0;
    this.speed = rng.range(7, 11);
    this.mesh = makeCarMesh(rng.pick(CAR_COLORS), rng.chance(0.18) ? 'truck' : 'sedan');
    const p = loop[offset % loop.length];
    this.mesh.position.set(p.x, 0, p.z);
    this.heading = 0;
    scene.add(this.mesh);
    this.mesh.userData.car = this;
  }

  update(dt) {
    const target = this.loop[(this.seg + 1) % this.loop.length];
    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) { this.seg = (this.seg + 1) % this.loop.length; return; }
    const want = Math.atan2(dx, dz);
    let dh = angDiff(this.heading, want);
    this.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
    this.mesh.position.x += Math.sin(this.heading) * this.speed * dt;
    this.mesh.position.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.rotation.y = this.heading;
    const spin = this.speed * dt / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }
}

// A parked car: static, enterable, no wanted when taken.
export class ParkedCar {
  constructor(scene, x, z, heading, color) {
    this.mesh = makeCarMesh(color, 'sedan');
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.heading = heading;
    this.taken = false;
    scene.add(this.mesh);
    this.mesh.userData.car = this;
  }
}

// A police cruiser. Driving is steered by police.js; this class only owns
// the mesh, the light bar flash and the siren-distance helper.
export class PoliceCar {
  constructor(scene, x, z) {
    this.mesh = makeCarMesh(0x1c1f26, 'sedan');
    // White doors read "police" at a glance: paint the cabin roof white.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.72, 0.1, 2.0),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
    );
    roof.position.set(0, 1.42, -0.25);
    this.mesh.add(roof);
    this.bar = policeBar(this.mesh);
    this.mesh.position.set(x, 0, z);
    this.heading = 0;
    this.speed = 0;
    this.flashT = 0;
    scene.add(this.mesh);
    this.mesh.userData.car = this;
  }

  update(dt, chasing) {
    this.flashT += dt;
    const on = Math.floor(this.flashT * 6) % 2 === 0;
    this.bar.red.material.emissive.setHex(on ? 0xff2211 : 0x330000);
    this.bar.blue.material.emissive.setHex(on ? 0x110033 : 0x2233ff);
    if (chasing) {
      const spin = this.speed * dt / 0.36;
      for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    }
  }
}

export function spawnTraffic(scene, loops, rng, count = 14) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    cars.push(new TrafficCar(scene, loops[i % loops.length], rng, Math.floor(i / loops.length)));
  }
  return cars;
}

export function spawnParked(scene, rng) {
  const spots = [
    [-45, -40, 0], [-45, 40, Math.PI], [45, -40, Math.PI / 2], [45, 40, -Math.PI / 2],
    [135, -40, 0], [-135, 40, Math.PI], [90, 112, Math.PI / 2], [-90, -112, 0],
  ];
  const out = [];
  for (const [x, z, h] of spots) {
    const col = rng.chance(0.25) ? TAXI_COLOR : rng.pick(CAR_COLORS);
    out.push(new ParkedCar(scene, x + rng.range(-1, 1), z + rng.range(-1, 1), h, col));
  }
  return out;
}
