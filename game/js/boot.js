// Boot: wires every Solmara module into one game, owns the renderer, the
// input, the main loop, the menu flow, adaptive quality and the staging
// hooks (?scene=) the screenshots and tests use.
import { makeRng, clamp, $ } from './util.js';
import { SoundBank } from './audio.js';
import { buildCity } from './city.js';
import { spawnTraffic, spawnParked } from './vehicles.js';
import { spawnPedestrians, spawnTaxiCustomers } from './people.js';
import { createPlayer, updatePlayerOnFoot, shootOnce, startReload, updateEffects, hurtPlayer, updateReload } from './player.js';
import { enterCar, exitCar, updateDriving, updateFootCamera, updateCarCamera } from './driving.js';
import { createWanted, updateWanted } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { loadSave, hasSave, writeSave, applySave } from './save.js';

const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '7', 10) || 7;
const SCENE = params.get('scene') || 'menu';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('viewport').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(-40, 26, 10);

const G = {
  scene, camera, renderer,
  rng: makeRng(SEED),
  time: 0,
  clockHours: 9,
  state: 'menu',
  keys: new Set(),
  pressed: new Set(),
  money: 50,
  city: null,
  cars: { traffic: [], parked: [], police: [] },
  peds: [],
  taxiCustomers: [],
  vultures: [],
  effects: { tracers: [], sparks: [] },
  sounds: new SoundBank(),
  player: null,
  wanted: null,
  missions: null,
  hud: null,
  saveT: 0,
  quality: 0,
  fpsEma: 60,
  fpsT: 0,
};

G.city = buildCity(scene, SEED);
G.cars.traffic = spawnTraffic(scene, G.city.loops, G.rng, 14);
G.cars.parked = spawnParked(scene, G.rng);
G.peds = spawnPedestrians(scene, G.city.walkLoops, G.rng, 24);
G.taxiCustomers = spawnTaxiCustomers(scene, G.rng, [
  [-42, 48], [48, 42], [-48, -42],
]);
G.player = createPlayer(scene);
G.player.mesh.position.set(-67, 0, -40);
G.wanted = createWanted(G);
G.hud = createHud(G);
G.missions = createMissions(G);
G.hud.setContinueEnabled(hasSave());

// ---------------- input ----------------
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  G.keys.add(e.code);
  G.pressed.add(e.code);
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => G.keys.delete(e.code));

let dragging = false;
let dragDist = 0;
let lastMX = 0;
let lastMY = 0;
const canvas = renderer.domElement;
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  dragDist = 0;
  lastMX = e.clientX;
  lastMY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMX;
  const dy = e.clientY - lastMY;
  lastMX = e.clientX;
  lastMY = e.clientY;
  dragDist += Math.abs(dx) + Math.abs(dy);
  if (G.state === 'playing') {
    G.player.camYaw -= dx * 0.005;
    G.player.camPitch = clamp(G.player.camPitch + dy * 0.004, -0.1, 1.1);
  }
});
window.addEventListener('mouseup', () => {
  if (dragging && dragDist < 6 && G.state === 'playing') shootOnce(G);
  dragging = false;
});
canvas.addEventListener('touchstart', (e) => {
  dragging = true;
  dragDist = 0;
  lastMX = e.touches[0].clientX;
  lastMY = e.touches[0].clientY;
}, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (!dragging) return;
  const dx = e.touches[0].clientX - lastMX;
  const dy = e.touches[0].clientY - lastMY;
  lastMX = e.touches[0].clientX;
  lastMY = e.touches[0].clientY;
  dragDist += Math.abs(dx) + Math.abs(dy);
  if (G.state === 'playing') {
    G.player.camYaw -= dx * 0.006;
    G.player.camPitch = clamp(G.player.camPitch + dy * 0.005, -0.1, 1.1);
  }
}, { passive: true });
canvas.addEventListener('touchend', () => {
  if (dragging && dragDist < 8 && G.state === 'playing') shootOnce(G);
  dragging = false;
});

// ---------------- menu flow ----------------
function startGame(fromSave) {
  G.sounds.ensure();
  if (!fromSave) {
    G.money = 50;
    G.player.hp = 100;
    G.clockHours = 9;
    G.player.mesh.position.set(-67, 0, -40);
    G.player.heading = 0;
    G.wanted.heat = 0;
    G.missions.startJob(0);
  } else {
    const s = loadSave();
    if (s) applySave(G, s);
  }
  G.state = 'playing';
  G.hud.hideMenu();
  G.hud.hideWasted();
  G.hud.showHud();
  G.hud.toast(fromSave ? 'Welcome back to Solmara.' : 'Mara Voss has work for you. Steal a car.');
}

