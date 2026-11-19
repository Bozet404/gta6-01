// SOLMARA — hand-in program for make.fun gta6-01 (Node 22, stdlib only).
// It assembles the entry from this repository: the playable static game in
// game/, the 3-4 screenshots in screenshots/, and the judge's dossier in
// /output/dossier.json, written by the kit's vendored library. The game
// itself is built by hand in game/ — this file only packs it up.
//
// Run locally to preview the exact output the grader sees:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countFiles(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    n += statSync(p).isDirectory() ? countFiles(p) : 1;
  }
  return n;
}

const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');
if (!existsSync(gameSrc)) throw new Error('game/ is missing from the repository');
if (!existsSync(join(gameSrc, 'index.html'))) throw new Error('game/index.html is missing');

mkdirSync(outDir, { recursive: true });
cpSync(gameSrc, join(outDir, 'game'), { recursive: true });

const shots = existsSync(shotsSrc)
  ? readdirSync(shotsSrc).filter((f) => !f.startsWith('.')).sort()
  : [];
if (shots.length < 3 || shots.length > 4) {
  throw new Error(`expected 3-4 screenshots, found ${shots.length}`);
}
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`SOLMARA packed: ${countFiles(join(outDir, 'game'))} game files, ` +
  `${shots.length} screenshots (${shots[0]} is the cover), ` +
  `dossier ${Buffer.byteLength(dossier)} bytes -> ${outDir}`);
