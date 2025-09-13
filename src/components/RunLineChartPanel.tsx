// components/run/RunLineChartPanel.tsx
import * as React from "react";
import clsx from "clsx";

export type MetricKey = "PWR" | "CAD";

export default function RunLineChartPanel({
  initial = "PWR",
  onRender, // (metric, el) => mount your existing line chart
  className = "",
  height = 210,
}: {
  initial?: MetricKey;
  onRender: (metric: MetricKey, el: HTMLDivElement) => void;
  className?: string;
  height?: number;
}) {
  const [tab, setTab] = React.useState<MetricKey>(initial);
  const mountRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!mountRef.current) return;
    // clear any previous drawing
    mountRef.current.innerHTML = "";
    onRender(tab, mountRef.current);
    // unmount hook (optional): if your renderer returns a destroy function, call it here
  }, [tab, onRender]);

  return (
    <div className={clsx("mt-2", className)}>
      {/* Chart card (same look) */}
      <div className="rounded-2xl border bg-card">
        <div
          ref={mountRef}
          className="w-full"
          style={{ height }}
          aria-label={`${tab} chart`}
        />
      </div>

      {/* Tabs row — same styling as your PACE/BPM/VAM/ELEV */}
      <nav className="mt-2 flex gap-3 px-1">
        {(["PWR", "CAD"] as MetricKey[]).map((k) => (
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
