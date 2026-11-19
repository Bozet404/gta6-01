// SOLMARA — city: a sun-soaked coastal grid city, built procedurally from a
// seed. Roads, buildings, palms, beach and sea, plus the road graph that the
// traffic AI drives on and the collision boxes everything respects.
SOL.city = {
  colliders: [], graph: null, spots: {}, seaMesh: null, glare: null,
  ROADS: [-176, -132, -88, -44, 0, 44, 88, 132, 176],
  build(scene, seed) {
    const rng = SOL.util.mulberry32(seed);
    const U = SOL.util;
    this.colliders = [];
    // Bright midday sun + sky.
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
    sun.position.set(120, 180, 60); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
    sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
    sun.shadow.camera.far = 520; sun.shadow.bias = -0.0004;
    scene.add(sun);
    SOL.G.sun = sun; // kept for the adaptive-quality scaler in main.js
    scene.add(new THREE.AmbientLight(0xbfd9ff, 0.55));
    scene.add(new THREE.HemisphereLight(0x9fd4ff, 0xffd9a0, 0.5));
    scene.fog = new THREE.Fog(0xcfe8f5, 260, 620);
    // Ground: warm urban sand base.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshLambertMaterial({ color: 0xcbb98f }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    // Sea to the west, animated in update().
    const seaTex = U.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#1d7fb8'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        g.beginPath(); const y = 8 + i * 14 + rng() * 5;
        g.moveTo(0, y); g.bezierCurveTo(30, y - 5, 70, y + 5, 128, y); g.stroke();
      }
    }, [10, 10]);
    this.seaMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 560),
      new THREE.MeshLambertMaterial({ map: seaTex, transparent: true, opacity: 0.94 }));
    this.seaMesh.rotation.x = -Math.PI / 2;
    this.seaMesh.position.set(-245, 0.15, 0);
    this.seaMesh.userData.tex = seaTex;
    scene.add(this.seaMesh);
    // Beach sand strip.
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(22, 560),
      new THREE.MeshLambertMaterial({ color: 0xe8d49a }));
    beach.rotation.x = -Math.PI / 2; beach.position.set(-189, 0.1, 0);
    beach.receiveShadow = true; scene.add(beach);
    // Roads: dark asphalt strips with a dashed centre line.
    const roadTex = U.canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#33363b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8c33c'; g.fillRect(w / 2 - 2, 0, 4, 26);
      g.fillStyle = '#e8c33c'; g.fillRect(w / 2 - 2, 128, 4, 26);
      g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(2, 0, 2, h); g.fillRect(w - 4, 0, 2, h);
    }, [1, 22]);
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    const roadGeoX = new THREE.PlaneGeometry(400, 8);
    const roadGeoZ = new THREE.PlaneGeometry(8, 400);
    for (const c of this.ROADS) {
      const rx = new THREE.Mesh(roadGeoX, roadMat);
      rx.rotation.x = -Math.PI / 2; rx.position.set(0, 0.05, c); rx.receiveShadow = true; scene.add(rx);
      const rz = new THREE.Mesh(roadGeoZ, roadMat);
      rz.rotation.x = -Math.PI / 2; rz.position.set(c, 0.05, 0); rz.receiveShadow = true; scene.add(rz);
    }
    // Buildings: shared geometry, canvas window textures, warm palette.
    const palette = [0xe8b48a, 0xf2d3a0, 0xd98f6a, 0x9fc4d8, 0xe6e0d2, 0xc9a06a, 0x8fb8a8];
    const texCache = {};
    const winTex = (base, lit) => {
      const key = base + '|' + lit;
      if (texCache[key]) return texCache[key];
      const t = U.canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let y = 10; y < h - 12; y += 22) for (let x = 10; x < w - 12; x += 20) {
          g.fillStyle = rng() < lit ? '#ffe9a8' : '#27405a';
          g.fillRect(x, y, 12, 14);
        }
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - 18, w, 18);
      });
      texCache[key] = t; return t;
    };
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const mkBuilding = (x, z, w, d, hgt, color) => {
      const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ map: winTex(color, 0.28) }));
      m.scale.set(w, hgt, d); m.position.set(x, hgt / 2, z);
      m.castShadow = true; m.receiveShadow = true; scene.add(m);
      this.colliders.push({ x1: x - w / 2, z1: z - d / 2, x2: x + w / 2, z2: z + d / 2 });
      // Flat roof cap in a contrasting tone.
      const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6a5a48 }));
      roof.scale.set(w + 0.6, 0.5, d + 0.6); roof.position.set(x, hgt + 0.25, z);
      scene.add(roof);
    };
    const downtown = (x, z) => Math.abs(x) < 90 && Math.abs(z) < 90;
    for (let ix = 0; ix < 8; ix++) for (let iz = 0; iz < 8; iz++) {
      const bx = -154 + ix * 44, bz = -154 + iz * 44;
      const n = rng() < 0.3 ? 1 : (rng() < 0.6 ? 2 : 3);
      for (let k = 0; k < n; k++) {
        const w = U.rand(14, 22), d = U.rand(14, 22);
        const x = bx + U.rand(-6, 6) + (k % 2) * 8 - 4;
        const z = bz + U.rand(-6, 6) + Math.floor(k / 2) * 10 - 5;
        const hgt = downtown(x, z) ? U.rand(18, 44) : U.rand(7, 20);
        mkBuilding(x, z, w, d, hgt, '#' + U.pick(palette).toString(16).padStart(6, '0'));
      }
    }
    // Solmara Tower — the landmark, dead centre.
    mkBuilding(0, -66, 30, 30, 58, '#9fc4d8');
    // Palm trees: trunk + foliage, shared geometry.
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
    const leafGeo = new THREE.ConeGeometry(3.2, 5, 7);
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f9e44 });
    const palm = (x, z) => {
      const t = new THREE.Mesh(trunkGeo, trunkMat);
      t.position.set(x, 3.5, z); t.castShadow = true; scene.add(t);
      const l = new THREE.Mesh(leafGeo, leafMat);
      l.position.set(x, 8.6, z); l.castShadow = true; scene.add(l);
      this.colliders.push({ x1: x - 0.7, z1: z - 0.7, x2: x + 0.7, z2: z + 0.7 });
    };
    for (let z = -180; z <= 180; z += 22) { palm(-184, z + U.rand(-3, 3)); if (rng() < 0.5) palm(186, z); }
    for (let i = 0; i < 26; i++) palm(U.rand(-170, 180), U.pick(this.ROADS) + U.rand(6, 9) * (rng() < 0.5 ? 1 : -1));
    // Street lamps along the main avenue.
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 5);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const bulbGeo = new THREE.SphereGeometry(0.5, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (const c of [-88, 0, 88]) for (let v = -176; v <= 176; v += 44) {
      const p = new THREE.Mesh(poleGeo, poleMat); p.position.set(c + 5, 3, v); scene.add(p);
      const b = new THREE.Mesh(bulbGeo, bulbMat); b.position.set(c + 5, 6.2, v); scene.add(b);
    }
    // Sun glare sprite — the midday shine the cover shot wants.
    const glareTex = U.canvasTex(128, 128, (g, w, h) => {
      const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255,250,220,1)'); grad.addColorStop(0.35, 'rgba(255,220,130,.55)');
      grad.addColorStop(1, 'rgba(255,220,130,0)');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
    });
    this.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glareTex, transparent: true, depthTest: false, opacity: 0.85 }));
    this.glare.scale.set(90, 90, 1); this.glare.position.set(150, 150, -260);
    scene.add(this.glare);
    // Named spots the missions and menus use.
    this.spots = {
      docks: { x: 188, z: -44, label: 'Solmara Docks' },
      hideout: { x: -150, z: 150, label: 'Rio\u2019s Hideout' },
      lot: { x: 110, z: -150, label: 'Marina Car Lot' },
      hospital: { x: -44, z: 176, label: 'Solmara General' },
      plaza: { x: 0, z: 0, label: 'Plaza del Sol' },
      tower: { x: 0, z: -66, label: 'Solmara Tower' },
      beach: { x: -186, z: 44, label: 'Playa Sol' },
    };
    // Road graph: intersections of the road grid.
    const nodes = [];
    for (const x of this.ROADS) for (const z of this.ROADS) nodes.push({ x, z });
    this.graph = { nodes, roads: this.ROADS };
    return this;
  },
  // Nearest road-graph node to (x,z).
  nearestNode(x, z) {
    let best = null, bd = 1e9;
    for (const n of this.graph.nodes) {
      const d = SOL.util.dist2(x, z, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  },
  // Resolve a circle against every building collider. Returns corrected {x,z}.
  collide(x, z, r) {
    let px = x, pz = z;
    for (const b of this.colliders) {
      const out = SOL.util.circleVsAABB(px, pz, r, b);
      if (out) { px = out.x; pz = out.z; }
    }
    px = SOL.util.clamp(px, -196, 196); pz = SOL.util.clamp(pz, -196, 196);
    return { x: px, z: pz };
  },
  update(dt, t) {
    if (this.seaMesh) {
      this.seaMesh.userData.tex.offset.y = (t * 0.02) % 1;
      this.seaMesh.position.y = 0.15 + Math.sin(t * 0.7) * 0.08;
    }
  },
};
