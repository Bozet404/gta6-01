// SOLMARA — vehicles: car factory, arcade driving, traffic AI on the road
// graph, and police pursuit. Cars are box assemblies with shared geometry.
SOL.vehicles = {
  CAR_COLORS: [0xd23c2e, 0x2e7dd2, 0xf2b01e, 0x2ed27a, 0x8a4fd2, 0xe8e8e8, 0x222831, 0xff7a1a, 0x19b8b8],
  bodyGeo: null, cabinGeo: null, wheelGeo: null,
  initShared() {
    if (this.bodyGeo) return;
    this.bodyGeo = new THREE.BoxGeometry(4.4, 0.9, 2.0);
    this.cabinGeo = new THREE.BoxGeometry(2.4, 0.75, 1.8);
    this.wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
    this.wheelGeo.rotateX(Math.PI / 2);
  },
  makeCar(color, isCop) {
    this.initShared();
    const g = new THREE.Group();
    const paint = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(this.bodyGeo, paint);
    body.position.y = 0.75; body.castShadow = true; g.add(body);
    const cabinMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x14181d : 0x1c2733 });
    const cabin = new THREE.Mesh(this.cabinGeo, cabinMat);
    cabin.position.set(-0.25, 1.5, 0); cabin.castShadow = true; g.add(cabin);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const wheels = [];
    for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
      const w = new THREE.Mesh(this.wheelGeo, wheelMat);
      w.position.set(wx, 0.42, wz); g.add(w); wheels.push(w);
    }
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    for (const wz of [0.7, -0.7]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.4), lightMat);
      h.position.set(2.22, 0.8, wz); g.add(h);
    }
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    for (const wz of [0.7, -0.7]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.4), tailMat);
      t.position.set(-2.22, 0.8, wz); g.add(t);
    }
    if (isCop) {
      const barR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
      barR.position.set(-0.25, 2.0, 0.45); g.add(barR);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.7), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
      barB.position.set(-0.25, 2.0, -0.45); g.add(barB);
      g.userData.barR = barR; g.userData.barB = barB;
    }
    g.userData.wheels = wheels;
    const car = {
      group: g, x: 0, z: 0, heading: 0, speed: 0, hp: 100,
      color, isCop: !!isCop, parked: false, isPlayer: false,
      targetNode: null, cruise: 10, stuckTimer: 0, reverseTimer: 0, flash: 0,
    };
    g.traverse((o) => { o.userData.carRef = car; });
    return car;
  },
  place(car, x, z, heading) {
    car.x = x; car.z = z; car.heading = heading;
    car.group.position.set(x, 0, z);
    car.group.rotation.y = -heading;
    SOL.G.scene.add(car.group);
    return car;
  },
  spawnTraffic(n, seed) {
    const rng = SOL.util.mulberry32(seed + 77);
    const U = SOL.util;
    for (let i = 0; i < n; i++) {
      const node = U.pick(SOL.city.graph.nodes);
      const car = this.makeCar(U.pick(this.CAR_COLORS), false);
      const along = U.pick(SOL.city.ROADS);
      const onXRoad = rng() < 0.5;
      const x = onXRoad ? U.rand(-180, 180) : along;
      const z = onXRoad ? along : U.rand(-180, 180);
      this.place(car, x, z, rng() * Math.PI * 2);
      car.cruise = U.rand(8, 12);
      car.targetNode = SOL.city.nearestNode(x + U.rand(-30, 30), z + U.rand(-30, 30));
      SOL.G.traffic.push(car);
    }
    // A few parked cars at curbs — free to steal, no heat.
    for (let i = 0; i < 6; i++) {
      const road = U.pick(SOL.city.ROADS);
      const car = this.makeCar(U.pick(this.CAR_COLORS), false);
      const onXRoad = rng() < 0.5;
      const x = onXRoad ? U.rand(-170, 170) : road + 5.4;
      const z = onXRoad ? road + 5.4 : U.rand(-170, 170);
      this.place(car, x, z, onXRoad ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
      car.parked = true; car.cruise = 0;
      SOL.G.traffic.push(car);
    }
  },
  spawnCop(x, z) {
    const car = this.makeCar(0xf2f2f2, true);
    this.place(car, x, z, Math.atan2(-(SOL.G.player.x - x), SOL.G.player.z - z) + Math.PI / 2);
    car.cruise = 17;
    SOL.G.cops.push(car);
    return car;
  },
  // Nearest drivable car to (x,z) within maxDist (player car excluded).
  nearestCar(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const c of SOL.G.traffic) {
      const d = SOL.util.dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  },
  // Player takes a car: it leaves traffic and becomes the player car.
  steal(car) {
    const idx = SOL.G.traffic.indexOf(car);
    if (idx >= 0) SOL.G.traffic.splice(idx, 1);
    car.isPlayer = true; car.parked = false;
    SOL.G.playerCar = car;
    SOL.G.stats.carsStolen++;
    return car;
  },
  leaveCar(car) {
    car.isPlayer = false;
    SOL.G.traffic.push(car);
    SOL.G.playerCar = null;
  },
  damageCar(car, amount) {
    car.hp -= amount;
    if (car.hp <= 0 && car.isPlayer) {
      car.hp = 0;
      SOL.G.playerCar = null; car.isPlayer = false;
      SOL.G.traffic.push(car);
      SOL.player.ejectFromWreck(car);
    }
  },
  update(dt) {
    const U = SOL.util, G = SOL.G;
    // --- Player car physics (arcade): W accel, S brake/reverse, A/D steer.
    const pc = G.playerCar;
    if (pc) {
      const inp = SOL.input;
      const fwd = inp.down('KeyW') || inp.down('ArrowUp');
      const back = inp.down('KeyS') || inp.down('ArrowDown');
      const left = inp.down('KeyA') || inp.down('ArrowLeft');
      const right = inp.down('KeyD') || inp.down('ArrowRight');
      const hand = inp.down('Space');
      const topSpeed = 42, accel = 16, brake = 34, drag = 6;
      if (fwd) pc.speed += accel * dt;
      if (back) pc.speed -= (pc.speed > 0.5 ? brake : 13) * dt;
      if (!fwd && !back) pc.speed -= Math.sign(pc.speed) * Math.min(Math.abs(pc.speed), drag * dt);
      if (hand) { pc.speed -= Math.sign(pc.speed) * Math.min(Math.abs(pc.speed), 26 * dt); if (Math.abs(pc.speed) > 6) SOL.audio.skid(); }
      pc.speed = U.clamp(pc.speed, -13, topSpeed);
      const steer = (left ? 1 : 0) - (right ? 1 : 0);
      const steerAuthority = U.clamp(Math.abs(pc.speed) / 10, 0, 1) * (pc.speed >= 0 ? 1 : -1);
      pc.heading += steer * 1.9 * steerAuthority * dt * (hand ? 1.5 : 1);
      const nx = pc.x + Math.cos(pc.heading) * pc.speed * dt;
      const nz = pc.z + Math.sin(pc.heading) * pc.speed * dt;
      const fixed = SOL.city.collide(nx, nz, 2.3);
      if (fixed.x !== nx || fixed.z !== nz) {
        if (Math.abs(pc.speed) > 8) { this.damageCar(pc, Math.abs(pc.speed) * 0.5); SOL.audio.noise(0.2, 0.25, 700); }
        pc.speed *= 0.55;
      }
      pc.x = fixed.x; pc.z = fixed.z;
      pc.group.position.set(pc.x, 0, pc.z);
      pc.group.rotation.y = -pc.heading;
      // Wheel spin + front steer.
      for (const w of pc.group.userData.wheels) w.rotation.z -= pc.speed * dt / 0.42;
      pc.group.userData.wheels[0].rotation.y = steer * 0.32;
      pc.group.userData.wheels[1].rotation.y = steer * 0.32;
      SOL.audio.setEngine(Math.abs(pc.speed) / topSpeed, true);
    } else {
      SOL.audio.setEngine(0, false);
    }
    // --- Traffic: follow the road graph, stop for the car ahead.
    for (const c of G.traffic) {
      if (c.parked) continue;
      if (!c.targetNode) c.targetNode = SOL.city.nearestNode(c.x + 20, c.z);
      const dx = c.targetNode.x - c.x, dz = c.targetNode.z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 3) {
        // Pick a neighbouring intersection (same road, one step away).
        const opts = SOL.city.graph.nodes.filter((n) =>
          (n.x === c.targetNode.x && Math.abs(n.z - c.targetNode.z) === 44) ||
          (n.z === c.targetNode.z && Math.abs(n.x - c.targetNode.x) === 44));
        c.targetNode = opts.length ? U.pick(opts) : SOL.city.nearestNode(c.x + U.rand(-40, 40), c.z + U.rand(-40, 40));
        continue;
      }
      const want = Math.atan2(dz, dx);
      c.heading = U.angLerp(c.heading, want, Math.min(1, 3.2 * dt));
      // Stop if something is right ahead.
      let blocked = false;
      for (const o of [...G.traffic, ...G.cops, ...(pc ? [pc] : [])]) {
        if (o === c) continue;
        const ox = o.x - c.x, oz = o.z - c.z;
        const along = ox * Math.cos(c.heading) + oz * Math.sin(c.heading);
        const side = Math.abs(-ox * Math.sin(c.heading) + oz * Math.cos(c.heading));
        if (along > 0 && along < 10 && side < 2.6) { blocked = true; break; }
      }
      const target = blocked ? 0 : c.cruise;
      c.speed = U.lerp(c.speed, target, Math.min(1, 2 * dt));
      c.x += Math.cos(c.heading) * c.speed * dt;
      c.z += Math.sin(c.heading) * c.speed * dt;
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = -c.heading;
      for (const w of c.group.userData.wheels) w.rotation.z -= c.speed * dt / 0.42;
    }
    // --- Police pursuit: steer at the player, ram, flash the light bar.
    for (const cop of G.cops) {
      const px = G.player.x, pz = G.player.z;
      const dx = px - cop.x, dz = pz - cop.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const want = Math.atan2(dz, dx);
      cop.heading = U.angLerp(cop.heading, want, Math.min(1, 2.6 * dt));
      const topSpeed = 16 + G.wanted * 1.6;
      if (cop.reverseTimer > 0) {
        cop.reverseTimer -= dt; cop.speed = U.lerp(cop.speed, -8, dt * 3);
      } else {
        cop.speed = U.lerp(cop.speed, dist > 6 ? topSpeed : topSpeed * 0.55, Math.min(1, 1.6 * dt));
      }
      const nx = cop.x + Math.cos(cop.heading) * cop.speed * dt;
      const nz = cop.z + Math.sin(cop.heading) * cop.speed * dt;
      const fixed = SOL.city.collide(nx, nz, 2.3);
      if ((fixed.x !== nx || fixed.z !== nz) && Math.abs(cop.speed) < 2) {
        cop.stuckTimer += dt;
        if (cop.stuckTimer > 1.6) { cop.reverseTimer = 0.9; cop.stuckTimer = 0; }
      } else cop.stuckTimer = 0;
      cop.x = fixed.x; cop.z = fixed.z;
      cop.group.position.set(cop.x, 0, cop.z);
      cop.group.rotation.y = -cop.heading;
      cop.flash += dt;
      const on = Math.floor(cop.flash * 4) % 2 === 0;
      if (cop.group.userData.barR) {
        cop.group.userData.barR.material.color.setHex(on ? 0xff2020 : 0x550000);
        cop.group.userData.barB.material.color.setHex(on ? 0x000055 : 0x2040ff);
      }
      // Ram the player's car.
      if (pc && dist < 4.6) {
        this.damageCar(pc, 14 * dt);
        const push = 3.5 * dt;
        pc.x += Math.cos(cop.heading) * push; pc.z += Math.sin(cop.heading) * push;
        pc.speed *= 0.985;
      }
      // Catch the player on foot.
      if (!pc && dist < 2.4) SOL.wanted.caught(dt);
    }
    // --- Car-car shoves (player car vs traffic/cops).
    if (pc) {
      for (const o of [...G.traffic, ...G.cops]) {
        const d = U.dist2(pc.x, pc.z, o.x, o.z);
        if (d < 4.6 && d > 0.01) {
          const push = (4.6 - d) / 2;
          const nx = (pc.x - o.x) / d, nz = (pc.z - o.z) / d;
          pc.x += nx * push; pc.z += nz * push;
          if (!o.parked) { o.x -= nx * push; o.z -= nz * push; }
          if (Math.abs(pc.speed) > 10) { this.damageCar(pc, 2); o.speed *= 0.7; }
        }
      }
    }
  },
};
