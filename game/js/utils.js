// SOLMARA — utils: shared state, math helpers, keyboard/mouse input.
// Every other module reads SOL.G (the one game state) and SOL.input.
window.SOL = window.SOL || {};
SOL.G = {
  scene: null, camera: null, renderer: null, clock: null,
  state: 'menu',           // menu | playing | paused | busted
  time: 0, dayMinutes: 12 * 60, paused: false,
  money: 0, hp: 100, maxHp: 100,
  wanted: 0, heat: 0, hiddenTimer: 0,
  player: null, cars: [], traffic: [], cops: [], peds: [], enemies: [],
  playerCar: null, nearCar: null,
  missionIndex: 0, missionDone: [false, false, false, false, false],
  missionState: null, taxi: null, pickups: [],
  ammo: 12, magSize: 12, reserveAmmo: 60, reloading: false,
  stats: { carsStolen: 0, fares: 0, busts: 0 },
  seed: 1337, muted: false, messageTimer: 0,
};

SOL.util = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  // Deterministic RNG for the city layout (seeded from ?seed=).
  mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  dist2: (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return Math.sqrt(dx * dx + dz * dz); },
  angDiff: (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; },
  angLerp: (a, b, t) => a + SOL.util.angDiff(a, b) * t,
  fmtMoney: (n) => '$' + Math.floor(n).toLocaleString('en-US'),
  el: (id) => document.getElementById(id),
  // Push a circle (x,z,r) out of an AABB {x1,z1,x2,z2}. Returns true if pushed.
  circleVsAABB(x, z, r, b) {
    const cx = SOL.util.clamp(x, b.x1, b.x2), cz = SOL.util.clamp(z, b.z1, b.z2);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      return { x: x + dx * push, z: z + dz * push };
    }
    // Centre inside the box: push out along the smallest penetration axis.
    const pl = x - b.x1, pr = b.x2 - x, pt = z - b.z1, pb = b.z2 - z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) return { x: b.x1 - r, z };
    if (m === pr) return { x: b.x2 + r, z };
    if (m === pt) return { x, z: b.z1 - r };
    return { x, z: b.z2 + r };
  },
  // Canvas texture helper: draw with a function, get a THREE.CanvasTexture.
  canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.anisotropy = 4;
    return t;
  },
};

SOL.input = {
  keys: {}, pressed: {}, mouseDX: 0, mouseDY: 0, mouseDown: false, mouseClicked: false,
  locked: false, drag: false, lastX: 0, lastY: 0,
  init(canvas) {
    window.addEventListener('keydown', (e) => {
      SOL.input.keys[e.code] = true;
      if (!e.repeat) SOL.input.pressed[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyM' && !e.repeat) { SOL.G.muted = !SOL.G.muted; SOL.audio.setMuted(SOL.G.muted); }
    });
    window.addEventListener('keyup', (e) => { SOL.input.keys[e.code] = false; });
    window.addEventListener('blur', () => { SOL.input.keys = {}; });
    canvas.addEventListener('mousedown', (e) => {
      SOL.input.mouseDown = true; SOL.input.mouseClicked = true;
      if (SOL.G.state === 'playing' && !SOL.input.locked && canvas.requestPointerLock) {
        canvas.requestPointerLock();
      }
    });
    window.addEventListener('mouseup', () => { SOL.input.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      SOL.input.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (SOL.input.locked) { SOL.input.mouseDX += e.movementX; SOL.input.mouseDY += e.movementY; }
      else if (SOL.input.drag) {
        SOL.input.mouseDX += e.clientX - SOL.input.lastX;
        SOL.input.mouseDY += e.clientY - SOL.input.lastY;
        SOL.input.lastX = e.clientX; SOL.input.lastY = e.clientY;
      }
    });
    canvas.addEventListener('mousedown', (e) => { SOL.input.drag = true; SOL.input.lastX = e.clientX; SOL.input.lastY = e.clientY; });
    window.addEventListener('mouseup', () => { SOL.input.drag = false; });
    window.addEventListener('contextmenu', (e) => { if (e.target === canvas) e.preventDefault(); });
  },
  down(code) { return !!SOL.input.keys[code]; },
  // Edge-triggered: true once per physical key press, even at low frame rates.
  consumePressed(code) { const p = !!SOL.input.pressed[code]; SOL.input.pressed[code] = false; return p; },
  consumeClick() { const c = SOL.input.mouseClicked; SOL.input.mouseClicked = false; return c; },
  consumeMouse() { const dx = SOL.input.mouseDX, dy = SOL.input.mouseDY; SOL.input.mouseDX = 0; SOL.input.mouseDY = 0; return { dx, dy }; },
};
