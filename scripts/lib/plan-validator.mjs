#!/usr/bin/env node
import fs from 'node:fs'

export function readJson(path) {
  const raw = fs.readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

export function isTitleCaseDay(d) {
  return ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].includes(String(d));
}

export function validatePlanObject(plan) {
  const errors = [];
  const warn = [];
  if (!plan || typeof plan !== 'object') errors.push('plan must be an object');
  if (!plan.name) errors.push('plan.name is required');
  if (!plan.description) errors.push('plan.description is required');
  if (!Number.isFinite(plan.duration_weeks)) errors.push('plan.duration_weeks must be a number');
  const sbw = plan.sessions_by_week || {};
  if (!sbw || typeof sbw !== 'object' || Object.keys(sbw).length===0) errors.push('sessions_by_week is required and non-empty');

  const validTypes = new Set(['run','bike','swim','strength']);

  for (const wk of Object.keys(sbw)) {
    const list = Array.isArray(sbw[wk]) ? sbw[wk] : [];
    const byDay = new Map();
    for (const s of list) {
      const day = s?.day;
      if (!isTitleCaseDay(day)) errors.push(`week ${wk}: invalid day '${day}'`);
      const type = String(s?.type || s?.discipline || '').toLowerCase();
      if (!validTypes.has(type)) errors.push(`week ${wk} ${day}: invalid type '${type}' (use run|bike|swim|strength)`);
      if (!Number.isFinite(s?.duration)) errors.push(`week ${wk} ${day}: duration (minutes) is required`);
      if (!s?.name) warn.push(`week ${wk} ${day}: name missing (will be derived)`);
      if (!s?.description) warn.push(`week ${wk} ${day}: description missing`);
      if (type==='strength') {
        if (!Array.isArray(s?.strength_exercises)) errors.push(`week ${wk} ${day}: strength_exercises array required for strength`);
      } else {
        if (!Array.isArray(s?.steps_preset)) errors.push(`week ${wk} ${day}: steps_preset array required for ${type}`);
      }
      const tags = Array.isArray(s?.tags) ? s.tags.map(String) : [];
      if (tags.includes('brick')) {
        const key = `${day}`;
        const arr = byDay.get(key) || [];
        arr.push({ type, s });
        byDay.set(key, arr);
      }
    }
    // brick rules per day
    for (const [day, arr] of byDay.entries()) {
      const bricks = arr.filter(x => Array.isArray(x.s?.tags) && x.s.tags.includes('brick'));
      if (bricks.length !== 2) errors.push(`week ${wk} ${day}: brick requires exactly 2 sessions (bike + run)`);
      else {
        const order = bricks.map(b => b.type);
        if (!(order[0]==='bike' && order[1]==='run')) errors.push(`week ${wk} ${day}: brick order must be bike then run`);
      }
    }
  }

  return { errors, warnings: warn };
}

export function minifyPlan(plan) {
  // Create a compact clone without extraneous whitespace
  return JSON.stringify(plan);
}


