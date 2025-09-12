// components/run/RunChartPanelWithPower.tsx
import * as React from "react";
import clsx from "clsx";

/** Accept 1s samples as number[] or timestamped {t,v}[] */
type Sample = number | { t: number; v: number };
type Series = Sample[];

export type RunChartTab = "PACE" | "BPM" | "VAM" | "ELEV" | "PWR";

export function RunChartPanelWithPower({
  initial = "PACE",
  power,
  ftp,
  renderLineChart, // your existing renderer for PACE/BPM/VAM/ELEV (returns a node)
}: {
  initial?: RunChartTab;
  power?: Series;      // running power samples
  ftp?: number;        // running FTP for zones
  renderLineChart: (tab: Exclude<RunChartTab, "PWR">) => React.ReactNode;
}) {
  const [tab, setTab] = React.useState<RunChartTab>(initial);

  return (
    <div className="mt-2">
      {/* Chart card (same container as the others) */}
      <div className="rounded-2xl border bg-card">
        <div className="h-[210px] w-full">
          {tab === "PWR" ? (
            <PowerZonesBar power={power} ftp={ftp} />
          ) : (
            renderLineChart(tab as Exclude<RunChartTab, "PWR">)
          )}
        </div>
      </div>

      {/* Tabs row — same look/feel */}
      <nav className="mt-2 flex gap-3 px-1">
        {(["PACE", "BPM", "VAM", "ELEV", "PWR"] as RunChartTab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide uppercase",
              "text-gray-500",
              tab === k && "text-black border-2 border-amber-400"
            )}
          >
            {k}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------- Power zones (single stacked bar; no extra libs) ---------- */

type Zone = { id: string; label: string; pct: number; color: string };

function PowerZonesBar({ power, ftp }: { power?: Series; ftp?: number }) {
  const zones = React.useMemo<Zone[]>(() => {
    const f = Math.max(1, ftp || 250);
    const dist = zoneDistribution(power, f);
    // Use theme vars so it matches light/dark + your other charts
    return [
      { id: "Z1", label: "Z1 <55%",    pct: dist.Z1, color: "hsl(var(--muted))" },
      { id: "Z2", label: "Z2 56–75%",  pct: dist.Z2, color: "hsl(var(--muted-foreground))" },
      { id: "Z3", label: "Z3 76–90%",  pct: dist.Z3, color: "hsl(var(--secondary))" },
      { id: "Z4", label: "Z4 91–105%", pct: dist.Z4, color: "hsl(var(--primary) / 0.80)" },
      { id: "Z5", label: "Z5 106–120%",pct: dist.Z5, color: "hsl(var(--primary))" },
      { id: "Z6", label: "Z6 121–150%",pct: dist.Z6, color: "hsl(var(--destructive) / 0.85)" },
      { id: "Z7", label: "Z7 >150%",   pct: dist.Z7, color: "hsl(var(--destructive))" },
    ];
  }, [power, ftp]);

  const totalPct = Math.round(zones.reduce((a, z) => a + z.pct, 0));

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Percent of moving time in each power zone
        </div>
        <div className="text-xs tabular-nums">
          FTP: <span>{ftp ?? "—"}</span> W • {totalPct}%
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-6 w-full overflow-hidden rounded-lg border">
        <div className="flex h-full w-full">
          {zones.map((z) =>
            z.pct > 0 ? (
              <div
                key={z.id}
                style={{ width: `${z.pct}%`, background: z.color }}
                className="h-full"
                title={`${z.label} • ${z.pct.toFixed(1)}%`}
              />
            ) : null
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {zones.map((z) => (
          <div key={z.id} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border"
              style={{ background: z.color }}
            />
            <span className="tabular-nums">{z.label}</span>
            <span className="ml-auto tabular-nums">{z.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function normalize(series?: Series) {
  if (!series?.length) return [] as { t: number; v: number }[];
  return series.map((s, i) =>
    typeof s === "number" ? { t: i, v: s } : s
  );
}

function zoneDistribution(series: Series | undefined, ftp: number) {
  const s = normalize(series);
  if (!s.length) return emptyDist();

  let total = 0;
  const sec = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 };

  for (let i = 0; i < s.length; i++) {
    const cur = s[i];
    const next = s[i + 1];
    const dt = Math.max(1, (next?.t ?? cur.t + 1) - cur.t);
    total += dt;

    const v = cur.v;
    const pctFtp = v / ftp;

    const bucket =
      pctFtp < 0.55 ? "Z1" :
      pctFtp < 0.76 ? "Z2" :
      pctFtp < 0.91 ? "Z3" :
      pctFtp < 1.06 ? "Z4" :
      pctFtp < 1.21 ? "Z5" :
      pctFtp < 1.51 ? "Z6" : "Z7";

    // @ts-ignore
    sec[bucket] += dt;
  }

  const toPct = (x: number) => (total ? (x / total) * 100 : 0);
  return {
    Z1: +toPct(sec.Z1).toFixed(1),
    Z2: +toPct(sec.Z2).toFixed(1),
    Z3: +toPct(sec.Z3).toFixed(1),
    Z4: +toPct(sec.Z4).toFixed(1),
    Z5: +toPct(sec.Z5).toFixed(1),
    Z6: +toPct(sec.Z6).toFixed(1),
    Z7: +toPct(sec.Z7).toFixed(1),
  };
}

function emptyDist() {
  return { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 };
}
