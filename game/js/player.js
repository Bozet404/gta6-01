// SOLMARA — player: on-foot third-person controls, the chase camera, and
// getting in and out of cars. The player object lives in SOL.G.player.
SOL.player = {
  mesh: null,
  make(x, z) {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xffcf3f });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.0, 8), jacket);
    torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
    head.position.y = 1.95; head.castShadow = true; g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0xd23c2e }));
    cap.position.y = 2.18; g.add(cap);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.9, 6), jeans);
      leg.position.set(0.18 * s, 0.45, 0); g.add(leg);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.85, 6), jacket);
      arm.position.set(0.48 * s, 1.2, 0); g.add(arm);
    }
    g.position.set(x, 0, z);
    SOL.G.scene.add(g);
    SOL.G.player = {
      mesh: g, x, z, heading: 0, speed: 0, onFoot: true,
      walkPhase: 0, aimYaw: 0, camYaw: Math.PI, camPitch: 0.32, camDist: 8,
    };
    return SOL.G.player;
  },
  // Forced out when the player's car is wrecked.
  ejectFromWreck(car) {
    const p = SOL.G.player;
    p.onFoot = true;
    p.x = car.x + 4; p.z = car.z + 4;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    SOL.hud.say('Your ride is wrecked! On foot now.');
    SOL.missions.onCarLost();
  },
  update(dt) {
    const G = SOL.G, U = SOL.util, p = G.player;
    if (!p) return;
    const inp = SOL.input;
    // Mouse look: yaw + pitch, pointer-locked or drag.
    const m = inp.consumeMouse();
    p.camYaw -= m.dx * 0.0032;
    p.camPitch = U.clamp(p.camPitch + m.dy * 0.0022, 0.05, 1.1);
    if (G.playerCar) { this.updateCarCam(dt); return; }
    // On-foot movement, relative to the camera yaw.
    const fwd = (inp.down('KeyW') || inp.down('ArrowUp') ? 1 : 0) - (inp.down('KeyS') || inp.down('ArrowDown') ? 1 : 0);
    const strafe = (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0) - (inp.down('KeyA') || inp.down('ArrowLeft') ? 1 : 0);
    const run = inp.down('ShiftLeft') || inp.down('ShiftRight');
    const topSpeed = run ? 10 : 6;
    let mx = 0, mz = 0;
    if (fwd || strafe) {
      const cy = p.camYaw;
      mx = Math.sin(cy) * fwd + Math.cos(cy) * strafe;
      mz = Math.cos(cy) * fwd - Math.sin(cy) * strafe;
      const len = Math.sqrt(mx * mx + mz * mz);
      mx /= len; mz /= len;
      p.heading = U.angLerp(p.heading, Math.atan2(mx, mz), Math.min(1, 12 * dt));
    }
    p.speed = U.lerp(p.speed, (fwd || strafe) ? topSpeed : 0, Math.min(1, 10 * dt));
    const nx = p.x + Math.sin(p.heading) * p.speed * dt;
    const nz = p.z + Math.cos(p.heading) * p.speed * dt;
    const fixed = SOL.city.collide(nx, nz, 0.6);
    p.x = fixed.x; p.z = fixed.z;
    p.walkPhase += p.speed * dt * 1.6;
    p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.07, p.z);
    p.mesh.rotation.y = p.heading;
    // Car push: on-foot player shoved gently by moving cars.
    for (const c of [...G.traffic, ...G.cops]) {
      const d = U.dist2(p.x, p.z, c.x, c.z);
      if (d < 2.6 && d > 0.01) {
        const push = (2.6 - d);
        p.x += ((p.x - c.x) / d) * push; p.z += ((p.z - c.z) / d) * push;
        if (Math.abs(c.speed) > 6) this.hurt(6);
      }
    }
    // Find the nearest car to enter.
    G.nearCar = SOL.vehicles.nearestCar(p.x, p.z, 5);
    if (G.nearCar) {
      SOL.hud.prompt(`<b>E</b> — ${G.nearCar.parked ? 'Take car' : 'Steal car'}`);
    } else if (G.taxi && G.taxi.state === 'pickup' && U.dist2(p.x, p.z, G.taxi.ped.x, G.taxi.ped.z) < 4) {
      SOL.hud.prompt('Customer waiting — get in a car');
    } else {
      SOL.hud.prompt('');
    }
    // E: get in (edge-triggered so a quick tap always registers).
    if (SOL.input.consumePressed('KeyE') && G.nearCar) {
      this.enterCar(G.nearCar);
    }
    // Third-person camera behind the player.
    const cam = G.camera;
    const cx = p.x - Math.sin(p.camYaw) * p.camDist * Math.cos(p.camPitch);
    const cz = p.z - Math.cos(p.camYaw) * p.camDist * Math.cos(p.camPitch);
    const cy = 2.2 + Math.sin(p.camPitch) * p.camDist;
    cam.position.set(U.lerp(cam.position.x, cx, Math.min(1, 10 * dt)),
      U.lerp(cam.position.y, cy, Math.min(1, 10 * dt)),
      U.lerp(cam.position.z, cz, Math.min(1, 10 * dt)));
    cam.lookAt(p.x, 1.6, p.z);
    p.aimYaw = p.camYaw;
  },
  updateCarCam(dt) {
    const G = SOL.G, U = SOL.util, p = G.player, car = G.playerCar;
    const m = SOL.input.consumeMouse();
    p.camYaw -= m.dx * 0.0032;
    p.camPitch = U.clamp(p.camPitch + m.dy * 0.0022, 0.08, 0.9);
    // Chase camera: behind the car, easing toward its heading.
    // Car forward is (cos h, sin h), so "behind" is the offset
    // (-cos h, -sin h) — camYaw is atan2(dx, dz) of that offset.
    const wantYaw = Math.atan2(-Math.cos(car.heading), -Math.sin(car.heading));
    p.camYaw = U.angLerp(p.camYaw, wantYaw, Math.min(1, 1.6 * dt));
    const dist = 11 + Math.abs(car.speed) * 0.08;
    const cx = car.x + Math.sin(p.camYaw) * dist * Math.cos(p.camPitch);
    const cz = car.z + Math.cos(p.camYaw) * dist * Math.cos(p.camPitch);
    const cy = 3.4 + Math.sin(p.camPitch) * dist * 0.7;
    const cam = G.camera;
    cam.position.set(U.lerp(cam.position.x, cx, Math.min(1, 6 * dt)),
      U.lerp(cam.position.y, cy, Math.min(1, 6 * dt)),
      U.lerp(cam.position.z, cz, Math.min(1, 6 * dt)));
    cam.lookAt(car.x, 1.4, car.z);
    // Sync the player's position to the car for the minimap and missions.
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    p.mesh.visible = false;
    // E: get out (edge-triggered).
    if (SOL.input.consumePressed('KeyE')) {
      this.exitCar();
    }
    SOL.hud.prompt('<b>E</b> — Get out &nbsp;·&nbsp; <b>Click</b> — Drive-by shoot');
  },
  enterCar(car) {
    const G = SOL.G, p = G.player;
    const wasParked = car.parked;
    SOL.vehicles.steal(car);
    p.onFoot = false;
    p.mesh.visible = false;
    p.camYaw = Math.atan2(-Math.cos(car.heading), -Math.sin(car.heading));
    if (!wasParked) {
      SOL.wanted.addHeat(1, 'Car stolen in plain sight!');
      SOL.hud.say('Car stolen! The law is watching.');
    } else {
      SOL.hud.say('Nice wheels. This one was just sitting there.');
    }
    SOL.audio.blip(220, 0.12, 'square', 0.12, 330);
    SOL.missions.onEnterCar(car);
  },
  exitCar() {
    const G = SOL.G, p = G.player, car = G.playerCar;
    if (!car) return;
    SOL.vehicles.leaveCar(car);
    p.onFoot = true;
    p.x = car.x - Math.sin(car.heading) * 3;
    p.z = car.z + Math.cos(car.heading) * 3;
    p.mesh.visible = true;
    p.mesh.position.set(p.x, 0, p.z);
    // Face the way the car was pointing: on-foot view direction is
    // (sin camYaw, cos camYaw), car forward is (cos h, sin h).
    p.camYaw = Math.atan2(Math.cos(car.heading), Math.sin(car.heading));
  },
  hurt(amount) {
    const G = SOL.G;
    if (G.state !== 'playing') return;
    G.hp -= amount;
    SOL.hud.flashDamage();
    if (G.hp <= 0) {
      G.hp = 0;
      SOL.wanted.busted('You got taken down. The Solmara PD sends its regards.');
    }
  },
  heal(amount) {
    SOL.G.hp = Math.min(SOL.G.maxHp, SOL.G.hp + amount);
  },
};
