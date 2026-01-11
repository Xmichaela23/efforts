import React from "react";
import { EffortsButton, EffortsButtonPill, EffortsWordmark } from "./EffortsButton";

/**
 * Demo page - Tron / Bang & Olufsen aesthetic
 */
export function EffortsButtonDemo() {
  return (
    <div className="min-h-screen bg-[#050505] p-8">
      <div className="max-w-4xl mx-auto">
        <h1 
          className="text-2xl text-white/90 mb-1 tracking-tight"
          style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 300 }}
        >
          Efforts Button
        </h1>
        <p 
          className="text-white/40 mb-16 text-sm"
          style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 300 }}
        >
          Tron / Bang & Olufsen aesthetic
        </p>
        
        {/* Wordmark */}
        <section className="mb-20">
          <h2 
            className="text-xs uppercase tracking-[0.2em] text-white/30 mb-8"
            style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 500 }}
          >
            Wordmark
          </h2>
          <div className="flex flex-col gap-8">
            <EffortsWordmark size={72} />
            <EffortsWordmark size={48} />
            <EffortsWordmark size={32} />
          </div>
        </section>

        {/* Tron Variant */}
        <section className="mb-20">
          <h2 
            className="text-xs uppercase tracking-[0.2em] text-white/30 mb-8"
            style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 500 }}
          >
            Tron
          </h2>
          <div className="flex items-center gap-12 flex-wrap">
            <EffortsButton size={160} variant="tron" onClick={() => console.log('clicked!')} />
            <EffortsButton size={120} variant="tron" />
            <EffortsButton size={80} variant="tron" />
            <EffortsButton size={56} variant="tron" />
          </div>
        </section>

        {/* Minimal Variant */}
        <section className="mb-20">
          <h2 
            className="text-xs uppercase tracking-[0.2em] text-white/30 mb-8"
            style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 500 }}
          >
            Minimal
          </h2>
          <div className="flex items-center gap-12 flex-wrap">
            <EffortsButton size={160} variant="minimal" />
            <EffortsButton size={120} variant="minimal" />
            <EffortsButton size={80} variant="minimal" />
            <EffortsButton size={56} variant="minimal" />
          </div>
        </section>

        {/* Gradient Variant */}
        <section className="mb-20">
          <h2 
            className="text-xs uppercase tracking-[0.2em] text-white/30 mb-8"
            style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 500 }}
          >
            Discipline Gradient
          </h2>
          <div className="flex items-center gap-12 flex-wrap">
            <EffortsButton size={160} variant="gradient" />
            <EffortsButton size={120} variant="gradient" />
            <EffortsButton size={80} variant="gradient" />
            <EffortsButton size={56} variant="gradient" />
          </div>
        </section>

        {/* Pill Variant */}
        <section className="mb-20">
          <h2 
            className="text-xs uppercase tracking-[0.2em] text-white/30 mb-8"
            style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 500 }}
          >
            Pill
          </h2>
          <div className="flex items-center gap-8 flex-wrap">
            <EffortsButtonPill size={60} />
            <EffortsButtonPill size={48} />
            <EffortsButtonPill size={36} />
          </div>
        </section>

        {/* Usage */}
        <section className="bg-white/[0.02] rounded-xl p-6 border border-white/[0.06]">
          <h2 
            className="text-xs uppercase tracking-[0.2em] text-white/30 mb-4"
            style={{ fontFamily: "'SF Pro Display', system-ui, sans-serif", fontWeight: 500 }}
          >
            Usage
          </h2>
          <pre 
            className="text-sm text-teal-400/80 font-mono overflow-x-auto"
            style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}
          >
{`import { EffortsButton, EffortsButtonPill } from './EffortsButton';

// Tron style (default)
<EffortsButton size={120} />

// Ultra minimal
<EffortsButton size={120} variant="minimal" />

// Discipline gradient ring
<EffortsButton size={120} variant="gradient" />

// Pill shape
<EffortsButtonPill size={60} />`}
          </pre>
        </section>
      </div>
    </div>
  );
}

export default EffortsButtonDemo;
