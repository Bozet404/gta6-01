// SOLMARA — combat: pistol shooting (raycast, on foot and drive-by), rival
// gang enemies with a simple chase-and-shoot AI, and player health.
SOL.combat = {
  raycaster: null, tracerPool: [], tracerIdx: 0,
  init(scene) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 120;
    const geo = new THREE.BoxGeometry(1, 0.04, 0.04);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe27a });
    for (let i = 0; i < 10; i++) {
      const t = new THREE.Mesh(geo, mat);
      t.visible = false; scene.add(t); this.tracerPool.push(t);
    }
  },
  fireTracer(from, to) {
    const t = this.tracerPool[this.tracerIdx++ % this.tracerPool.length];
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    t.position.copy(mid);
    t.lookAt(to);
    const len = from.distanceTo(to);
    t.scale.set(Math.max(len, 0.1), 1, 1);
    t.visible = true;
    t.userData.life = 0.09;
  },
  updateTracers(dt) {
    for (const t of this.tracerPool) {
      if (!t.visible) continue;
      t.userData.life -= dt;
      if (t.userData.life <= 0) t.visible = false;
    }
  },
  // Player shoots from the camera centre. Works on foot and from a car.
  playerShoot() {
    const G = SOL.G;
    if (G.reloading || G.ammo <= 0) {
      if (G.ammo <= 0) this.reload();
      return;
    }
    G.ammo--;
    SOL.audio.gunshot();
    const cam = G.camera;
    const from = cam.position.clone();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    // Slight spread, worse while moving.
    const spread = (G.playerCar ? 0.03 : 0.012) + (G.player.speed || 0) * 0.0012;
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();
    this.raycaster.set(from, dir);
    const targets = [];
    for (const e of G.enemies) if (e.hp > 0) targets.push(e.mesh);
    for (const c of G.cops) targets.push(c.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = from.clone().addScaledVector(dir, 90);
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      let obj = h.object;
      while (obj && !obj.userData.enemyRef && !obj.userData.carRef) obj = obj.parent;
      if (obj && obj.userData.enemyRef) {
        const e = obj.userData.enemyRef;
        e.hp -= 34;
        SOL.hud.hitmarker();
        if (e.hp <= 0) this.killEnemy(e);
      } else if (obj && obj.userData.carRef) {
        const car = obj.userData.carRef;
        if (car.isCop) SOL.wanted.addHeat(1, 'You shot at a police car!');
        SOL.vehicles.damageCar(car, 20);
      }
    }
    // Muzzle flash point + tracer.
    this.fireTracer(from.clone().addScaledVector(dir, 1.2), end);
    // Scare nearby peds, and raise heat if anyone saw it.
    SOL.peds.scare(G.player.x, G.player.z, 26);
    if (G.wanted === 0 && Math.random() < 0.5) SOL.wanted.addHeat(1, 'Shots fired — someone called it in!');
    // Recoil kick on the camera.
    SOL.G.player.camPitch += 0.012;
  },
  reload() {
    const G = SOL.G;
    if (G.reloading || G.ammo >= G.magSize || G.reserveAmmo <= 0) return;
    G.reloading = true;
    SOL.audio.blip(300, 0.08, 'square', 0.1, 200);
    setTimeout(() => {
      const need = G.magSize - G.ammo;
      const take = Math.min(need, G.reserveAmmo);
      G.ammo += take; G.reserveAmmo -= take;
      G.reloading = false;
      SOL.audio.blip(500, 0.08, 'square', 0.1, 700);
    }, 1200);
  },
  spawnEnemy(x, z) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: 0x3a2a2a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 1.0, 8), shirt);
    torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
    head.position.y = 1.95; g.add(head);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0xd23c2e }));
    band.position.y = 2.05; g.add(band);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    gun.position.set(0.4, 1.3, 0.3); g.add(gun);
    g.position.set(x, 0, z);
    SOL.G.scene.add(g);
    const e = { mesh: g, x, z, heading: 0, hp: 100, shootTimer: SOL.util.rand(0.4, 1.2), speed: 5.2 };
    g.traverse((o) => { o.userData.enemyRef = e; });
    SOL.G.enemies.push(e);
    return e;
  },
  killEnemy(e) {
    const G = SOL.G;
    e.hp = 0;
    G.scene.remove(e.mesh);
    const idx = G.enemies.indexOf(e);
    if (idx >= 0) G.enemies.splice(idx, 1);
    G.money += 20;
    SOL.hud.say('Vulture down! +$20');
    SOL.missions.onEnemyDown(e);
  },
  clearEnemies() {
    for (const e of [...SOL.G.enemies]) {
      SOL.G.scene.remove(e.mesh);
    }
    SOL.G.enemies.length = 0;
  },
  update(dt) {
    const G = SOL.G, U = SOL.util;
    this.updateTracers(dt);
    if (G.state !== 'playing') return;
    // Click (or hold) to shoot.
    if (SOL.input.mouseDown || SOL.input.consumeClick()) {
      if (!this._cool) this._cool = 0;
      this._cool -= dt;
      if (this._cool <= 0) {
        this.playerShoot();
        this._cool = 0.32;
      }
    } else this._cool = 0;
    if (SOL.input.consumePressed('KeyR')) this.reload();
    // Enemy AI: close in, shoot when in range and in sight.
    for (const e of G.enemies) {
      const d = U.dist2(e.x, e.z, G.player.x, G.player.z);
      if (d > 55) continue;
      const want = Math.atan2(G.player.z - e.z, G.player.x - e.x);
      e.heading = U.angLerp(e.heading, want, Math.min(1, 5 * dt));
      if (d > 14) {
        e.x += Math.cos(e.heading) * e.speed * dt;
        e.z += Math.sin(e.heading) * e.speed * dt;
        const fixed = SOL.city.collide(e.x, e.z, 0.5);
        e.x = fixed.x; e.z = fixed.z;
      }
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = -e.heading + Math.PI / 2;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && d < 45) {
        e.shootTimer = U.rand(0.8, 1.4);
        SOL.audio.enemyShot();
        const from = new THREE.Vector3(e.x, 1.4, e.z);
        const to = new THREE.Vector3(G.player.x, 1.2, G.player.z);
        this.fireTracer(from, to);
        // Hit chance falls with distance; cover is the buildings between.
        const hitChance = U.clamp(0.55 - d * 0.008, 0.12, 0.55);
        if (Math.random() < hitChance) SOL.player.hurt(8);
      }
    }
    // Slow health regen out of combat.
    if (G.hp < G.maxHp) {
      this._regen = (this._regen || 0) + dt;
      if (this._regen > 5) { G.hp = Math.min(G.maxHp, G.hp + 2 * dt); }
    } else this._regen = 0;
  },
};
