#!/usr/bin/env node
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { readJson, validatePlanObject, minifyPlan } from './lib/plan-validator.mjs'

function usage(){
  console.log('Usage: node scripts/plan-minify.mjs <input.json> [--out <file>] [--gz]');
}

try{
  const args = process.argv.slice(2);
  if (args.length===0) { usage(); process.exit(2); }
  const inPath = args[0];
  let outPath = null; let doGz = false;
  for (let i=1;i<args.length;i++){
    if (args[i]==='--out') { outPath = args[i+1]; i++; }
    else if (args[i]==='--gz') { doGz = true; }
  }
  const plan = readJson(inPath);
  const { errors, warnings } = validatePlanObject(plan);
  if (warnings.length) warnings.forEach(w=>console.warn('⚠️', w));
  if (errors.length) {
    errors.forEach(e=>console.error('❌', e));
    process.exit(1);
  }
  const min = minifyPlan(plan);
  if (!outPath) {
    const base = path.basename(inPath, path.extname(inPath));
    outPath = path.join(path.dirname(inPath), `${base}.min.json`);
  }
  fs.writeFileSync(outPath, min);
  console.log(`✅ Minified written to ${outPath}`);
  if (doGz) {
    const gz = zlib.gzipSync(Buffer.from(min,'utf8'));
    fs.writeFileSync(`${outPath}.gz`, gz);
    console.log(`✅ Gzip written to ${outPath}.gz`);
  }
  process.exit(0);
}catch(e){
  console.error('❌ plan-minify failed:', e.message||String(e));
  process.exit(1);
}


