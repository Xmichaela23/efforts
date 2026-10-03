import React from 'react';
import type { WorkoutShape as Shape } from '@shared/workout-shape.ts';
import { workoutShapeSvg, type ShapeVariant } from '@/lib/workout-shape-svg';

/**
 * The workout shape on a screen (2026-10-03): the server's `shape` on a planned run or ride, drawn by the one drawing
 * the plan sheet uses too (`workout-shape-svg.ts`). Thin on Today's card, tall with the dashed line in the drawer.
 */
const WorkoutShape: React.FC<{ shape: Shape | null | undefined; color: string; variant: Exclude<ShapeVariant, 'sheet'>; className?: string; style?: React.CSSProperties }> = ({ shape, color, variant, className, style }) => {
  const svg = workoutShapeSvg(shape, { color, variant });
  if (!svg) return null;
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: svg }} />;
};

export default WorkoutShape;
