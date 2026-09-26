/**
 * ⛔ THE PROGRAM OUTLINE SHEET (2026-09-25) — what the athlete's standing plan is, on one sheet.
 *
 * Opened from the plan name under the date on Today (`get-week` → `training_plan_context.programOutline`) and from
 * Info on the weekly planner (`plan-overview` → `overview.program_outline`). The server composes every word
 * (`_shared/standing-plan/program-outline.ts`); this prints the sections in the order sent and decides nothing.
 * Same drawer and surface as Today's session sheet.
 */
import React from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import type { ProgramOutline } from '@shared/standing-plan/program-outline.ts';

export default function ProgramOutlineSheet({
  outline,
  open,
  onOpenChange,
}: {
  outline: ProgramOutline | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!outline) return null;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="bg-black/90 backdrop-blur-xl border-white/20"
        style={{ maxHeight: '85vh' }}
        aria-describedby={undefined}
      >
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-white font-normal tracking-wide text-body">{outline.title ?? ''}</DrawerTitle>
        </DrawerHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 space-y-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', WebkitOverflowScrolling: 'touch' }}
        >
          {outline.sections.map((section, i) => (
            <section key={`${section.heading ?? 'foot'}-${i}`}>
              {section.heading ? (
                <h3 className="text-caption font-semibold uppercase tracking-wide text-label-secondary mb-1">
                  {section.heading}
                </h3>
              ) : null}
              <div className="space-y-1.5">
                {section.lines.map((line, j) => (
                  <p
                    key={j}
                    className={section.heading
                      ? 'text-subhead leading-snug text-label'
                      : 'text-footnote leading-snug text-label-secondary'}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
