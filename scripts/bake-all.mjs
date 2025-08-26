#!/usr/bin/env node
import { readdirSync, statSync } from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const plansDir = process.argv[2] || path.join(root, 'public', 'plans.v1.0.0');

const files = readdirSync(plansDir)
  .filter(f => f.endsWith('.json') && !f.endsWith('.baked.json'))
  .map(f => path.join(plansDir, f));

if (files.length === 0) {
  console.log('No plan JSON files found to bake in', plansDir);
  process.exit(0);
}

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

for (const file of files) {
  const result = spawnSync(cmd, [
    'ts-node',
    path.join(root, 'src/services/plans/tools/plan_bake_and_compute.ts'),
    file
  ], { cwd: root, encoding: 'utf8' });

  if (result.status !== 0) {
    console.error('Bake failed for', file);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }

  const out = file.replace(/\.json$/i, '.baked.json');
  await (await import('fs/promises')).writeFile(out, result.stdout, 'utf8');
  console.log('Baked', path.basename(file), '->', path.basename(out));
}

console.log('All plans baked.');


