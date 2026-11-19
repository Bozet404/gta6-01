// SOLMARA's hand-in program (Node 22, standard library only): it takes the
// game/ and screenshots/ sitting beside this file, copies them into the
// output directory, and writes the dossier the judge reads, built by the
// kit's own library so the bytes match what the scorer rebuilds.
// Run it anywhere with:  MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The grader hands us /output; everywhere else the env var stands in.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const repoDir = dirname(fileURLToPath(import.meta.url));

// The gate's caps, straight from the competition's gate: game/ at most 993
// entries and 48 MiB, the dossier text at most 160 KiB, 3-4 screenshots of
// at most 256 KiB each. Passing them here makes this program refuse exactly
// where the scorer would refuse the entry.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// The grader mounts the output folder, so it must never be torn down:
// just guarantee it is there, bringing any missing parents with it.
mkdirSync(outDir, { recursive: true });

function copyTree(name) {
  const from = join(repoDir, name);
  const to = join(outDir, name);
  if (!existsSync(from)) throw new Error(`missing ${name}/ beside main.ts`);
  cpSync(from, to, { recursive: true });
}

copyTree('game');
copyTree('screenshots');

const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`SOLMARA handed in: dossier.json (${dossier.length} bytes) in ${outDir}`);
