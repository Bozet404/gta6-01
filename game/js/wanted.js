// SOLMARA — wanted: 0-5 stars, heat from crimes, police response, decay
// while hidden, and the BUSTED flow.
SOL.wanted = {
  caughtTimer: 0,
  addHeat(n, why) {
    const G = SOL.G;
    const before = G.wanted;
    G.wanted = Math.min(5, G.wanted + n);
    if (G.wanted > before) {
      G.hiddenTimer = 0;
      if (why) SOL.hud.say(why);
      this.syncCops();
      SOL.audio.blip(660, 0.15, 'square', 0.14, 440);
    }
  },
  // Keep the number of pursuing cop cars matched to the wanted level.
  syncCops() {
    const G = SOL.G;
    const want = G.wanted === 0 ? 0 : Math.min(1 + Math.floor((G.wanted - 1) / 2), 3);
    while (G.cops.length < want) {
      const a = Math.random() * Math.PI * 2;
      const d = 55 + Math.random() * 25;
      SOL.vehicles.spawnCop(
        SOL.util.clamp(G.player.x + Math.cos(a) * d, -190, 190),
        SOL.util.clamp(G.player.z + Math.sin(a) * d, -190, 190));
    }
    while (G.cops.length > want) {
      const c = G.cops.pop();
      G.scene.remove(c.group);
    }
  },
  // A cop on foot is touching the player: 2 seconds and it's over.
  caught(dt) {
    const G = SOL.G;
    if (G.state !== 'playing') return;
    this.caughtTimer += dt;
    SOL.hud.say(`The law has you — ${Math.max(0, 2 - this.caughtTimer).toFixed(1)}s to break free!`);
    if (this.caughtTimer >= 2) {
      this.caughtTimer = 0;
      this.busted('The Solmara PD caught up with you. $100 fine, and the heat is off — for now.');
    }
  },
  busted(text) {
    const G = SOL.G;
    if (G.state !== 'playing') return;
    G.state = 'busted';
    G.stats.busts++;
    G.money = Math.max(0, G.money - 100);
    G.wanted = 0; G.heat = 0;
    this.caughtTimer = 0;
    // Clear the pursuit.
    for (const c of G.cops) G.scene.remove(c.group);
    G.cops.length = 0;
    SOL.combat.clearEnemies();
    SOL.audio.busted();
    SOL.audio.setEngine(0, false);
    document.exitPointerLock && document.exitPointerLock();
    SOL.util.el('busted-text').textContent = text;
    SOL.util.el('busted').style.display = 'flex';
    SOL.missions.onBusted();
  },
  respawn() {
    const G = SOL.G;
    // Drop the player at the hospital, on foot, healthy.
    if (G.playerCar) { SOL.vehicles.leaveCar(G.playerCar); }
    G.hp = G.maxHp;
    G.player.x = SOL.city.spots.hospital.x;
    G.player.z = SOL.city.spots.hospital.z;
    G.player.onFoot = true;
    G.player.mesh.visible = true;
    G.player.mesh.position.set(G.player.x, 0, G.player.z);
    G.player.camYaw = 0;
    SOL.util.el('busted').style.display = 'none';
    G.state = 'playing';
    SOL.hud.say('Back on the streets. Stay out of trouble — or don\u2019t.');
  },
  update(dt) {
    const G = SOL.G;
    if (G.state !== 'playing') return;
    if (G.wanted > 0) {
      // Hidden = no cop within 40m. Decay one star per 12s hidden.
      let nearest = 1e9;
      for (const c of G.cops) nearest = Math.min(nearest, SOL.util.dist2(G.player.x, G.player.z, c.x, c.z));
      if (nearest > 40) {
        G.hiddenTimer += dt;
        if (G.hiddenTimer >= 12) {
          G.hiddenTimer = 0;
          G.wanted--;
          SOL.hud.say(G.wanted === 0 ? 'You lost them. The heat is off.' : `Heat dropping — ${G.wanted} star${G.wanted > 1 ? 's' : ''} left.`);
          this.syncCops();
        }
      } else G.hiddenTimer = 0;
      // Siren when a cop is near.
      SOL.audio.updateSiren(dt, G.wanted, nearest < 70);
    } else {
      SOL.audio.updateSiren(dt, 0, false);
    }
    if (this.caughtTimer > 0 && G.playerCar) this.caughtTimer = 0;
  },
};
