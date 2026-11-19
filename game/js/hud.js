// Everything on screen that is not the 3D world: stars, cash, objective,
// clock, health, speed, ammo, the live minimap, toasts, hints, the damage
// flash and the menu / pause / wasted overlays.
import { $, fmtCash, fmtClock, clamp } from './util.js';

export function createHud(G) {
  const minimap = $('minimap');
  const mm = minimap.getContext('2d');
  let toastTimer = null;
  const H = {
    showHud() { $('hud').classList.add('on'); },
    hideHud() { $('hud').classList.remove('on'); },
    showMenu() { $('menu').style.display = 'flex'; },
    hideMenu() { $('menu').style.display = 'none'; },
    showHowto() { $('howto').classList.add('on'); },
    hideHowto() { $('howto').classList.remove('on'); },
    showPaused() { $('paused').classList.add('on'); },
    hidePaused() { $('paused').classList.remove('on'); },
    showWasted() { $('wasted').classList.add('on'); },
    hideWasted() { $('wasted').classList.remove('on'); },
    setObjective(job, text) {
      $('job-name').textContent = job;
      $('job-text').textContent = text;
    },
    setHint(text) { $('hint').textContent = text; },
    toast(text) {
      const t = $('toast');
      t.textContent = text;
      t.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    },
    flashDamage() {
      const d = $('damage');
      d.style.opacity = '1';
      setTimeout(() => { d.style.opacity = '0'; }, 180);
    },
    hitmarker() {
      const c = $('crosshair');
      c.classList.add('hit');
      setTimeout(() => c.classList.remove('hit'), 130);
    },
    setContinueEnabled(on) { $('btn-continue').disabled = !on; },
    setMuted(muted) { $('btn-mute').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; },
    // Called every frame while playing.
    update() {
      const p = G.player;
      let stars = '';
      for (let i = 0; i < 5; i++) {
        stars += i < G.wanted.level
          ? '<span>★</span>'
          : '<span class="off">★</span>';
      }
      $('stars').innerHTML = stars;
      $('cash').innerHTML = `${fmtCash(G.money)} <small>SOLMARA</small>`;
      $('clock').textContent = fmtClock(G.clockHours);
      $('health-fill').style.width = `${clamp(p.hp, 0, 100)}%`;
      $('health-fill').style.background = p.hp > 50
        ? 'linear-gradient(90deg,#37d67a,#a5f2b0)'
        : p.hp > 25 ? 'linear-gradient(90deg,#e8a13b,#f2d38a)' : 'linear-gradient(90deg,#d83b2e,#f28a7a)';
      const kmh = p.inCar && p.car ? Math.abs(p.car.speed || 0) * 3.6 : p.speed * 3.6;
      $('speed').innerHTML = `${Math.round(kmh)} <small>km/h</small>`;
      $('ammo').textContent = p.inCar
        ? `🚗 ${p.car ? 'DRIVING' : ''}`
        : (p.reloading ? 'RELOADING…' : `🔫 ${p.ammo} / 12`);
      $('crosshair').style.display = (G.state === 'playing' && !p.inCar) ? 'block' : 'none';
      this.drawMinimap(mm);
    },
    drawMinimap(mm) {
      const W = 180;
      const sx = (x) => ((x + 230) / 460) * W;
      const sz = (z) => ((z + 180) / 360) * W;
      mm.clearRect(0, 0, W, W);
      mm.fillStyle = '#12324a';
      mm.fillRect(0, 0, W, W);
      // Sea on the east edge.
      mm.fillStyle = '#1f7fb8';
      mm.fillRect(sx(230), 0, W - sx(230), W);
      // Roads.
      mm.strokeStyle = '#5a6a7a';
      mm.lineWidth = 2;
      for (const x of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
        mm.beginPath(); mm.moveTo(sx(x), 0); mm.lineTo(sx(x), W); mm.stroke();
      }
      for (const z of [-135, -90, -45, 0, 45, 90, 135]) {
        mm.beginPath(); mm.moveTo(0, sz(z)); mm.lineTo(W, sz(z)); mm.stroke();
      }
      // Objective beacon.
      const M = G.missions;
      let dest = null;
      if (M.fare) dest = M.fare.dest;
      else if (M.index === 1) dest = G.city.places.harbor;
      else if (M.index === 3) dest = G.city.places.docks;
      else if (M.index === 4) dest = M.stage === 2 ? G.city.places.safehouse : G.city.places.bank;
      if (dest) {
        const pulse = 4 + Math.sin(G.time * 4) * 1.5;
        mm.fillStyle = '#ffc93b';
        mm.beginPath();
        mm.arc(sx(dest.x), sz(dest.z), pulse, 0, Math.PI * 2);
        mm.fill();
      }
      // Police (flashing red/blue), traffic (white), player (gold arrow).
      for (const c of G.cars.police) {
        mm.fillStyle = Math.floor(G.time * 6) % 2 === 0 ? '#ff3b30' : '#3b82ff';
        mm.beginPath();
        mm.arc(sx(c.mesh.position.x), sz(c.mesh.position.z), 3.5, 0, Math.PI * 2);
        mm.fill();
      }
      mm.fillStyle = 'rgba(255,255,255,0.85)';
      for (const c of G.cars.traffic) {
        mm.fillRect(sx(c.mesh.position.x) - 1.5, sz(c.mesh.position.z) - 1.5, 3, 3);
      }
      const p = G.player.mesh.position;
      mm.save();
      mm.translate(sx(p.x), sz(p.z));
      mm.rotate(-G.player.heading);
      mm.fillStyle = '#ffc93b';
      mm.beginPath();
      mm.moveTo(0, -6); mm.lineTo(4.5, 5); mm.lineTo(-4.5, 5); mm.closePath();
      mm.fill();
      mm.restore();
    },
  };
  return H;
}
