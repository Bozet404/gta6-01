// SOLMARA — pedestrians: sidewalk walkers who flee gunfire, plus the taxi
// side job (a waving ped pays for a ride) and cash pickups on the street.
SOL.peds = {
  pedGeo: null, headGeo: null,
  initShared() {
    if (this.pedGeo) return;
    this.pedGeo = new THREE.CylinderGeometry(0.32, 0.42, 1.7, 8);
    this.headGeo = new THREE.SphereGeometry(0.3, 10, 8);
  },
  makePed(color, shirt) {
    this.initShared();
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.pedGeo, new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 0.85; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(this.headGeo, new THREE.MeshLambertMaterial({ color }));
    head.position.y = 1.95; head.castShadow = true; g.add(head);
    const ped = {
      group: g, x: 0, z: 0, heading: 0, speed: 1.4, state: 'walk',
      target: null, fleeTimer: 0, isFare: false, farePaid: false,
    };
    g.traverse((o) => { o.userData.pedRef = ped; });
    return ped;
  },
  spawn(n, seed) {
    const rng = SOL.util.mulberry32(seed + 913);
    const U = SOL.util;
    const skins = [0xe8b88a, 0xc98d64, 0x8a5a3b, 0xf0c8a0];
    const shirts = [0xd23c2e, 0x2e7dd2, 0xf2b01e, 0x2ed27a, 0x8a4fd2, 0xe8e8e8, 0xff7a1a];
    for (let i = 0; i < n; i++) {
      const p = this.makePed(U.pick(skins), U.pick(shirts));
      const road = U.pick(SOL.city.ROADS);
      const onX = rng() < 0.5;
      const x = onX ? U.rand(-180, 180) : road + U.pick([-6, 6]);
      const z = onX ? road + U.pick([-6, 6]) : U.rand(-180, 180);
      p.x = x; p.z = z; p.heading = rng() * Math.PI * 2;
      p.group.position.set(x, 0, z);
      p.target = SOL.city.nearestNode(x + U.rand(-50, 50), z + U.rand(-50, 50));
      SOL.G.scene.add(p.group);
      SOL.G.peds.push(p);
    }
  },
  // A ped near (x,z) panics and runs away from (sx,sz).
  scare(x, z, radius) {
    for (const p of SOL.G.peds) {
      if (SOL.util.dist2(p.x, p.z, x, z) < radius) {
        p.state = 'flee'; p.fleeTimer = 3;
        p.heading = Math.atan2(p.z - z, p.x - x);
      }
    }
  },
  update(dt) {
    const U = SOL.util, G = SOL.G;
    for (const p of G.peds) {
      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        p.speed = 4.2;
        if (p.fleeTimer <= 0) { p.state = 'walk'; p.speed = 1.4; }
      } else {
        p.speed = 1.4;
        if (!p.target) p.target = SOL.city.nearestNode(p.x + U.rand(-50, 50), p.z + U.rand(-50, 50));
        const dx = p.target.x - p.x, dz = p.target.z - p.z;
        if (Math.sqrt(dx * dx + dz * dz) < 3) {
          p.target = SOL.city.nearestNode(p.x + U.rand(-60, 60), p.z + U.rand(-60, 60));
        } else {
          p.heading = U.angLerp(p.heading, Math.atan2(dz, dx), Math.min(1, 4 * dt));
        }
      }
      let nx = p.x + Math.cos(p.heading) * p.speed * dt;
      let nz = p.z + Math.sin(p.heading) * p.speed * dt;
      const fixed = SOL.city.collide(nx, nz, 0.5);
      p.x = fixed.x; p.z = fixed.z;
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = -p.heading + Math.PI / 2;
      // Little walk bob.
      p.group.position.y = Math.abs(Math.sin(G.time * 8 + p.x)) * 0.06 * (p.speed / 1.4);
      // Waving fare ped: bob the arm is faked by a bobbing head scale.
      if (p.isFare) p.group.position.y += Math.abs(Math.sin(G.time * 5)) * 0.25;
    }
    this.updateTaxi(dt);
  },
  // --- Taxi job: one waving ped at a time; drive them to the marker.
  startFare() {
    const G = SOL.G, U = SOL.util;
    if (G.taxi) return;
    const candidates = G.peds.filter((p) => !p.isFare);
    if (!candidates.length) return;
    const ped = U.pick(candidates);
    ped.isFare = true;
    const dest = SOL.city.nearestNode(U.rand(-170, 170), U.rand(-170, 170));
    G.taxi = { ped, dest, state: 'pickup', pay: U.randi(40, 80) };
    SOL.hud.say(`Taxi! Pick up the waving customer, then drive them to the marker. Fare $${G.taxi.pay}.`);
  },
  updateTaxi(dt) {
    const G = SOL.G, U = SOL.util;
    const t = G.taxi;
    if (!t) return;
    if (t.state === 'pickup') {
      const d = U.dist2(G.player.x, G.player.z, t.ped.x, t.ped.z);
      if (d < 4) {
        t.state = 'dropoff';
        t.ped.group.visible = false;
        SOL.hud.say(`Customer aboard — drive to the yellow marker.`);
        SOL.missions.setMarker(t.dest.x, t.dest.z);
      }
    } else if (t.state === 'dropoff') {
      const d = U.dist2(G.player.x, G.player.z, t.dest.x, t.dest.z);
      if (d < 6) {
        G.money += t.pay; G.stats.fares++;
        SOL.hud.say(`Fare complete! +$${t.pay}`);
        SOL.audio.cash();
        const idx = G.peds.indexOf(t.ped);
        if (idx >= 0) G.peds.splice(idx, 1);
        G.scene.remove(t.ped.group);
        G.taxi = null;
        SOL.missions.clearMarker();
        setTimeout(() => this.startFare(), 12000);
      }
    }
  },
  spawnPickups() {
    const U = SOL.util;
    const geo = new THREE.BoxGeometry(0.9, 0.25, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, mat);
      const x = U.rand(-170, 170), z = U.rand(-170, 170);
      m.position.set(x, 0.5, z);
      m.rotation.y = U.rand(0, Math.PI);
      SOL.G.scene.add(m);
      SOL.G.pickups.push({ mesh: m, x, z, taken: false });
    }
  },
  updatePickups(dt) {
    const G = SOL.G;
    for (const p of G.pickups) {
      if (p.taken) continue;
      p.mesh.rotation.y += dt * 1.5;
      p.mesh.position.y = 0.5 + Math.sin(G.time * 2 + p.x) * 0.15;
      if (SOL.util.dist2(G.player.x, G.player.z, p.x, p.z) < 2.2) {
        p.taken = true; p.mesh.visible = false;
        G.money += 25;
        SOL.hud.say('Cash pickup! +$25');
        SOL.audio.cash();
      }
    }
  },
};
