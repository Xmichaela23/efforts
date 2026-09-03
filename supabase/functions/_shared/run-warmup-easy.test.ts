import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractWarmupEasy } from "./run-warmup-easy.ts";

// 1 Hz samples: 0–179 s fast-ish at rising HR (must be skipped), 180–419 s at 2.6 m/s 138 bpm, then hard.
function build(): any[] {
  const out: any[] = [];
  for (let t = 0; t < 1800; t += 1) {
    if (t < 180) out.push({ timerDurationInSeconds: t, heartRate: 110 + t / 4, speedMetersPerSecond: 3.0 });
    else if (t < 420) out.push({ timerDurationInSeconds: t, heartRate: 138, speedMetersPerSecond: 2.6 });
    else out.push({ timerDurationInSeconds: t, heartRate: 165, speedMetersPerSecond: 3.6 });
  }
  return out;
}

Deno.test("warm-up read: window minus the first 3 minutes, cool-down and work untouched", () => {
  const r = extractWarmupEasy(build(), 420, 1800);
  assertEquals(r?.pace_s_per_km, Math.round(1000 / 2.6));
  assertEquals(r?.hr_avg, 138);
  assertEquals(r?.seconds, 240);
  assertEquals(r?.source, "warmup");
});

Deno.test("warm-up shorter than 6 minutes → null (nothing left after the lag skip)", () => {
  assertEquals(extractWarmupEasy(build(), 300, 1800), null);
});

Deno.test("index-timed samples fall back to the recording's interval", () => {
  const s = build().map(({ heartRate, speedMetersPerSecond }) => ({ heartRate, speedMetersPerSecond }));
  const r = extractWarmupEasy(s, 420, 1800);
  assertEquals(r?.hr_avg, 138);
});

Deno.test("standing still inside the window is not easy running", () => {
  const s = build().map((x) => (x.timerDurationInSeconds >= 180 && x.timerDurationInSeconds < 420 ? { ...x, speedMetersPerSecond: 0.2 } : x));
  assertEquals(extractWarmupEasy(s, 420, 1800), null);
});
