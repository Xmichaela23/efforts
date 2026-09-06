/** A State lens another screen asks for before State mounts (Profile's "Retest or rebuild on Adjust"). Read once by StateTab. */
export type StateLens = 'status' | 'adjust' | 'schedule';
let pendingLens: StateLens | null = null;
export const setPendingStateLens = (lens: StateLens | null) => { pendingLens = lens; };
export const takePendingStateLens = (): StateLens | null => { const l = pendingLens; pendingLens = null; return l; };
