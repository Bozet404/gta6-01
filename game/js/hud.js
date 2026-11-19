// SOLMARA — HUD: DOM readouts, the canvas minimap, banners, the message
// feed, the damage flash and the hitmarker.
SOL.hud = {
  mapCtx: null, bannerTimer: 0, feedTimer: 0,
  init() {
    const c = SOL.util.el('minimap');
    this.mapCtx = c.getContext('2d');
  },
  setObjective(html) { SOL.util.el('objective').innerHTML = html; },
  prompt(html) {
    const e = SOL.util.el('interact');
    if (html) { e.innerHTML = html; e.style.display = 'block'; }
    else e.style.display = 'none';
  },
  say(text) {
    const feed = SOL.util.el('feed');
    const div = document.createElement('div');
    div.textContent = text;
    feed.appendChild(div);
    while (feed.children.length > 3) feed.removeChild(feed.firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
  },
  banner(title, sub) {
    const b = SOL.util.el('banner');
    b.querySelector('h2').textContent = title;
    b.querySelector('p').textContent = sub || '';
    b.style.display = 'block';
    this.bannerTimer = 3.2;
  },
  flashDamage() {
    const d = SOL.util.el('damage');
    d.style.opacity = '1';
    setTimeout(() => { d.style.opacity = '0'; }, 130);
  },
  hitmarker() {
    const c = SOL.util.el('crosshair');
    c.style.filter = 'brightness(2) sepia(1) hue-rotate(-40deg) saturate(5)';
    setTimeout(() => { c.style.filter = ''; }, 120);
  },
  update(dt) {
    const G = SOL.G, U = SOL.util;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) SOL.util.el('banner').style.display = 'none';
    }
    // Stars.
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '<span class="off">★</span>';
    SOL.util.el('stars').innerHTML = stars;
    SOL.util.el('money').textContent = U.fmtMoney(G.money);
    const hp = Math.max(0, G.hp);
    SOL.util.el('hpbar').style.width = hp + '%';
    // Green while healthy, orange when hurt, red when critical.
    SOL.util.el('hpbar').style.background = hp > 50
      ? 'linear-gradient(90deg,#2fbf71,#9be15d)'
      : hp > 25 ? 'linear-gradient(90deg,#ff9a3d,#ffd23f)'
      : 'linear-gradient(90deg,#ff5a4e,#ff7a5c)';
    SOL.util.el('armorline').textContent =
      `Jobs done: ${G.missionDone.filter(Boolean).length}/5  ·  Cars stolen: ${G.stats.carsStolen}  ·  Fares: ${G.stats.fares}`;
    // Ammo + speed.
    SOL.util.el('ammo').textContent = G.reloading ? 'RELOADING…' : `🔫 ${G.ammo} / ${G.reserveAmmo}`;
    const speed = G.playerCar ? Math.abs(G.playerCar.speed) * 3.6 : Math.abs(G.player.speed || 0) * 3.6;
    SOL.util.el('speed').textContent = G.playerCar ? `${Math.round(speed)} km/h` : '';
    SOL.util.el('crosshair').style.display =
      (G.state === 'playing' && (!G.playerCar || true)) ? 'block' : 'none';
    // Clock: one game hour per 2 real minutes, starting 12:00.
    const mins = (12 * 60 + Math.floor(G.time * 0.5)) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    SOL.util.el('clock').textContent = `SOLMARA · ${hh}:${mm}`;
    this.drawMinimap();
  },
  drawMinimap() {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const G = SOL.G, S = 200, W = 400;
    const toMap = (x, z) => [(x + W / 2) / W * S, (z + W / 2) / W * S];
    ctx.clearRect(0, 0, S, S);
    // Sea + beach on the west edge.
    ctx.fillStyle = '#1d7fb8'; ctx.fillRect(0, 0, 14, S);
    ctx.fillStyle = '#e8d49a'; ctx.fillRect(14, 0, 8, S);
    ctx.fillStyle = '#cbb98f'; ctx.fillRect(22, 0, S - 22, S);
    // Roads.
    ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 4;
    for (const c of SOL.city.ROADS) {
      const [x1] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, S); ctx.stroke();
      const [, z1] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, z1); ctx.lineTo(S, z1); ctx.stroke();
    }
    // Mission marker.
    if (SOL.missions.markerTarget) {
      const [mx, my] = toMap(SOL.missions.markerTarget.x, SOL.missions.markerTarget.z);
      const pulse = 6 + Math.sin(G.time * 4) * 2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a5b00'; ctx.lineWidth = 2; ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = '#dfe6ea';
    for (const c of G.traffic) {
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    // Cops.
    ctx.fillStyle = '#ff2a1a';
    for (const c of G.cops) {
      const [x, y] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Enemies.
    ctx.fillStyle = '#ff7a1a';
    for (const e of G.enemies) {
      const [x, y] = toMap(e.x, e.z);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const [px, py] = toMap(G.player.x, G.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(G.player.heading), Math.cos(G.player.heading)) + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10222f'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
};