function togglePause() {
  if (G.state === 'playing') {
    G.state = 'paused';
    G.hud.showPaused();
    G.sounds.engine(0, false);
    G.sounds.siren(false);
  } else if (G.state === 'paused') {
    G.state = 'playing';
    G.hud.hidePaused();
  }
}

function toggleMute() {
  G.sounds.setMuted(!G.sounds.muted);
  G.hud.setMuted(G.sounds.muted);
}

$('btn-start').addEventListener('click', () => startGame(false));
$('btn-continue').addEventListener('click', () => startGame(true));
$('btn-howto').addEventListener('click', () => G.hud.showHowto());
$('btn-close-howto').addEventListener('click', () => G.hud.hideHowto());
$('btn-resume').addEventListener('click', () => togglePause());
$('btn-quit-menu').addEventListener('click', () => {
  G.state = 'menu';
  G.hud.hidePaused();
  G.hud.hideHud();
  G.hud.showMenu();
  G.hud.setContinueEnabled(hasSave());
});
$('btn-respawn').addEventListener('click', () => {
  const p = G.player;
  p.hp = 100;
  G.money = Math.max(0, G.money - 50);
  p.mesh.position.set(-67, 0, -40);
  p.mesh.visible = true;
  p.inCar = false;
  p.car = null;
  G.wanted.heat = 0;
  for (const c of G.wanted.cars) G.scene.remove(c.mesh);
  G.wanted.cars.length = 0;
  G.cars.police.length = 0;
  G.state = 'playing';
  G.hud.hideWasted();
  G.hud.toast('Back on your feet. Careful out there.');
});
$('btn-mute').addEventListener('click', () => toggleMute());
$('btn-pause').addEventListener('click', () => togglePause());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- E key: enter/exit car, grab, taxi ----------------
function nearestCar(maxD) {
  const p = G.player.mesh.position;
  let best = null;
  let bestD = maxD;
  const consider = (car) => {
    if (car.taken || car.stolen) return;
    const d = Math.hypot(car.mesh.position.x - p.x, car.mesh.position.z - p.z);
    if (d < bestD) { bestD = d; best = car; }
  };
  for (const c of G.cars.parked) consider(c);
  for (const c of G.cars.traffic) consider(c);
  return best;
}

function handleInteract() {
  const p = G.player;
  if (p.inCar) { exitCar(G); return; }
  const acted = G.missions.interact();
  if (acted) return;
  const car = nearestCar(3.6);
  if (car) {
    const moving = G.cars.traffic.includes(car);
    if (moving) {
      G.wanted.addHeat(25);
      G.hud.toast('Carjacked! The cops saw that.');
    }
    car.speed = 0;
    car.heading = car.heading ?? 0;
    enterCar(G, car);
  }
}

// ---------------- staging for screenshots / tests ----------------
function stageScene() {
  if (SCENE === 'menu') return;
  startGame(false);
  const p = G.player;
  if (SCENE === 'play') {
    p.mesh.position.set(-67, 0, -40);
  } else if (SCENE === 'downtown') {
    p.mesh.position.set(40, 0, -70);
    p.camYaw = Math.PI * 0.15;
  } else if (SCENE === 'chase') {
    const car = G.cars.parked[0];
    car.mesh.position.set(0, 0, -20);
    car.heading = 0;
    p.mesh.position.set(0, 0, -20);
    enterCar(G, car);
    car.speed = 18;
    G.wanted.setLevel(3);
    G.missions.startJob(2);
    G.missions.stage = 1;
    G.missions.setObjective();
    p.camYaw = 0;
  } else if (SCENE === 'shootout') {
    G.missions.startJob(3);
    p.mesh.position.set(-40, 0, 145);
    p.camYaw = Math.PI;
    p.camPitch = 0.25;
  }
}

