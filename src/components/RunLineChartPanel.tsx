// components/run/RunLineChartPanel.tsx
import * as React from "react";
import clsx from "clsx";

export type MetricKey = "PWR" | "CAD";

export default function RunLineChartPanel({
  initial = "PWR",
  header,
  onRender, // memoize in parent: useCallback((metric, el) => {...}, [])
  className = "",
  height = 210,
}: {
  initial?: MetricKey;
  header?: React.ReactNode;
  onRender: (metric: MetricKey, el: HTMLDivElement) => void | (() => void);
  className?: string;
  height?: number;
}) {
  const [tab, setTab] = React.useState<MetricKey>(initial);
  const mountRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    el.innerHTML = "";
    const cleanup = onRender(tab, el);
    return () => {
      try { cleanup && cleanup(); } catch {}
      if (el) el.innerHTML = "";
    };
    // ⬇️ rely on parent to memoize onRender
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className={clsx("mt-2", className)}>
      {/* Header with metrics */}
      {header && (
        <div className="mb-2">
          {header}
        </div>
      )}

      <div className="rounded-2xl border bg-card">
        <div
          ref={mountRef}
          className="w-full h-[210px]"   // match other panel's fixed height
          style={{ height }}              // override via prop if needed
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
              tab === k && "text-black underline decoration-2 underline-offset-4"
            )}
          >
            {k}
          </button>
        ))}
      </nav>
    </div>
  );
}
