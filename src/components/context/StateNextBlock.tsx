import React from 'react';
import { Row, Chip, Dot, fmtDate } from './state-primitives';

/**
 * NEXT — extracted from StateTab 2026-09-01 (Round 0a). No behaviour change, JSX verbatim.
 */
export default function StateNextBlock({
  nextSessions,
}: {
  nextSessions: Array<{ date: string; name?: string | null; type?: string | null }>;
}) {
  return (
    <div className="px-3 py-3">
      <Row label="NEXT">
        {nextSessions.length === 0 && <Chip value="week complete" valueClass="text-white/55" />}
        {nextSessions.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Dot />}
            <Chip label={fmtDate(s.date)} value={s.name ?? s.type} />
          </React.Fragment>
        ))}
      </Row>
    </div>
  );
}
