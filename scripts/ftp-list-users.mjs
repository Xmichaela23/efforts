import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const all = [];
for (let page=1; page<=50; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
  if (error) { console.error(error); break; }
  if (!data.users.length) break;
  all.push(...data.users);
  if (data.users.length < 200) break;
}
console.log('total users:', all.length);
const matches = all.filter(u => {
  const e = (u.email || '').toLowerCase();
  return e.includes('michael') || e.includes('angel') || e.includes('me.com');
});
console.log('matches:');
for (const u of matches) console.log(' ', u.id, '|', u.email, '|', u.created_at);
