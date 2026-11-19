// SOLMARA — save: progress in localStorage (money, jobs, stats).
SOL.save = {
  KEY: 'solmara-save-v1',
  save() {
    const G = SOL.G;
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        money: G.money, missionIndex: G.missionIndex, missionDone: G.missionDone,
        stats: G.stats, hp: G.hp,
      }));
    } catch (e) { /* storage unavailable (file://, private mode) — play on */ }
  },
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (typeof d.money !== 'number' || !Array.isArray(d.missionDone)) return null;
      return d;
    } catch (e) { return null; }
  },
  apply(d) {
    const G = SOL.G;
    G.money = d.money || 0;
    G.missionIndex = Math.min(d.missionIndex || 0, 5);
    G.missionDone = d.missionDone.slice(0, 5);
    while (G.missionDone.length < 5) G.missionDone.push(false);
    G.stats = Object.assign({ carsStolen: 0, fares: 0, busts: 0 }, d.stats);
    G.hp = G.maxHp;
  },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* ignore */ } },
};
