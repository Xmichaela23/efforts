import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hrDriftHalvesPct } from "./hr-drift-halves.ts";

function rec(len: number, f: (t: number) => number): any[] {
  const out: any[] = []; for (let t = 0; t < len; t += 1) out.push({ timerDurationInSeconds: t, heartRate: f(t) }); return out;
}

Deno.test("flat heart rate → 0% drift; the first 3 minutes do not count", () => {
  const r = hrDriftHalvesPct(rec(2400, (t) => (t < 180 ? 100 : 140)), 2400);
  assertEquals(r?.pct, 0);
  assertEquals(r?.first_avg_hr, 140);
});

Deno.test("second half 7 bpm above the first at 140 → 5.0%", () => {
  const r = hrDriftHalvesPct(rec(2580, (t) => (t < 180 ? 100 : t < 1380 ? 140 : 147)), 2580);
  assertEquals(r?.pct, 5);
});

Deno.test("under six usable minutes → null", () => {
  assertEquals(hrDriftHalvesPct(rec(400, () => 140), 400), null);
});

Deno.test("no heart rate → null", () => {
  assertEquals(hrDriftHalvesPct(rec(2400, () => NaN), 2400), null);
});
