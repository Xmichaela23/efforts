// Intervals.icu Phase 0 (2026-09-12): send planned rides to MICHAEL'S Intervals calendar with his personal key.
//
//   node --experimental-strip-types scripts/spike-intervals-push.ts <planned_workout_id> [...]   send (upsert by external_id)
//   node --experimental-strip-types scripts/spike-intervals-push.ts --verify                       read each sent event back, diff the text
//   node --experimental-strip-types scripts/spike-intervals-push.ts --delete                       remove every event this script sent
//
// Rides are read from .burner-intervals-spike-rides.json (written by _burner-intervals-spike-2026-09-12.mjs rides),
// so this script never touches the Efforts database. Key + athlete id: efforts/.env.local (never printed).
// Sent events are recorded in .burner-intervals-spike-sent.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serializeRide } from '../supabase/functions/_shared/intervals/serialize.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RIDES_PATH = join(ROOT, '.burner-intervals-spike-rides.json');
const SENT_PATH = join(ROOT, '.burner-intervals-spike-sent.json');

const env: Record<string, string> = {};
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const KEY = env.INTERVALS_SPIKE_API_KEY;
const ATHLETE = env.INTERVALS_SPIKE_ATHLETE_ID;
if (!KEY || !ATHLETE) { console.error('INTERVALS_SPIKE_API_KEY / INTERVALS_SPIKE_ATHLETE_ID missing from .env.local'); process.exit(1); }
const BASE = `https://intervals.icu/api/v1/athlete/${ATHLETE}`;
const AUTH = { Authorization: `Basic ${Buffer.from(`API_KEY:${KEY}`).toString('base64')}` };

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { ...AUTH, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${url.replace(BASE, '')} → ${res.status} ${typeof json === 'string' ? json : JSON.stringify(json)}`.slice(0, 600));
  return json;
}

type Sent = { planned_id: string; event_id: number; description: string; date: string; name: string };
const loadSent = (): Sent[] => (existsSync(SENT_PATH) ? JSON.parse(readFileSync(SENT_PATH, 'utf8')) : []);

async function send(ids: string[]) {
  const rides: any[] = JSON.parse(readFileSync(RIDES_PATH, 'utf8'));
  const sent = loadSent();
  for (const id of ids) {
    const row = rides.find((r) => r.id === id);
    if (!row) throw new Error(`planned workout ${id} is not in ${RIDES_PATH}`);
    const event = serializeRide(row);
    // Bulk upsert: external_id matches events this key created before, so a re-send updates in place.
    const out = await call('POST', `${BASE}/events/bulk?upsert=true`, [event]);
    const created = Array.isArray(out) ? out[0] : out;
    console.log(`\nsent ${id} → Intervals event ${created?.id} on ${event.start_date_local} "${event.name}"`);
    console.log('--- description sent ---');
    console.log(event.description);
    const rest = sent.filter((s) => s.planned_id !== id);
    rest.push({ planned_id: id, event_id: created?.id, description: event.description, date: row.date, name: event.name });
    writeFileSync(SENT_PATH, JSON.stringify(rest, null, 2));
    sent.splice(0, sent.length, ...rest);
  }
}

async function verify() {
  for (const s of loadSent()) {
    const ev = await call('GET', `${BASE}/events/${s.event_id}`);
    const same = String(ev.description ?? '') === s.description;
    console.log(`\nevent ${s.event_id} (${s.date} "${s.name}")  text identical: ${same}  moving_time=${ev.moving_time}  load=${ev.icu_training_load}`);
    if (!same) console.log('--- came back as ---\n' + ev.description);
    const steps: any[] = ev.workout_doc?.steps ?? [];
    console.log(`  Intervals parsed ${steps.length} step(s):`);
    for (const st of steps) {
      console.log(`    ${st.duration}s  power=${JSON.stringify(st.power ?? null)}  freeride=${st.freeride ?? false}  text=${JSON.stringify(st.text ?? null)}`);
    }
  }
}

async function remove() {
  for (const s of loadSent()) {
    await call('DELETE', `${BASE}/events/${s.event_id}`);
    console.log(`deleted event ${s.event_id} (${s.date} "${s.name}")`);
  }
  writeFileSync(SENT_PATH, '[]');
}

const args = process.argv.slice(2);
if (args[0] === '--verify') await verify();
else if (args[0] === '--delete') await remove();
else if (args.length) await send(args);
else { console.error('usage: <planned_workout_id> [...] | --verify | --delete'); process.exit(1); }
