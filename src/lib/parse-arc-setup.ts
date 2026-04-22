const ARC_SETUP_RE = /<arc_setup>\s*([\s\S]*?)\s*<\/arc_setup>/i;

export type ArcSetupPayload = {
  summary?: string;
  goals?: unknown[];
  athlete_identity?: Record<string, unknown>;
  /** Optional top-level; merged into each goal's training_prefs when saving */
  strength_frequency?: 0 | 1 | 2 | 3;
  strength_focus?: 'general' | 'power' | 'maintenance';
};

function innerJsonToParse(inner: string): string {
  let s = inner.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  }
  return s.trim();
}

/**
 * If visible prose ends with a question, the coach is still waiting on the athlete;
 * "Ready to save" should not appear in the same turn (avoids card + open question at once).
 */
export function coachVisibleProseSeeksReply(visible: string): boolean {
  const t = visible.trim();
  if (!t) return false;
  return /[?？]\s*$/.test(t);
}

export function parseArcSetupFromAssistant(raw: string): {
  displayText: string;
  payload: ArcSetupPayload | null;
} {
  const m = raw.match(ARC_SETUP_RE);
  const displayText = (m ? raw.replace(ARC_SETUP_RE, '') : raw).trim();
  if (!m) {
    return { displayText, payload: null };
  }
  try {
    const parsed = JSON.parse(innerJsonToParse(m[1])) as ArcSetupPayload;
    return { displayText, payload: parsed && typeof parsed === 'object' ? parsed : null };
  } catch {
    return { displayText, payload: null };
  }
}
