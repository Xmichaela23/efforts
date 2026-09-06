/**
 * The word beside a number, everywhere a number is drawn (NumberRow on Profile and Adjust, 2026-09-06).
 * `isMine` is the auto / my-number switch; the resolver's source string only contributes "accepted".
 */
export const numberWord = (src: string | null | undefined, isMine: boolean): string => {
  if (isMine) return 'your number';
  const v = String(src ?? '').toLowerCase();
  if (!v || v === 'none') return '';
  if (v === 'accepted') return 'accepted';
  return 'auto';
};

/** Value + word, the pill's text. */
export const withWord = (num: string | null, src: string | null | undefined, isMine: boolean): string | null => {
  const w = numberWord(src, isMine);
  return num ? `${num}${w ? ` · ${w}` : ''}` : null;
};

/** The plain pill used for actions beside the rows (Rebuild, Retest…). */
export const pillClass = 'text-[13px] px-3 py-1.5 rounded-xl border border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-50';
