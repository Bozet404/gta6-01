// SOLMARA — missions: five story jobs, sequential, with a 3D beacon, a
// minimap marker, timers, rewards, and the "King of Solmara" finale.
SOL.missions = {
  marker: null, markerRing: null, markerTarget: null,
  defs: [
    {
      name: 'First Wheels', reward: 150,
      brief: 'Madame Solana needs a driver. Steal any car and bring it to the <b>Solmara Docks</b>.',
      start(g) { this.setMarker(SOL.city.spots.docks.x, SOL.city.spots.docks.z); g.missionState = { stage: 0 }; },
      tick(g, dt) {
        const d = SOL.util.dist2(g.player.x, g.player.z, SOL.city.spots.docks.x, SOL.city.spots.docks.z);
        if (g.playerCar && d < 8) return 'done';
        return null;
      },
      doneText: 'First job done. Solana is watching you, Rio.',
    },
    {
      name: 'Kurir Panik', reward: 200,
      brief: 'Pick up the package at the <b>docks</b>, then deliver it across town in <b>90 seconds</b> — the Vultures are coming for it. Shoot back from the car!',
      start(g) {
        this.setMarker(SOL.city.spots.docks.x, SOL.city.spots.docks.z);
        g.missionState = { stage: 0, timer: 90, chasers: [] };
      },
      tick(g, dt) {
        const s = g.missionState;
        if (s.stage === 0) {
          const d = SOL.util.dist2(g.player.x, g.player.z, SOL.city.spots.docks.x, SOL.city.spots.docks.z);
          if (d < 8) {
            s.stage = 1;
            const dest = { x: -150, z: 150 };
            this.setMarker(dest.x, dest.z);
            s.dest = dest;
            SOL.hud.say('Package secured! Now RUN — the Vultures are on you!');
            // Two rival chase cars spawn behind the player.
            for (let i = 0; i < 2; i++) {
              const c = SOL.vehicles.makeCar(0x1a1a1a, false);
              SOL.vehicles.place(c, g.player.x + SOL.util.rand(-25, 25), g.player.z + SOL.util.rand(25, 40), 0);
              c.cruise = 20; c.chaser = true;
              g.traffic.push(c);
              s.chasers.push(c);
            }
          }
          return null;
        }
        s.timer -= dt;
        if (s.timer <= 0) return 'fail';
        const d = SOL.util.dist2(g.player.x, g.player.z, s.dest.x, s.dest.z);
        if (d < 8) return 'done';
        // Chasers ram the player.
        for (const c of s.chasers) {
          const cd = SOL.util.dist2(c.x, c.z, g.player.x, g.player.z);
          const want = Math.atan2(g.player.z - c.z, g.player.x - c.x);
          c.heading = SOL.util.angLerp(c.heading, want, Math.min(1, 2.4 * dt));
          c.speed = SOL.util.lerp(c.speed, cd > 8 ? 24 : 12, Math.min(1, 1.5 * dt));
          c.x += Math.cos(c.heading) * c.speed * dt;
          c.z += Math.sin(c.heading) * c.speed * dt;
          const fixed = SOL.city.collide(c.x, c.z, 2.3);
          c.x = fixed.x; c.z = fixed.z;
          c.group.position.set(c.x, 0, c.z);
          c.group.rotation.y = -c.heading;
          if (cd < 4.6 && g.playerCar) SOL.vehicles.damageCar(g.playerCar, 10 * dt);
        }
        return null;
      },
      doneText: 'Delivered — with the Vultures eating your dust. +$50 speed bonus!',
      bonus(g) { return g.missionState.timer > 30 ? 50 : 0; },
    },
    {
      name: 'Hot Pursuit', reward: 250,
      brief: 'You are at <b>2 stars</b>. Lose the cops — get the heat to zero within <b>120 seconds</b>.',
      start(g) {
        SOL.wanted.addHeat(2, 'Wanted! Lose the Solmara PD!');
        g.missionState = { timer: 120 };
        this.clearMarker();
      },
      tick(g, dt) {
        const s = g.missionState;
        s.timer -= dt;
        if (g.wanted === 0) return 'done';
        if (s.timer <= 0) return 'fail';
        return null;
      },
      doneText: 'Clean. The PD lost your trail.',
    },
    {
      name: 'Harbor Trouble', reward: 300,
      brief: 'Six Vultures hold the <b>docks</b>. Take them all down, then get back to the <b>hideout</b>.',
      start(g) {
        this.setMarker(SOL.city.spots.docks.x, SOL.city.spots.docks.z);
        g.missionState = { stage: 0, left: 6 };
        for (let i = 0; i < 6; i++) {
          SOL.combat.spawnEnemy(
            SOL.city.spots.docks.x + SOL.util.rand(-22, 22),
            SOL.city.spots.docks.z + SOL.util.rand(-22, 22));
        }
        SOL.hud.say('Six Vultures at the docks. Make it loud.');
      },
      tick(g, dt) {
        const s = g.missionState;
        if (s.stage === 0) {
          if (g.enemies.length === 0) {
            s.stage = 1;
            this.setMarker(SOL.city.spots.hideout.x, SOL.city.spots.hideout.z);
            SOL.hud.say('Docks clear! Get back to the hideout.');
          }
          return null;
        }
        const d = SOL.util.dist2(g.player.x, g.player.z, SOL.city.spots.hideout.x, SOL.city.spots.hideout.z);
        if (d < 8) return 'done';
        return null;
      },
      doneText: 'The docks are yours. Solana is impressed.',
    },
    {
      name: 'The Big Score', reward: 500,
      brief: 'Steal the golden <b>Solmara GT</b> from the Marina Car Lot — it is guarded. Then lose a <b>3-star</b> heat and reach the <b>hideout</b>.',
      start(g) {
        this.setMarker(SOL.city.spots.lot.x, SOL.city.spots.lot.z);
        g.missionState = { stage: 0, guards: [] };
        // The golden GT, parked in the lot.
        const gt = SOL.vehicles.makeCar(0xf2b01e, false);
        SOL.vehicles.place(gt, SOL.city.spots.lot.x, SOL.city.spots.lot.z, Math.PI / 2);
        gt.parked = true; gt.isGT = true;
        g.traffic.push(gt);
        g.missionState.gt = gt;
        for (let i = 0; i < 2; i++) {
          g.missionState.guards.push(SOL.combat.spawnEnemy(
            SOL.city.spots.lot.x + SOL.util.rand(-10, 10),
            SOL.city.spots.lot.z + SOL.util.rand(-10, 10)));
        }
        SOL.hud.say('The golden Solmara GT is in the lot. Two guards. Your move.');
      },
      tick(g, dt) {
        const s = g.missionState;
        if (s.stage === 0) {
          if (g.playerCar && g.playerCar.isGT) {
            s.stage = 1;
            SOL.wanted.addHeat(3, 'The GT is gone — 3 stars! Lose them and reach the hideout!');
            this.setMarker(SOL.city.spots.hideout.x, SOL.city.spots.hideout.z);
          }
          return null;
        }
        if (g.wanted === 0) {
          const d = SOL.util.dist2(g.player.x, g.player.z, SOL.city.spots.hideout.x, SOL.city.spots.hideout.z);
          if (d < 8) return 'done';
        }
        return null;
      },
      doneText: 'The Big Score is yours. KING OF SOLMARA.',
    },
  ],
  init(scene) {
    // Beacon: a tall glowing pillar + a ground ring at the marker.
    const geo = new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.y = 30; this.marker.visible = false;
    scene.add(this.marker);
    const ringGeo = new THREE.RingGeometry(3, 4.2, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    this.markerRing = new THREE.Mesh(ringGeo, ringMat);
    this.markerRing.rotation.x = -Math.PI / 2; this.markerRing.position.y = 0.15;
    this.markerRing.visible = false;
    scene.add(this.markerRing);
  },
  setMarker(x, z) {
    this.markerTarget = { x, z };
    this.marker.position.set(x, 30, z);
    this.markerRing.position.set(x, 0.15, z);
    this.marker.visible = true; this.markerRing.visible = true;
  },
  clearMarker() {
    this.markerTarget = null;
    this.marker.visible = false; this.markerRing.visible = false;
  },
  current() { return this.defs[SOL.G.missionIndex] || null; },
  startCurrent() {
    const def = this.current();
    if (!def) return;
    SOL.G.missionState = null;
    def.start.call(this, SOL.G);
    SOL.hud.setObjective(`<b>JOB ${SOL.G.missionIndex + 1} — ${def.name}</b><br>${def.brief}`);
    SOL.hud.say(`Job ${SOL.G.missionIndex + 1}: ${def.name}`);
  },
  completeCurrent() {
    const G = SOL.G, def = this.current();
    if (!def) return;
    let pay = def.reward + (def.bonus ? def.bonus(G) : 0);
    G.money += pay;
    G.missionDone[G.missionIndex] = true;
    SOL.audio.jingle();
    SOL.hud.banner(def.name + ' COMPLETE', `+$${pay} — ${def.doneText}`);
    SOL.save.save();
    // Clean up mission leftovers (chasers).
    if (G.missionState && G.missionState.chasers) {
      for (const c of G.missionState.chasers) {
        const i = G.traffic.indexOf(c);
        if (i >= 0) G.traffic.splice(i, 1);
        G.scene.remove(c.group);
      }
    }
    this.clearMarker();
    G.missionIndex++;
    if (G.missionIndex >= this.defs.length) {
      SOL.hud.setObjective('<b>STORY COMPLETE</b><br>You are the King of Solmara. Free roam, take fares, cause chaos.');
      SOL.hud.banner('KING OF SOLMARA', 'All five jobs done. The city is yours.');
      return;
    }
    setTimeout(() => this.startCurrent(), 2500);
  },
  failCurrent() {
    SOL.hud.banner('JOB FAILED', 'Too slow — try the job again.');
    SOL.audio.busted();
    setTimeout(() => this.startCurrent(), 2000);
  },
  onEnterCar(car) {
    // Missions watch the car state through tick(); nothing extra here.
  },
  onCarLost() {
    // Wrecked during a driving mission: restart the job.
    if (SOL.G.missionIndex < this.defs.length) {
      SOL.hud.say('Ride wrecked — the job restarts.');
      setTimeout(() => this.startCurrent(), 1500);
    }
  },
  onEnemyDown() { /* tick() counts enemies directly */ },
  onBusted() {
    // After a bust, restart the current job fresh.
    if (SOL.G.missionIndex < this.defs.length) {
      setTimeout(() => { if (SOL.G.state === 'playing') this.startCurrent(); }, 2500);
    }
  },
  objectiveText() {
    const def = this.current();
    if (!def) return '';
    const s = SOL.G.missionState;
    let extra = '';
    if (s && s.timer !== undefined) extra = `<br>Time left: <b>${Math.ceil(s.timer)}s</b>`;
    if (s && s.stage === 0 && SOL.G.missionIndex === 3) extra = `<br>Vultures left: <b>${SOL.G.enemies.length}</b>`;
    return `<b>JOB ${SOL.G.missionIndex + 1} — ${def.name}</b><br>${def.brief}${extra}`;
  },
  update(dt) {
    const G = SOL.G;
    if (G.state !== 'playing' || !this.current() || !G.missionState) return;
    // Beacon pulse.
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 0.8;
      const s = 1 + Math.sin(G.time * 3) * 0.12;
      this.markerRing.scale.set(s, s, 1);
    }
    const def = this.current();
    const res = def.tick.call(this, G, dt);
    if (res === 'done') this.completeCurrent();
    else if (res === 'fail') this.failCurrent();
    SOL.hud.setObjective(this.objectiveText());
  },
};
