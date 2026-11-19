// Save / load through localStorage: cash, story progress, position, health
// and the in-game clock. Autosave runs every 10 seconds while playing.
const KEY = 'solmara-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s !== 'object' || s === null) return null;
    return s;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function writeSave(G) {
  try {
    const p = G.player.mesh.position;
    const s = {
      money: Math.round(G.money),
      mission: G.missions.index,
      x: Math.round(p.x * 10) / 10,
      z: Math.round(p.z * 10) / 10,
      hp: Math.round(G.player.hp),
      clock: Math.round(G.clockHours * 100) / 100,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function applySave(G, s) {
  G.money = s.money ?? 50;
  G.player.hp = s.hp ?? 100;
  G.clockHours = s.clock ?? 9;
  G.player.mesh.position.set(s.x ?? -67, 0, s.z ?? -40);
  const target = Math.min(s.mission ?? 0, 4);
  G.missions.startJob(target);
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}