// ---------------- debug hook for tests ----------------
window.__solmara = {
  ready: false,
  error: null,
  state() {
    const p = G.player;
    return {
      state: G.state,
      x: +p.mesh.position.x.toFixed(2),
      z: +p.mesh.position.z.toFixed(2),
      heading: +p.heading.toFixed(2),
      carHeading: p.car ? +p.car.heading.toFixed(2) : null,
      camYaw: +p.camYaw.toFixed(2),
      speedKmh: p.inCar && p.car ? Math.round(Math.abs(p.car.speed || 0) * 3.6) : Math.round(p.speed * 3.6),
      speed: p.inCar && p.car ? +(p.car.speed || 0).toFixed(2) : +p.speed.toFixed(2),
      inCar: p.inCar,
      wanted: G.wanted.level,
      heat: Math.round(G.wanted.heat),
      ammo: p.ammo,
      hp: Math.round(p.hp),
      money: Math.round(G.money),
      mission: G.missions.index,
      missionStage: G.missions.stage,
      vulturesLeft: G.missions.vulturesLeft,
      police: G.wanted.cars.length,
      time: +G.time.toFixed(2),
      fps: Math.round(G.fpsEma),
    };
  },
  teleport(x, z) {
    const p = G.player;
    if (p.inCar && p.car) {
      p.car.mesh.position.set(x, 0, z);
    } else {
      p.mesh.position.set(x, 0, z);
    }
  },
  setWanted(lv) { G.wanted.setLevel(lv); },
  startMission(i) { G.missions.startJob(i); },
  start() { startGame(false); },
};
window.addEventListener('error', (e) => {
  window.__solmara.error = String(e.message || e.error);
});

// ---------------- main loop ----------------
let lastT = performance.now();
let firstFrame = true;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  G.time += dt;
  G.clockHours = (9 + G.time * 0.05) % 24;

  // Adaptive quality: shed shadows and resolution if the frame rate collapses.
  G.fpsEma = G.fpsEma * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
  G.fpsT += dt;
  if (G.fpsT > 2) {
    G.fpsT = 0;
    if (G.fpsEma < 25 && G.quality === 0) {
      G.quality = 1;
      renderer.setPixelRatio(0.66);
      renderer.shadowMap.enabled = true;
      G.scene.traverse((o) => {
        if (o.isDirectionalLight) o.shadow.mapSize.set(512, 512);
      });
    } else if (G.fpsEma < 20 && G.quality === 1) {
      G.quality = 2;
      renderer.shadowMap.enabled = false;
    }
  }

  if (G.state === 'playing') {
    const p = G.player;
    updateReload(G, dt);
    // Movement input relative to the camera yaw.
    const f = { x: -Math.sin(p.camYaw), z: -Math.cos(p.camYaw) };
    const r = { x: Math.cos(p.camYaw), z: -Math.sin(p.camYaw) };
    const w = G.keys.has('KeyW') ? 1 : 0;
    const s = G.keys.has('KeyS') ? 1 : 0;
    const a = G.keys.has('KeyA') ? 1 : 0;
    const d = G.keys.has('KeyD') ? 1 : 0;
    let mx = f.x * (w - s) + r.x * (d - a);
    let mz = f.z * (w - s) + r.z * (d - a);
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    if (p.inCar) {
      updateDriving(G, dt);
      updateCarCamera(G, dt);
    } else {
      updatePlayerOnFoot(G, dt, { x: mx, z: mz });
      updateFootCamera(G, dt);
    }
    // Edge-triggered keys, consumed once per frame.
    if (G.pressed.has('KeyE')) handleInteract();
    if (G.pressed.has('KeyR')) startReload(G);
    G.pressed.clear();
    for (const t of G.cars.traffic) if (!t.stolen) t.update(dt);
    for (const ped of G.peds) {
      if (ped.knocked) {
        ped.knockT -= dt;
        if (ped.knockT <= 0) {
          ped.knocked = false;
          ped.mesh.visible = true;
          ped.mesh.position.set(ped.loop[0].x, 0, ped.loop[0].z);
        }
        continue;
      }
      ped.update(dt);
    }
    for (const v of G.vultures) {
      const shot = v.update(dt, p.mesh.position.x, p.mesh.position.z);
      if (shot === 'hit') {
        hurtPlayer(G, 8, 'vulture');
        G.hud.toast('A Vulture hit you!');
      }
    }
    updateWanted(G, dt);
    G.missions.update(dt);
    G.city.update(dt, G.time);
    updateEffects(G, dt);
    G.hud.update();
    G.saveT += dt;
    if (G.saveT > 10) {
      G.saveT = 0;
      writeSave(G);
    }
  } else if (G.state === 'menu') {
    // Slow attract orbit around the plaza while the menu is up.
    const t = G.time * 0.08;
    camera.position.set(-67 + Math.sin(t) * 55, 30, -22 + Math.cos(t) * 55);
    camera.lookAt(-67, 4, -22);
    G.city.update(dt, G.time);
    for (const c of G.cars.traffic) c.update(dt);
    for (const ped of G.peds) ped.update(dt);
  }

  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__solmara.ready = true;
  }
}

stageScene();
requestAnimationFrame(frame);
