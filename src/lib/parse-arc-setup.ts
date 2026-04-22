const ARC_SETUP_RE = /<arc_setup>\s*([\s\S]*?)\s*<\/arc_setup>/i;

export type ArcSetupPayload = {
  summary?: string;
  goals?: unknown[];
  athlete_identity?: Record<string, unknown>;
};

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
    const parsed = JSON.parse(m[1].trim()) as ArcSetupPayload;
    return { displayText, payload: parsed && typeof parsed === 'object' ? parsed : null };
  } catch {
    return { displayText, payload: null };
  }
}
