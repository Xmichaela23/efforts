#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const bakerPath = path.join(repoRoot, 'src/services/plans/tools/plan_bake_and_compute.ts');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run bake -- <path/to/plan.json> [output.json]');
  process.exit(1);
}

const outPath = process.argv[3] || inputPath.replace(/\.json$/i, '.baked.json');

// Dynamically run the TypeScript file via ts-node programmatically
// Fallback to spawning ts-node could be added, but we can do a simple ESM loader
const { spawnSync } = await import('node:child_process');

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(cmd, [
  'ts-node',
  bakerPath,
  inputPath
], { cwd: repoRoot, encoding: 'utf8' });

if (result.status !== 0) {
  console.error(result.stderr || 'Bake failed');
  process.exit(result.status || 1);
}

const baked = result.stdout;
writeFileSync(outPath, baked, 'utf8');
console.log(`Baked: ${path.relative(repoRoot, inputPath)} -> ${path.relative(repoRoot, outPath)}`);


