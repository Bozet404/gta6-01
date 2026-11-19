// SOLMARA — main: boot, the menu / playing / paused / busted state machine,
// the game loop, and scene staging (?scene=chase|downtown|shootout|play|menu)
// for screenshots and testing.
SOL.main = {
  stageScene: null,
  boot() {
    const params = new URLSearchParams(location.search);
    this.stageScene = params.get('scene') || 'menu';
    const seed = parseInt(params.get('seed') || '1337', 10) || 1337;
    SOL.G.seed = seed;
    window.addEventListener('error', (e) => {
      const l = SOL.util.el('loading');
      if (l) l.textContent = 'Error: ' + (e.message || e.error);
    });
    // Renderer: bright midday look — ACES tone mapping, soft shadows.
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    SOL.util.el('app').appendChild(renderer.domElement);
    SOL.G.renderer = renderer;
    SOL.G.scene = new THREE.Scene();
    SOL.G.scene.background = new THREE.Color(0x8fc7e8);
    SOL.G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    SOL.G.camera.position.set(0, 10, 16);
    SOL.G.clock = new THREE.Clock();
    SOL.input.init(renderer.domElement);
    SOL.city.build(SOL.G.scene, seed);
    SOL.player.make(0, 12);
    SOL.vehicles.spawnTraffic(14, seed);
    SOL.peds.spawn(24, seed);
    SOL.peds.spawnPickups();
    SOL.combat.init(SOL.G.scene);
    SOL.missions.init(SOL.G.scene);
    SOL.hud.init();
    SOL.peds.startFare();
    this.buildMissionList();
    this.wireButtons();
    window.addEventListener('resize', () => {
      SOL.G.camera.aspect = window.innerWidth / window.innerHeight;
      SOL.G.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !e.repeat) this.togglePause();
    });
    // Staged scenes jump straight into the game (screenshots / tests).
    if (this.stageScene !== 'menu') this.startGame(true);
    else this.setHud(false); // menu: title screen only, no HUD behind it
    renderer.setAnimationLoop(() => this.loop());
  },
  buildMissionList() {
    const saved = SOL.save.load();
    const el = SOL.util.el('missionlist');
    const names = SOL.missions.defs.map((d, i) => {
      const done = saved && saved.missionDone && saved.missionDone[i];
      return `<div class="${done ? 'done' : (i === (saved ? saved.missionIndex : 0) ? '' : 'lock')}">${done ? '✓' : (i === 0 ? '▸' : '·')} Job ${i + 1} — ${d.name} — $${d.reward}</div>`;
    }).join('');
    el.innerHTML = names;
    SOL.util.el('btn-continue').style.display = saved ? 'inline-block' : 'none';
  },
  wireButtons() {
    SOL.util.el('btn-start').addEventListener('click', () => this.startGame(false));
    SOL.util.el('btn-continue').addEventListener('click', () => {
      const d = SOL.save.load();
      if (d) SOL.save.apply(d);
      this.startGame(false);
    });
    SOL.util.el('btn-respawn').addEventListener('click', () => SOL.wanted.respawn());
    SOL.util.el('btn-resume').addEventListener('click', () => this.togglePause());
    SOL.util.el('btn-quit').addEventListener('click', () => location.reload());
  },
  // Show or hide every HUD element (the menu shows none of them).
  setHud(v) {
    document.querySelectorAll('.hud').forEach((el) => { el.style.display = v ? '' : 'none'; });
  },
  startGame(staged) {
    SOL.audio.init();
    SOL.audio.resume();
    SOL.util.el('menu').style.display = 'none';
    this.setHud(true);
    SOL.G.state = 'playing';
    if (staged) this.stage();
    else if (SOL.G.missionIndex < SOL.missions.defs.length) SOL.missions.startCurrent();
    SOL.hud.say('Welcome to Solmara, Rio. Madame Solana is waiting.');
  },
  // Put the world in a chosen state for a screenshot or a test.
  stage() {
    const G = SOL.G, scene = this.stageScene;
    const plaza = SOL.city.spots.plaza;
    if (scene === 'chase') {
      // Cover shot: Rio in a red coupe, 3 stars, cop cars closing in.
      // Start job 5 first so missionState exists, then put Rio in the car.
      G.missionIndex = 4;
      SOL.missions.startCurrent();
      const car = SOL.vehicles.makeCar(0xd23c2e, false);
      SOL.vehicles.place(car, 0, 44, 0);
      SOL.vehicles.steal(car);
      G.player.onFoot = false; G.player.mesh.visible = false;
      // Car faces east (heading 0); chase camera starts behind it (west).
      G.player.camYaw = -Math.PI / 2;
      G.wanted = 3; SOL.wanted.syncCops();
      // Park the pursuit cars up ahead in the camera's view — head-on chase.
      const ahead = [[52, 42], [88, 46]];
      G.cops.forEach((c, i) => {
        const spot = ahead[i % ahead.length];
        c.x = spot[0]; c.z = spot[1];
        c.group.position.set(c.x, 0, c.z);
      });
      SOL.hud.say('Three stars and counting — lose them!');
    } else if (scene === 'downtown') {
      G.player.x = plaza.x; G.player.z = plaza.z + 10;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      G.player.camYaw = Math.PI;
      SOL.hud.setObjective('<b>JOB 1 — First Wheels</b><br>Steal any car and bring it to the <b>Solmara Docks</b>.');
    } else if (scene === 'shootout') {
      // Mission 4 at the docks: six Vultures, Rio aiming down the street.
      G.missionIndex = 3;
      SOL.missions.startCurrent();
      const d = SOL.city.spots.docks;
      G.player.x = d.x - 26; G.player.z = d.z + 10;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      G.player.heading = Math.PI / 2;
      G.player.camYaw = Math.PI / 2;
      G.ammo = 12; G.reserveAmmo = 60;
    } else {
      // play: straight into job 1.
      if (G.missionIndex < SOL.missions.defs.length) SOL.missions.startCurrent();
    }
  },
  togglePause() {
    const G = SOL.G;
    if (G.state === 'playing') {
      G.state = 'paused';
      document.exitPointerLock && document.exitPointerLock();
      SOL.util.el('paused').style.display = 'flex';
      SOL.audio.setEngine(0, false);
    } else if (G.state === 'paused') {
      G.state = 'playing';
      SOL.util.el('paused').style.display = 'none';
    }
  },
  // Adaptive quality: if the frame rate collapses (software GL, weak laptop),
  // step the render cost down so the game stays playable instead of a slideshow.
  quality: 2, // 2 = full, 1 = medium, 0 = low
  emaDt: 0.016, slowFrames: 0, fastFrames: 0,
  applyQuality(level) {
    const r = SOL.G.renderer;
    if (level === 2) { r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); SOL.G.sun.shadow.mapSize.set(2048, 2048); }
    else if (level === 1) { r.setPixelRatio(1); SOL.G.sun.shadow.mapSize.set(1024, 1024); }
    else { r.setPixelRatio(0.66); SOL.G.sun.shadow.mapSize.set(512, 512); }
    if (SOL.G.sun.shadow.map) { SOL.G.sun.shadow.map.dispose(); SOL.G.sun.shadow.map = null; }
    r.setSize(window.innerWidth, window.innerHeight);
    this.quality = level;
  },
  loop() {
    const G = SOL.G;
    const rawDt = G.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    // Track real frame time and adapt quality.
    this.emaDt = this.emaDt * 0.95 + rawDt * 0.05;
    if (this.emaDt > 0.09) { this.slowFrames++; this.fastFrames = 0; }
    else if (this.emaDt < 0.025) { this.fastFrames++; this.slowFrames = 0; }
    else { this.slowFrames = 0; this.fastFrames = 0; }
    if (this.slowFrames > 30 && this.quality > 0) { this.slowFrames = 0; this.applyQuality(this.quality - 1); }
    if (this.fastFrames > 600 && this.quality < 2) { this.fastFrames = 0; this.applyQuality(this.quality + 1); }
    if (G.state === 'playing') {
      G.time += dt;
      SOL.city.update(dt, G.time);
      SOL.player.update(dt);
      SOL.vehicles.update(dt);
      SOL.peds.update(dt);
      SOL.peds.updatePickups(dt);
      SOL.combat.update(dt);
      SOL.wanted.update(dt);
      SOL.missions.update(dt);
      SOL.hud.update(dt);
      // Autosave every 10s.
      this._saveT = (this._saveT || 0) + dt;
      if (this._saveT > 10) { this._saveT = 0; SOL.save.save(); }
    } else if (G.state === 'menu') {
      // Slow orbit around the tower behind the menu.
      G.time += dt * 0.2;
      const t = G.time * 0.05;
      G.camera.position.set(Math.sin(t) * 90, 42, Math.cos(t) * 90);
      G.camera.lookAt(0, 12, -40);
      SOL.city.update(dt, G.time);
    }
    G.renderer.render(G.scene, G.camera);
  },
};

window.addEventListener('DOMContentLoaded', () => SOL.main.boot());
