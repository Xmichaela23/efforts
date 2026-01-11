import * as React from "react";

/**
 * Efforts Wordmark - "efforts" with holographic "o"
 * The cascading discipline "e" becomes the "o"
 */
interface EffortsWordmarkProps {
  size?: number;
  className?: string;
}

export function EffortsWordmark({ size = 48, className = "" }: EffortsWordmarkProps) {
  const uniqueId = React.useId().replace(/:/g, '');
  const fontFamily = "'Rajdhani', 'Orbitron', system-ui, sans-serif";
  const circleSize = size * 2.4; // larger circle for breathing room
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // Parallax state
  const [parallax, setParallax] = React.useState({ x: 0, y: 0 });
  
  // Discipline colors for gradient ring
  const colors = {
    run: '#14b8a6',
    strength: '#f97316',
    ride: '#22c55e',
    pilates: '#c084fc',
    swim: '#2B5A8C',
  };
  
  // Parallax effect - device orientation for mobile, mouse for desktop
  React.useEffect(() => {
    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        // Normalize device orientation to parallax values
        const x = (e.gamma / 45) * 2; // -2 to 2
        const y = (e.beta / 45) * 2; // -2 to 2
        setParallax({ x: Math.max(-2, Math.min(2, x)), y: Math.max(-2, Math.min(2, y)) });
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = ((e.clientX - centerX) / rect.width) * 4; // -2 to 2
      const y = ((e.clientY - centerY) / rect.height) * 4; // -2 to 2
      setParallax({ x: Math.max(-2, Math.min(2, x)), y: Math.max(-2, Math.min(2, y)) });
    };
    
    const handleMouseLeave = () => {
      setParallax({ x: 0, y: 0 });
    };
    
    // Try device orientation first (mobile)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleDeviceOrientation as EventListener);
    }
    
    // Mouse parallax for desktop
    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
    }
    
    return () => {
      window.removeEventListener('deviceorientation', handleDeviceOrientation as EventListener);
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, []);
  
  // Parallax multipliers for each cascade layer (deeper = more movement)
  const parallaxLayers = [
    0,      // white e - no parallax
    0.3,    // teal - closest
    0.5,    // orange
    0.7,    // green
    0.9,    // purple
    1.1,    // swim blue - furthest
  ];
  
  return (
    <div ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      {/* Gradient circle with full-size "e" */}
      <svg
        width={circleSize}
        height={circleSize}
        viewBox="0 0 100 100"
        style={{ 
          marginRight: -size * 0.85, // overlap more onto ff
          zIndex: 2,
        }}
      >
        <defs>
          {/* Gradient for ring - equal 5 colors */}
          <linearGradient id={`ringGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.pilates}/>
            <stop offset="20%" stopColor={colors.swim}/>
            <stop offset="40%" stopColor={colors.run}/>
            <stop offset="60%" stopColor={colors.ride}/>
            <stop offset="80%" stopColor={colors.strength}/>
            <stop offset="100%" stopColor={colors.pilates}/>
          </linearGradient>
          
          <filter id={`ringGlow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          <filter id={`cascade-glow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Dark background inside circle - semi-transparent to show letters */}
        <circle cx={50} cy={50} r={44} fill="rgba(10,10,10,0.7)"/>
        
        {/* Gradient ring */}
        <circle
          cx={50}
          cy={50}
          r={46}
          fill="none"
          stroke={`url(#ringGrad-${uniqueId})`}
          strokeWidth={2}
          filter={`url(#ringGlow-${uniqueId})`}
        />
        
        {/* WHITE "e" - centered with breathing room, minimal parallax */}
        <text
          x={42}
          y={42}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={55}
          fontWeight={300}
          fontFamily={fontFamily}
          filter={`url(#cascade-glow-${uniqueId})`}
          transform={`translate(${parallax.x * parallaxLayers[0]}, ${parallax.y * parallaxLayers[0]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
        
        {/* Teal - layer 1 */}
        <text
          x={56}
          y={56}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.run}
          fontSize={38}
          fontWeight={300}
          fontFamily={fontFamily}
          filter={`url(#cascade-glow-${uniqueId})`}
          transform={`translate(${parallax.x * parallaxLayers[1]}, ${parallax.y * parallaxLayers[1]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
        
        {/* Orange - layer 2 */}
        <text
          x={67}
          y={67}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.strength}
          fontSize={28}
          fontWeight={300}
          fontFamily={fontFamily}
          filter={`url(#cascade-glow-${uniqueId})`}
          transform={`translate(${parallax.x * parallaxLayers[2]}, ${parallax.y * parallaxLayers[2]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
        
        {/* Green - layer 3 */}
        <text
          x={76}
          y={76}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.ride}
          fontSize={20}
          fontWeight={300}
          fontFamily={fontFamily}
          filter={`url(#cascade-glow-${uniqueId})`}
          transform={`translate(${parallax.x * parallaxLayers[3]}, ${parallax.y * parallaxLayers[3]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
        
        {/* Purple - layer 4 */}
        <text
          x={84}
          y={84}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.pilates}
          fontSize={14}
          fontWeight={300}
          fontFamily={fontFamily}
          filter={`url(#cascade-glow-${uniqueId})`}
          transform={`translate(${parallax.x * parallaxLayers[4]}, ${parallax.y * parallaxLayers[4]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
        
        {/* Swim blue - layer 5, deepest */}
        <text
          x={91}
          y={91}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.swim}
          fontSize={10}
          fontWeight={300}
          fontFamily={fontFamily}
          filter={`url(#cascade-glow-${uniqueId})`}
          transform={`translate(${parallax.x * parallaxLayers[5]}, ${parallax.y * parallaxLayers[5]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
      </svg>
    </div>
  );
}

interface EffortsButtonProps {
  size?: number;
  onClick?: () => void;
  className?: string;
  variant?: 'tron' | 'minimal' | 'gradient';
}

/**
 * Efforts "e" button - Holographic depth effect
 * White "e" with cascading discipline colors
 * Default is 'gradient' (the holographic cascade)
 */
export function EffortsButton({ 
  size = 120, 
  onClick, 
  className = "",
  variant = 'gradient'  // gradient is now the default
}: EffortsButtonProps) {
  
  if (variant === 'minimal') {
    return <EffortsButtonMinimal size={size} onClick={onClick} className={className} />;
  }
  
  if (variant === 'gradient') {
    return <EffortsButtonGradient size={size} onClick={onClick} className={className} />;
  }

  // Tron variant - default
  const viewBoxSize = 200;
  const centerX = viewBoxSize / 2;
  const centerY = viewBoxSize / 2;
  
  // Single accent color with glow - teal/cyan like Tron
  const accentColor = '#14b8a6'; // teal-500
  const glowColor = 'rgba(20, 184, 166, 0.6)';

  return (
    <button
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center
        transition-all duration-500 ease-out
        hover:scale-105 active:scale-95
        focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-500/50
        group
        ${className}
      `}
      style={{ width: size, height: size }}
      aria-label="Efforts"
    >
      {/* Glow effect behind */}
      <div 
        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-xl"
        style={{
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
        }}
      />
      
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        width={size}
        height={size}
        className="relative z-10"
      >
        <defs>
          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Subtle gradient for depth */}
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1a1a"/>
            <stop offset="100%" stopColor="#0a0a0a"/>
          </linearGradient>
        </defs>

        {/* Outer ring - very thin, subtle */}
        <circle
          cx={centerX}
          cy={centerY}
          r={95}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
        />

        {/* Main circle background */}
        <circle
          cx={centerX}
          cy={centerY}
          r={88}
          fill="url(#bgGradient)"
        />

        {/* Accent ring - thin glowing line */}
        <circle
          cx={centerX}
          cy={centerY}
          r={80}
          fill="none"
          stroke={accentColor}
          strokeWidth={1.5}
          filter="url(#glow)"
          className="opacity-60 group-hover:opacity-100 transition-opacity duration-500"
        />

        {/* Inner subtle ring */}
        <circle
          cx={centerX}
          cy={centerY}
          r={65}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.5}
        />

        {/* The lowercase "e" - clean, modern typography */}
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={56}
          fontWeight={300}
          fontFamily="'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif"
          letterSpacing="-0.03em"
          dy={3}
          className="group-hover:fill-teal-50 transition-colors duration-300"
        >
          e
        </text>
      </svg>
    </button>
  );
}

/**
 * Minimal variant - ultra clean B&O style
 */
function EffortsButtonMinimal({ 
  size = 120, 
  onClick, 
  className = ""
}: Omit<EffortsButtonProps, 'variant'>) {
  const viewBoxSize = 200;
  const centerX = viewBoxSize / 2;
  const centerY = viewBoxSize / 2;

  return (
    <button
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center
        transition-all duration-500 ease-out
        hover:scale-105 active:scale-95
        focus:outline-none
        group
        ${className}
      `}
      style={{ width: size, height: size }}
      aria-label="Efforts"
    >
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        width={size}
        height={size}
      >
        {/* Single clean circle */}
        <circle
          cx={centerX}
          cy={centerY}
          r={90}
          fill="#0a0a0a"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          className="group-hover:stroke-white/20 transition-all duration-500"
        />

        {/* The "e" */}
        <text
          x={centerX}
          y={centerY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(255,255,255,0.85)"
          fontSize={52}
          fontWeight={200}
          fontFamily="'SF Pro Display', 'Helvetica Neue', system-ui, sans-serif"
          letterSpacing="-0.02em"
          dy={2}
          className="group-hover:fill-white transition-colors duration-500"
        >
          e
        </text>
      </svg>
    </button>
  );
}

/**
 * Gradient variant - vibrant discipline colors as gradient arc
 * with energy-wave "e"
 */
function EffortsButtonGradient({ 
  size = 120, 
  onClick, 
  className = ""
}: Omit<EffortsButtonProps, 'variant'>) {
  const viewBoxSize = 200;
  const centerX = viewBoxSize / 2;
  const centerY = viewBoxSize / 2;
  const uniqueId = React.useId().replace(/:/g, '');

  // Vibrant discipline colors
  const colors = {
    swim: '#2563eb',     // blue
    ride: '#16a34a',     // green
    run: '#14b8a6',      // teal
    strength: '#f97316', // orange
    pilates: '#a855f7',  // purple
  };

  return (
    <button
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center
        transition-all duration-500 ease-out
        hover:scale-105 active:scale-95
        focus:outline-none
        group
        ${className}
      `}
      style={{ width: size, height: size }}
      aria-label="Efforts"
    >
      {/* Ambient glow */}
      <div 
        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-70 transition-opacity duration-700 blur-2xl"
        style={{
          background: `conic-gradient(from 180deg, ${colors.swim}, ${colors.run}, ${colors.strength}, ${colors.pilates}, ${colors.swim})`,
        }}
      />
      
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        width={size}
        height={size}
        className="relative z-10"
      >
        <defs>
          {/* Conic gradient for the ring */}
          <linearGradient id={`arcGradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.swim}/>
            <stop offset="20%" stopColor="#3b82f6"/> {/* Blue */}
            <stop offset="40%" stopColor={colors.run}/>
            <stop offset="60%" stopColor={colors.strength}/>
            <stop offset="80%" stopColor={colors.pilates}/>
            <stop offset="100%" stopColor={colors.swim}/>
          </linearGradient>
          
          {/* Gradient for the "e" - energy wave feel */}
          <linearGradient id={`eGradient-${uniqueId}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={colors.run} stopOpacity="0.9"/>
            <stop offset="50%" stopColor="white" stopOpacity="1"/>
            <stop offset="100%" stopColor={colors.pilates} stopOpacity="0.9"/>
          </linearGradient>
          
          {/* Glow for the ring */}
          <filter id={`glowGradient-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Soft glow for the "e" */}
          <filter id={`eGlow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <circle
          cx={centerX}
          cy={centerY}
          r={90}
          fill="#0a0a0a"
        />

        {/* Gradient ring - vibrant */}
        <circle
          cx={centerX}
          cy={centerY}
          r={85}
          fill="none"
          stroke={`url(#arcGradient-${uniqueId})`}
          strokeWidth={2.5}
          filter={`url(#glowGradient-${uniqueId})`}
          className="opacity-70 group-hover:opacity-100 transition-opacity duration-500"
        />

        {/* Inner edge */}
        <circle
          cx={centerX}
          cy={centerY}
          r={75}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={0.5}
        />

        {/* 4 colored cascade + large white in same orientation */}
        
        <defs>
          <filter id={`neonGlow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          {/* Subtle outline glow for white "e" */}
          <filter id={`whiteGlow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            {/* Soft dark halo for separation */}
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="shadow"/>
            <feFlood floodColor="black" floodOpacity="0.5"/>
            <feComposite in2="shadow" operator="in" result="darkHalo"/>
            {/* Crisp white with subtle glow */}
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="softGlow"/>
            <feMerge>
              <feMergeNode in="darkHalo"/>
              <feMergeNode in="softGlow"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* WHITE "e" - main, front */}
        <text
          x={centerX - 8}
          y={centerY - 8}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={140}
          fontWeight={300}
          fontFamily="'Rajdhani', system-ui, sans-serif"
          filter={`url(#whiteGlow-${uniqueId})`}
        >
          e
        </text>
        
        {/* e1: Teal (run) - trailing behind */}
        <text
          x={centerX + 12}
          y={centerY + 12}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#14b8a6"
          fontSize={105}
          fontWeight={300}
          fontFamily="'Rajdhani', system-ui, sans-serif"
          filter={`url(#neonGlow-${uniqueId})`}
        >
          e
        </text>
        
        {/* e2: Orange (strength) */}
        <text
          x={centerX + 28}
          y={centerY + 28}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#f97316"
          fontSize={78}
          fontWeight={300}
          fontFamily="'Rajdhani', system-ui, sans-serif"
          filter={`url(#neonGlow-${uniqueId})`}
        >
          e
        </text>
        
        {/* e3: Green (ride) */}
        <text
          x={centerX + 42}
          y={centerY + 42}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#22c55e"
          fontSize={55}
          fontWeight={300}
          fontFamily="'Rajdhani', system-ui, sans-serif"
          filter={`url(#neonGlow-${uniqueId})`}
        >
          e
        </text>
        
        {/* e4: Purple (pilates) */}
        <text
          x={centerX + 54}
          y={centerY + 54}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#c084fc"
          fontSize={38}
          fontWeight={300}
          fontFamily="'Rajdhani', system-ui, sans-serif"
          filter={`url(#neonGlow-${uniqueId})`}
        >
          e
        </text>
        
        {/* e5: Swim blue */}
        <text
          x={centerX + 64}
          y={centerY + 64}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#2B5A8C"
          fontSize={26}
          fontWeight={300}
          fontFamily="'Rajdhani', system-ui, sans-serif"
          filter={`url(#neonGlow-${uniqueId})`}
        >
          e
        </text>
      </svg>
    </button>
  );
}

/**
 * Premium pill-shaped button variant - vibrant with energy "e"
 */
export function EffortsButtonPill({ 
  size = 60, 
  onClick, 
  className = ""
}: Omit<EffortsButtonProps, 'variant'>) {
  const width = size * 2.2;
  const height = size;
  const uniqueId = React.useId().replace(/:/g, '');

  return (
    <button
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center
        transition-all duration-500 ease-out
        hover:scale-105 active:scale-95
        focus:outline-none
        group
        ${className}
      `}
      style={{ width, height }}
      aria-label="Efforts"
    >
      {/* Glow - more vibrant */}
      <div 
        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-70 transition-opacity duration-700 blur-xl"
        style={{
          background: 'linear-gradient(90deg, #14b8a6 0%, #f97316 50%, #a855f7 100%)',
        }}
      />
      
      <svg
        viewBox="0 0 220 100"
        width={width}
        height={height}
        className="relative z-10"
      >
        <defs>
          <linearGradient id={`pillGradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.9"/>
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.9"/>
          </linearGradient>
          
          {/* Energy gradient for the "e" */}
          <linearGradient id={`pillEGradient-${uniqueId}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.85"/>
            <stop offset="50%" stopColor="white" stopOpacity="1"/>
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.85"/>
          </linearGradient>
          
          <filter id={`pillGlow-${uniqueId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          <filter id={`pillEGlow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Pill background */}
        <rect
          x={2}
          y={2}
          width={216}
          height={96}
          rx={48}
          fill="#0a0a0a"
        />

        {/* Gradient stroke - more vibrant */}
        <rect
          x={4}
          y={4}
          width={212}
          height={92}
          rx={46}
          fill="none"
          stroke={`url(#pillGradient-${uniqueId})`}
          strokeWidth={2}
          filter={`url(#pillGlow-${uniqueId})`}
          className="opacity-80 group-hover:opacity-100 transition-opacity duration-500"
        />

        {/* 4 colored cascade + large white - pill */}
        <defs>
          <filter id={`pillNeon-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id={`pillWhite-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="shadow"/>
            <feFlood floodColor="black" floodOpacity="0.5"/>
            <feComposite in2="shadow" operator="in" result="darkHalo"/>
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="softGlow"/>
            <feMerge>
              <feMergeNode in="darkHalo"/>
              <feMergeNode in="softGlow"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* White - thin with halo */}
        <text
          x={92}
          y={38}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={115}
          fontWeight={100}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
          letterSpacing="-0.03em"
          filter={`url(#pillWhite-${uniqueId})`}
          dy={2}
        >
          e
        </text>
        
        {/* Teal (run) - tight */}
        <text
          x={102}
          y={44}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#14b8a6"
          fontSize={95}
          fontWeight={100}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
          letterSpacing="-0.03em"
          filter={`url(#pillNeon-${uniqueId})`}
          dy={2}
        >
          e
        </text>
        
        {/* Orange (strength) */}
        <text
          x={107}
          y={48}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#f97316"
          fontSize={75}
          fontWeight={100}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
          letterSpacing="-0.03em"
          filter={`url(#pillNeon-${uniqueId})`}
          dy={2}
        >
          e
        </text>
        
        {/* Green (ride) */}
        <text
          x={113}
          y={52}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#22c55e"
          fontSize={55}
          fontWeight={100}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
          letterSpacing="-0.03em"
          filter={`url(#pillNeon-${uniqueId})`}
          dy={2}
        >
          e
        </text>
        
        {/* Purple (pilates) */}
        <text
          x={119}
          y={56}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#c084fc"
          fontSize={38}
          fontWeight={100}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
          letterSpacing="-0.03em"
          filter={`url(#pillNeon-${uniqueId})`}
          dy={2}
        >
          e
        </text>
      </svg>
    </button>
  );
}

export default EffortsButton;
