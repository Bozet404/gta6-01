// Solmara itself: a sun-soaked coastal city built from a seeded grid.
// Districts: glassy Downtown towers in the middle, brick Midtown around them,
// white Palmera beachfront on the east, rusty Harbor warehouses and docks south,
// and the Old Plaza with its fountain. Exports colliders, traffic loops,
// pedestrian loops and the named places missions use.
import { makeRng, clamp } from './util.js';

const WORLD = { x0: -230, x1: 230, z0: -180, z1: 180 };

function facadeTexture(base, lit, rng) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 12) {
    for (let x = 6; x < 56; x += 10) {
      g.fillStyle = rng.chance(0.28) ? lit : 'rgba(20,28,40,0.85)';
      g.fillRect(x, y, 6, 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sunSprite() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,246,200,1)');
  grad.addColorStop(0.25, 'rgba(255,214,120,0.85)');
  grad.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(90, 90, 1);
  return s;
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky, light, fog -------------------------------------------------
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xa8d0e8, 260, 620);
  const sun = new THREE.DirectionalLight(0xfff1c4, 2.4);
  sun.position.set(140, 190, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a6b46, 1.15));
  const glow = sunSprite();
  glow.position.set(330, 210, 120);
  scene.add(glow);

  // ---- ground, sea, beach ----------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 560),
    new THREE.MeshLambertMaterial({ color: 0x9aa06b })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(60, -0.05, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 560),
    new THREE.MeshLambertMaterial({ color: 0x1f7fb8, transparent: true, opacity: 0.94 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(360, 0.02, 0);
  group.add(sea);
  const foam = [];
  for (let i = 0; i < 10; i++) {
    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 60),
      new THREE.MeshLambertMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.55 })
    );
    f.rotation.x = -Math.PI / 2;
    f.position.set(232 + rng.range(0, 8), 0.06, -220 + i * 48);
    group.add(f);
    foam.push(f);
  }
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 380),
    new THREE.MeshLambertMaterial({ color: 0xe8d29a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(216, 0.0, 0);
  sand.receiveShadow = true;
  group.add(sand);

  // ---- roads ------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33383f });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb9b2a0 });
  const avenues = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  const streets = [-135, -90, -45, 0, 45, 90, 135];
  const roadOf = (w, l, x, z, lift) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.01 + lift, z);
    r.receiveShadow = true;
    group.add(r);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w + 6, l + 6), walkMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.0 + lift, z);
    s.receiveShadow = true;
    group.add(s);
  };
  for (const x of avenues) roadOf(9, 380, x, 0, 0);
  for (const z of streets) roadOf(480, 9, 0, z, 0.004);

  // ---- buildings --------------------------------------------------------
  const facades = [
    facadeTexture('#5b7fa6', '#ffd98a', rng),
    facadeTexture('#8a6f56', '#ffe9b0', rng),
    facadeTexture('#7d8a96', '#cfe8ff', rng),
    facadeTexture('#a67c52', '#ffe2a0', rng),
  ];
  const facadeMats = facades.map((t) => new THREE.MeshLambertMaterial({ map: t }));
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
  const rustMat = new THREE.MeshLambertMaterial({ color: 0x8a4f38 });
  const goldMat = new THREE.MeshLambertMaterial({ color: 0xc9a13b });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const addBuilding = (cx, cz, w, h, d, mat) => {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(cx, h / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
    return m;
  };

  const blockXs = [-157, -112, -67, -22, 22, 67, 112, 157];
  const blockZs = [-112, -67, -22, 22, 67, 112];
  for (const bx of blockXs) {
    for (const bz of blockZs) {
      // The Old Plaza stays open.
      if (bx === -67 && bz === -22) continue;
      const downtown = Math.abs(bx) < 95 && Math.abs(bz) < 95;
      const beach = bx > 150;
      const h = downtown ? rng.range(34, 72) : beach ? rng.range(7, 14) : rng.range(9, 24);
      const w = rng.range(20, 30);
      const d = rng.range(20, 30);
      const mat = beach ? whiteMat : facadeMats[rng.int(0, 3)];
      addBuilding(bx + rng.range(-2, 2), bz + rng.range(-2, 2), w, h, d, mat);
      if (!downtown && rng.chance(0.5)) {
        addBuilding(bx + rng.range(-8, 8), bz + rng.range(-8, 8), rng.range(10, 16), rng.range(5, 10), rng.range(10, 16), mat);
      }
    }
  }

  // Meridian Bank: the gold tower job 5 hits.
  addBuilding(22, -22, 34, 46, 30, goldMat);
  // Harbor warehouses (south edge) + containers.
  for (let i = 0; i < 5; i++) {
    addBuilding(-150 + i * 72, 158, 44, rng.range(9, 13), 22, rustMat);
  }
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: rng.pick([0x3f6d8a, 0xa8542f, 0x5d7a45, 0x8a3f4d]) }));
    c.scale.set(12, 3, 3.4);
    c.position.set(-180 + i * 46 + rng.range(-6, 6), 1.5, 172);
    c.castShadow = true;
    group.add(c);
    colliders.push({ x0: c.position.x - 6, x1: c.position.x + 6, z0: 170.3, z1: 173.7 });
  }
  // Docks platform.
  const docks = new THREE.Mesh(
    new THREE.BoxGeometry(430, 1.2, 26),
    new THREE.MeshLambertMaterial({ color: 0x6b5d4f })
  );
  docks.position.set(0, 0.6, 168);
  docks.receiveShadow = true;
  group.add(docks);

  // Old Plaza: fountain + benches.
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x9fb4c0 })
  );
  fountain.position.set(-67, 0.7, -22);
  fountain.castShadow = true;
  group.add(fountain);
  colliders.push({ x0: -75, x1: -59, z0: -30, z1: -14 });
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x3fa8d8 })
  );
  water.position.set(-67, 1.5, -22);
  group.add(water);
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7a5c38 }));
    bench.scale.set(4, 0.8, 1.2);
    bench.position.set(-67 + (i % 2 === 0 ? -12 : 12), 0.4, -22 + (i < 2 ? -10 : 10));
    group.add(bench);
  }

  // Palms along the beach and plaza.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const palm = (x, z) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 7, 6), trunkMat);
    t.position.set(x, 3.5, z);
    t.castShadow = true;
    group.add(t);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(2.4, 6, 4), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.scale.set(1.6, 0.35, 0.7);
      leaf.position.set(x + Math.cos(a) * 2.2, 7.2, z + Math.sin(a) * 2.2);
      leaf.rotation.y = -a;
      group.add(leaf);
    }
  };
  for (let z = -160; z <= 160; z += 32) palm(206, z);
  palm(-80, -34); palm(-54, -10); palm(-80, -10); palm(-54, -34);

  // Street lamps.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf80 });
  for (const x of [-90, 0, 90]) {
    for (const z of [-90, 0, 90]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6, 6), lampMat);
      pole.position.set(x + 6, 3, z + 6);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
      bulb.position.set(x + 6, 6.2, z + 6);
      group.add(bulb);
    }
  }

  // Drifting dust motes in the sun (warm haze over the city).
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i++) {
    dustPos[i * 3] = rng.range(-220, 220);
    dustPos[i * 3 + 1] = rng.range(2, 26);
    dustPos[i * 3 + 2] = rng.range(-170, 170);
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffdf9e, size: 0.7, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  group.add(dust);

  // Traffic loops: rectangles around block groups, on the roads.
  const loop = (x0, z0, x1, z1) => [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
  ];
  const loops = [
    loop(-90, -90, 90, 90),       // downtown ring
    loop(-180, -135, 180, -45),   // north crosstown
    loop(-180, 45, 180, 135),     // south crosstown
    loop(180, -135, 180, 135),    // beachfront avenue
    loop(-180, 135, 180, 135),    // harbor road
  ];
  // Pedestrian wander rectangles (sidewalks, inset from roads).
  const walkLoops = [
    loop(-84, -84, 84, 84),
    loop(-174, -129, 174, -51),
    loop(-174, 51, 174, 129),
    loop(186, -129, 196, 129),
  ];

  return {
    world: WORLD,
    colliders,
    loops,
    walkLoops,
    places: {
      plaza: { x: -67, z: -40 },
      beach: { x: 208, z: 20 },
      harbor: { x: 0, z: 150 },
      downtown: { x: 22, z: -40 },
      bank: { x: 22, z: -42 },
      safehouse: { x: -160, z: 120 },
      docks: { x: -40, z: 158 },
      taxiStand: { x: -45, z: 45 },
    },
    update(dt, t) {
      for (const f of foam) f.position.x = 232 + Math.sin(t * 0.5 + f.position.z * 0.05) * 2.5;
      dust.rotation.y = t * 0.004;
      dust.position.y = Math.sin(t * 0.12) * 0.8;
    },
  };
}
