// The aerobic efficiency chart's line: the fitted end against the fitted start, whole percent, over the line's weeks.
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { efficiencyChangeLine, type TrendFit } from './trend-fit.ts';

const fit = (start: number, end: number, weeks: number): TrendFit =>
  ({ tooFew: false, start, end, weeks, n: 8, spanWeeks: weeks, building: false, low: end, high: start });

Deno.test('1.625 → 1.497 over 10 weeks reads 8% lower than 10 weeks ago', () => {
  assertEquals(efficiencyChangeLine(fit(1.625, 1.497, 10)), '8% lower than 10 weeks ago');
});
Deno.test('a rise reads higher; one week is singular', () => {
  assertEquals(efficiencyChangeLine(fit(1.4, 1.47, 1)), '5% higher than 1 week ago');
});
Deno.test('under half a percent reads the same', () => {
  assertEquals(efficiencyChangeLine(fit(1.5, 1.503, 6)), 'the same as 6 weeks ago');
});
Deno.test('no fitted line → no line', () => {
  assertEquals(efficiencyChangeLine({ tooFew: true, n: 2, spanWeeks: 1, building: true, low: 1, high: 1 }), null);
  assertEquals(efficiencyChangeLine(null), null);
});
