// @ts-nocheck
import React, {useEffect, useMemo, useRef, useState} from 'react';
import mapboxgl from 'mapbox-gl';

/** ---------- Types for aligned series ---------- */
type Sample = {
  t_s: number;        // seconds from start
  d_m: number;        // cumulative meters
  elev_m_sm: number;  // smoothed elevation
  pace_s_per_km: number | null;
  hr_bpm: number | null;
  vam_m_per_h: number | null;
  grade: number | null;
};
type Split = { startIdx:number; endIdx:number; time_s:number; dist_m:number; avgPace_s_per_km:number|null; avgHr_bpm:number|null; gain_m:number; avgGrade:number|null };
type MetricTab = 'pace'|'bpm'|'vam'|'elev';

/** ---------- Small formatters ---------- */
const clamp = (v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const fmtTime=(sec:number)=>{const h=Math.floor(sec/3600);const m=Math.floor((sec%3600)/60);const s=Math.floor(sec%60);return h>0?`${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`:`${m}:${s.toString().padStart(2,'0')}`;};
const fmtPace=(secPerKm:number|null,useMi=true)=>{if(secPerKm==null||!Number.isFinite(secPerKm))return'—';const spm=useMi?secPerKm*1.60934:secPerKm;const m=Math.floor(spm/60);const s=Math.round(spm%60);return `${m}:${s.toString().padStart(2,'0')}/${useMi?'mi':'km'}`;};
const fmtDist=(m:number,useMi=true)=>useMi?`${(m/1609.34).toFixed(1)} mi`:`${(m/1000).toFixed(2)} km`;
const fmtAlt=(m:number,useFeet=true)=>useFeet?`${Math.round(m*3.28084)} ft`:`${Math.round(m)} m`;
const fmtPct=(x:number|null)=>x==null?'—':`${(x*100).toFixed(1)}%`;
const fmtVAM=(mPerH:number|null,useFeet=true)=>mPerH==null?'—':useFeet?`${Math.round(mPerH*3.28084)} ft/h`:`${Math.round(mPerH)} m/h`;

/** ---------- Geometry helpers for Mapbox cursor along line ---------- */
const R = 6371000;
function hav(a:[number,number], b:[number,number]) {
  const [lon1,lat1]=a, [lon2,lat2]=b;
  const φ1=lat1*Math.PI/180, φ2=lat2*Math.PI/180, dφ=(lat2-lat1)*Math.PI/180, dλ=(lon2-lon1)*Math.PI/180;
  const s = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2*R*Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}
function prepLine(track:[number,number][]) {
  const cum=[0];
  for (let i=1;i<track.length;i++) cum[i] = cum[i-1] + hav(track[i-1], track[i]);
  return cum;
}
function pointAtDistance(track:[number,number][], cum:number[], target:number): [number,number] {
  if (!track.length) return [0,0];
  const total = cum[cum.length-1] || 1;
  const t = clamp(target, 0, total);
  // find segment
  let i = cum.findIndex(x => x >= t);
  if (i <= 0) return track[0];
  const d0=cum[i-1], d1=cum[i], segLen=Math.max(1e-6,d1-d0);
  const r = (t-d0)/segLen;
  const [lon0,lat0]=track[i-1], [lon1,lat1]=track[i];
  return [lon0 + (lon1-lon0)*r, lat0 + (lat1-lat0)*r];
}

/** ---------- Splits ---------- */
function computeSplits(samples: Sample[], metersPerSplit: number): Split[] {
  if (samples.length<2) return [];
  const out: Split[] = [];
  let start=0; let next = samples[0].d_m + metersPerSplit;
  for (let i=1;i<samples.length;i++) {
    if (samples[i].d_m >= next) {
      out.push(buildSplit(samples, start, i));
      start = i+1; next += metersPerSplit;
    }
  }
  if (start < samples.length-1) out.push(buildSplit(samples, start, samples.length-1));
  return out;
}
function buildSplit(samples:Sample[], s:number, e:number): Split {
  const S=samples[s], E=samples[e];
  const dist=E.d_m - S.d_m, time=E.t_s - S.t_s;
  let sumHr=0,nHr=0,gain=0,sumG=0,nG=0;
  for (let i=s+1;i<=e;i++){
    const h=samples[i].hr_bpm; if (Number.isFinite(h)) {sumHr+=h!; nHr++;}
    const e1 = Number.isFinite(samples[i].elev_m_sm as any) ? (samples[i].elev_m_sm as number) : (Number.isFinite(samples[i-1].elev_m_sm as any) ? (samples[i-1].elev_m_sm as number) : 0);
    const e0 = Number.isFinite(samples[i-1].elev_m_sm as any) ? (samples[i-1].elev_m_sm as number) : e1;
    const dh = e1 - e0; if (dh>0) gain += dh;
    let g = samples[i].grade;
    if (!Number.isFinite(g)) {
      const dd = Math.max(1, samples[i].d_m - samples[i-1].d_m);
      g = dh / dd;
    }
    if (Number.isFinite(g as number)) { sumG += (g as number); nG++; }
  }
  return {
    startIdx:s,endIdx:e,time_s:time,dist_m:dist,
    avgPace_s_per_km: dist>0 ? time/(dist/1000) : null,
    avgHr_bpm: nHr? Math.round(sumHr/nHr):null,
    gain_m:gain,
    avgGrade: nG? (sumG/nG):null
  };
}

/** ---------- Main Component with Mapbox GL ---------- */
export default function EffortsViewerMapbox({
  mapboxToken,
  samples,
  trackLngLat,
  useMiles = true,
  useFeet = true,
}: {
  mapboxToken: string;
  samples: Sample[];
  trackLngLat: [number,number][];
  useMiles?: boolean;
  useFeet?: boolean;
}) {
  const [tab,setTab] = useState<MetricTab>('elev');
  const [idx,setIdx] = useState(0);
  const [locked,setLocked] = useState(false);

  // ----- Mapbox setup -----
  const mapRef = useRef<mapboxgl.Map|null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const hasFitRef = useRef(false);
  const routeId = 'route-line';
  const routeSrc = 'route-src';
  const cursorId = 'cursor-pt';
  const cursorSrc = 'cursor-src';

  // prepare length metrics for cursor positioning
  const lineCum = useMemo(()=>prepLine(trackLngLat||[]), [trackLngLat]);

  useEffect(() => {
    if (!mapDivRef.current) return;
    if (!mapboxToken) return; // don't initialize without token
    if (mapRef.current) return; // once
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapDivRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      interactive: false
    });
    mapRef.current = map;

    map.on('load', () => {
      // route
      if (!map.getSource(routeSrc)) {
        map.addSource(routeSrc, { type: 'geojson', data: { type: 'Feature', geometry: { type:'LineString', coordinates: trackLngLat || [] } } as any });
      }
      if (!map.getLayer(routeId)) {
        map.addLayer({ id: routeId, type:'line', source: routeSrc, paint: { 'line-color':'#3b82f6', 'line-width':3 } });
      }
      // cursor point
      const startCoord = trackLngLat?.[0] ?? [-118.15,34.11];
      map.addSource(cursorSrc, { type:'geojson', data: { type:'Feature', geometry:{ type:'Point', coordinates:startCoord } } });
      map.addLayer({ id: cursorId, type:'circle', source: cursorSrc, paint: { 'circle-radius':6, 'circle-color':'#0ea5e9', 'circle-stroke-color':'#fff', 'circle-stroke-width':2 } });
      // fit bounds once without over-zoom
      if (!hasFitRef.current && trackLngLat && trackLngLat.length>1) {
        const b = new mapboxgl.LngLatBounds(trackLngLat[0], trackLngLat[0]);
        for (const c of trackLngLat) b.extend(c);
        map.fitBounds(b, { padding: 28, maxZoom: 13, animate: false });
        hasFitRef.current = true;
      }
    });

    return () => { map.remove(); mapRef.current = null; };
  }, [mapboxToken, trackLngLat]);

  // Update route source and fit when track changes after load
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const coords = trackLngLat || [];
    try {
      const src = map.getSource(routeSrc) as mapboxgl.GeoJSONSource | undefined;
      const data = { type:'Feature', geometry:{ type:'LineString', coordinates: coords } } as any;
      if (src) {
        src.setData(data);
      }
      if (!hasFitRef.current && coords.length > 1) {
        const b = new mapboxgl.LngLatBounds(coords[0], coords[0]);
        for (const c of coords) b.extend(c);
        map.fitBounds(b, { padding: 28, maxZoom: 13, animate: false });
        hasFitRef.current = true;
      }
    } catch {}
  }, [trackLngLat]);

  // move cursor marker when idx changes
  const dTotal = samples.length ? samples[samples.length-1].d_m : 1;
  const distNow = samples[idx]?.d_m ?? 0;
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const src = map.getSource(cursorSrc) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    const target = pointAtDistance(trackLngLat||[], lineCum, (lineCum[lineCum.length-1]||1) * (distNow/(dTotal||1)));
    src.setData({ type:'Feature', geometry:{ type:'Point', coordinates: target } } as any);
    // keep the current camera; do NOT refit on cursor move
  }, [idx, distNow, dTotal, trackLngLat, lineCum]);

  /** ---------- Chart + UI ---------- */
  const W=700,H=280,P=28;
  const tTotal = samples.length ? samples[samples.length-1].t_s : 0;

  const yDomain = useMemo(()=>{
    const vals = samples.map(s => tab==='elev' ? (s.elev_m_sm ?? NaN) : tab==='pace' ? (s.pace_s_per_km ?? NaN) : tab==='bpm' ? (s.hr_bpm ?? NaN) : (s.vam_m_per_h ?? NaN)).filter(Number.isFinite);
    if (!vals.length) return [0,1] as [number,number];
    let lo=Math.min(...vals), hi=Math.max(...vals); if (lo===hi){lo-=1;hi+=1;}
    // Ensure a sensible elevation range in feet/meters
    const basePad = tab==='elev' ? (useFeet ? 10 : 3) : 1;
    const pad=Math.max((hi-lo)*0.1, basePad);
    return [lo-pad, hi+pad] as [number,number];
  },[samples,tab,useFeet]);

  const linePath = useMemo(()=>{
    if (samples.length<2) return '';
    const [y0,y1]=yDomain;
    const x = (d:number)=>P + (d/(dTotal||1))*(W-P*2);
    const y = (v:number)=>{const t=(v-y0)/(y1-y0||1);return H-P - t*(H-P*2);};
    const metric=(s:Sample)=>tab==='elev'?(s.elev_m_sm ?? 0):tab==='pace'?(s.pace_s_per_km??0):tab==='bpm'?(s.hr_bpm??0):(s.vam_m_per_h??0);
    let d=`M ${x(samples[0].d_m)} ${y(metric(samples[0]))}`;
    for (let i=1;i<samples.length;i++) d+=` L ${x(samples[i].d_m)} ${y(metric(samples[i]))}`;
    return d;
  },[samples,yDomain,dTotal,tab]);

  const elevArea = useMemo(()=>{
    if (tab!=='elev' || samples.length<2) return '';
    const [y0,y1]=yDomain;
    const x=(d:number)=>P + (d/(dTotal||1))*(W-P*2);
    const y=(v:number)=>{const t=(v-y0)/(y1-y0||1);return H-P - t*(H-P*2);};
    let d=`M ${x(samples[0].d_m)} ${y(samples[0].elev_m_sm)}`;
    for(let i=1;i<samples.length;i++) d+=` L ${x(samples[i].d_m)} ${y(samples[i].elev_m_sm)}`;
    d+=` L ${x(samples[samples.length-1].d_m)} ${H-P} L ${x(samples[0].d_m)} ${H-P} Z`;
    return d;
  },[samples,yDomain,dTotal,tab]);

  const splits = useMemo(()=>computeSplits(samples, useMiles?1609.34:1000),[samples,useMiles]);

  const xToIdx=(clientX:number, svg:SVGSVGElement)=>{
    const r=svg.getBoundingClientRect();
    const px=clamp(clientX-r.left,P,W-P); const ratio=(px-P)/(W-P*2); const target=ratio*(dTotal||1);
    let lo=0,hi=samples.length-1;
    while(lo<hi){const m=Math.floor((lo+hi)/2); (samples[m].d_m<target)?(lo=m+1):(hi=m);} return lo;
  };
  const snapIdx=(i:number)=>{
    if(!splits.length) return i;
    const d=samples[i].d_m; let best=null as null|number, delta=Infinity;
    for (const sp of splits){
      const a=samples[sp.startIdx].d_m, b=samples[sp.endIdx].d_m;
      for (const ed of [a,b]){ const dd=Math.abs(ed-d)/(dTotal||1); if(dd<delta){delta=dd; best=ed;} }
    }
    if (best!=null && delta<0.005){ let lo=0,hi=samples.length-1; while(lo<hi){const m=Math.floor((lo+hi)/2); (samples[m].d_m<best)?(lo=m+1):(hi=m);} return lo; }
    return i;
  };

  const svgRef = useRef<SVGSVGElement>(null);
  const onMove = (e:React.MouseEvent<SVGSVGElement>)=>{ if(locked) return; setIdx(snapIdx(xToIdx(e.clientX, svgRef.current!))); };
  const onTouch = (e:React.TouchEvent<SVGSVGElement>)=>{ if(locked) return; const t=e.touches[0]; if(!t) return; setIdx(snapIdx(xToIdx(t.clientX, svgRef.current!))); };

  const s = samples[idx] || samples[samples.length-1];
  const cx = P + ((s?.d_m ?? 0) / (dTotal||1))*(W-P*2);

  const yMap=(v:number)=>{const [a,b]=yDomain; const t=(v-a)/(b-a||1); return H-P - t*(H-P*2);};
  const yTicks = useMemo(()=>{const [a,b]=yDomain; const step=(b-a)/4; return new Array(5).fill(0).map((_,i)=>a+i*step);},[yDomain]);

  const activeSplitIx = useMemo(()=>splits.findIndex(sp => idx>=sp.startIdx && idx<=sp.endIdx),[idx,splits]);

  const readoutSecond =
    tab==='elev' ? `Alt ${fmtAlt(s?.elev_m_sm??0,useFeet)} · Grade ${fmtPct(s?.grade??null)}`
    : tab==='pace' ? `Pace ${fmtPace(s?.pace_s_per_km??null,useMiles)} · Grade ${fmtPct(s?.grade??null)}`
    : tab==='bpm'  ? `HR ${s?.hr_bpm??'—'} bpm · Pace ${fmtPace(s?.pace_s_per_km??null,useMiles)}`
    : `VAM ${fmtVAM(s?.vam_m_per_h??null,useFeet)} · Grade ${fmtPct(s?.grade??null)}`;

  return (
    <div style={{maxWidth:780, margin:'0 auto', fontFamily:'Inter, system-ui, sans-serif'}}>
      {/* Mapbox map */}
      <div ref={mapDivRef} style={{height:160, borderRadius:12, overflow:'hidden', marginBottom:12, boxShadow:'0 2px 10px rgba(0,0,0,.06)'}} />

      {/* Tabs */}
      <div style={{display:'flex', gap:16, margin:'6px 6px 10px 6px', fontWeight:600}}>
        {(['pace','bpm','vam','elev'] as MetricTab[]).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            border:'none', background:'transparent', color: tab===t?'#0f172a':'#64748b', cursor:'pointer',
            padding:'6px 2px', borderBottom: tab===t?'2px solid #0ea5e9':'2px solid transparent'
          }}>{t.toUpperCase()}</button>
        ))}
        <div style={{marginLeft:'auto', fontSize:12, color:'#94a3b8'}}>
          {useMiles?'mi/ft':'km/m'} • {tab==='pace'?'min/mi':tab==='bpm'?'bpm':tab==='vam'?'VAM':'alt'}
        </div>
      </div>

      {/* Chart + sticky readout */}
      <div style={{position:'relative'}}>
        <div style={{
          position:'absolute', right:8, bottom:12, zIndex:2,
          background:'rgba(255,255,255,.9)', backdropFilter:'blur(6px)',
          border:'1px solid #e2e8f0', boxShadow:'0 4px 12px rgba(0,0,0,.06)',
          borderRadius:12, padding:'10px 12px', minWidth:220
        }}>
          <div style={{fontWeight:700, color:'#0f172a', marginBottom:2}}>
            {fmtDist(s?.d_m ?? 0, useMiles)} · {fmtTime(s?.t_s ?? 0)}
          </div>
          <div style={{color:'#0ea5e9', fontWeight:600, marginBottom:2}}>
            {tab==='pace'?fmtPace(s?.pace_s_per_km??null,useMiles):tab==='bpm'?`${s?.hr_bpm??'—'} bpm`:tab==='vam'?fmtVAM(s?.vam_m_per_h??null,useFeet):fmtAlt(s?.elev_m_sm??0,useFeet)}
          </div>
          <div style={{fontSize:13, color:'#475569'}}>{readoutSecond}</div>
          <div style={{marginTop:6, fontSize:11, color:'#94a3b8'}}>Computed</div>
        </div>

        <svg
          ref={svgRef} width={700} height={280}
          onMouseMove={onMove} onTouchStart={onTouch} onTouchMove={onTouch}
          onDoubleClick={()=>setLocked(l=>!l)}
          style={{display:'block', width:'100%', height:'auto', borderRadius:12, background:'#fff'}}
        >
          {/* vertical grid */}
          {[0,1,2,3,4].map(i=>{
            const x=P + i*((W-P*2)/4);
            return <line key={i} x1={x} x2={x} y1={P} y2={H-P} stroke="#e2e8f0" strokeDasharray="4 4"/>;
          })}
          {/* horizontal ticks */}
          {yTicks.map((v,i)=>(
            <g key={i}>
              <line x1={P} x2={W-P} y1={yMap(v)} y2={yMap(v)} stroke="#eef2f7"/>
              <text x={8} y={yMap(v)-4} fill="#94a3b8" fontSize={11}>
                {tab==='elev'?fmtAlt(v,useFeet):tab==='pace'?fmtPace(v,useMiles):tab==='bpm'?`${Math.round(v)}`:fmtVAM(v,useFeet)}
              </text>
            </g>
          ))}

          {/* elevation area for depth */}
          {tab==='elev' && <path d={elevArea} fill="#e2f2ff" opacity={0.65}/>} 
          {/* line */}
          <path d={linePath} fill="none" stroke="#94a3b8" strokeWidth={2}/>
          {/* cursor */}
          <line x1={cx} x2={cx} y1={P} y2={H-P} stroke="#0ea5e9" strokeWidth={1.5}/>
          <circle cx={cx} cy={(() => {
            const v = tab==='elev'? s?.elev_m_sm : tab==='pace'? s?.pace_s_per_km : tab==='bpm'? s?.hr_bpm : s?.vam_m_per_h;
            return yMap((v ?? 0) as number);
          })()} r={5} fill="#0ea5e9" stroke="#fff" strokeWidth={2}/>
        </svg>
      </div>

      {/* Splits */}
      <div style={{marginTop:14, borderTop:'1px solid #e2e8f0', paddingTop:10}}>
        <div style={{fontWeight:700, color:'#0f172a', marginBottom:8}}>Splits ({useMiles?'mi':'km'})</div>
        <div style={{display:'grid', gridTemplateColumns:'64px 1fr 1fr 1fr 1fr', gap:8, fontSize:14}}>
          <div style={{fontWeight:600, color:'#64748b'}}>#</div>
          <div style={{fontWeight:600, color:'#64748b'}}>Time</div>
          <div style={{fontWeight:600, color:'#64748b'}}>Pace</div>
          <div style={{fontWeight:600, color:'#64748b'}}>Gain</div>
          <div style={{fontWeight:600, color:'#64748b'}}>Grade</div>
          {splits.map((sp,i)=>{
            const active = i===activeSplitIx;
            const cell=(c:any)=> <div style={{padding:'8px 4px', background:active?'#f0f9ff':undefined, borderRadius:8}}>{c}</div>;
            return (
              <React.Fragment key={i}>
                {cell(i+1)}
                {cell(fmtTime(sp.time_s))}
                {cell(fmtPace(sp.avgPace_s_per_km,useMiles))}
                {cell(fmtAlt(sp.gain_m,useFeet))}
                {cell(fmtPct(sp.avgGrade))}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div style={{marginTop:14, color:'#94a3b8', fontSize:12}}>
        Drag to scrub • Double-tap chart to {locked?'unlock':'lock'} • Cursor snaps near split edges
      </div>
    </div>
  );
}


