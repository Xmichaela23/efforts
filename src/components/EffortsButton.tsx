import * as React from "react";
import { SPORT_COLORS, getDisciplineColorRgb, getDisciplineGlowColor } from '@/lib/context-utils';

/**
 * Efforts Wordmark - "efforts" with holographic "o"
 * The cascading discipline "e" becomes the "o"
 */
interface EffortsWordmarkProps {
  size?: number;
  className?: string;
}

/**
 * Cascading "e" Logo - Just the cascading colored "e"s, no text
 * Can be used as a button or standalone logo
 */
interface EffortsCascadingEProps {
  size?: number;
  className?: string;
  onClick?: () => void;
  /** Center the "e"s in the viewBox (default: true) */
  centered?: boolean;
}

export function EffortsCascadingE({ 
  size = 48, 
  className = "", 
  onClick,
  centered = true 
}: EffortsCascadingEProps) {
  const uniqueId = React.useId().replace(/:/g, '');
  const fontFamily = "'Rajdhani', 'Orbitron', system-ui, sans-serif";
  const svgSize = size * 2.4; // SVG viewBox size
  const containerRef = React.useRef<HTMLDivElement | HTMLButtonElement>(null);
  
  // Parallax state
  const [parallax, setParallax] = React.useState({ x: 0, y: 0 });
  
  // Discipline colors - vibrant, distinct colors
  const colors = {
    run: '#00FFC8',      // Bright cyan/teal
    strength: '#FF8C00', // Bright orange
    ride: '#22c55e',     // Green
    pilates: '#B464FF',  // Bright purple
    swim: '#2B5A8C',     // Deep blue
  };
  
  // Parallax effect - device orientation for mobile, mouse for desktop
  React.useEffect(() => {
    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        const x = (e.gamma / 30) * 3;
        const y = (e.beta / 30) * 3;
        setParallax({ x: Math.max(-3, Math.min(3, x)), y: Math.max(-3, Math.min(3, y)) });
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = ((e.clientX - centerX) / rect.width) * 6;
      const y = ((e.clientY - centerY) / rect.height) * 6;
      setParallax({ x: Math.max(-3, Math.min(3, x)), y: Math.max(-3, Math.min(3, y)) });
    };
    
    const handleMouseLeave = () => {
      setParallax({ x: 0, y: 0 });
    };
    
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleDeviceOrientation as EventListener);
    }
    
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
  
  // Parallax multipliers for each cascade layer
  const parallaxLayers = [
    0,      // white e - no parallax
    1.5,    // teal
    2.5,    // orange
    3.5,    // green
    4.5,    // purple
    5.5,    // swim blue - furthest
  ];
  
  // Use the same positioning as the wordmark for consistency
  // White "e" positioned top-left, cascading "e"s trail diagonally down-right
  const whiteEX = 42;
  const whiteEY = 42;
  
  const Component = onClick ? 'button' : 'div';
  
  return (
    <Component
      ref={containerRef as any}
      onClick={onClick}
      className={`relative inline-flex items-center justify-center ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={onClick ? { 
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0
      } : {}}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        style={{ 
          display: 'block',
        }}
      >
        {/* WHITE "e" - main, front - same position as wordmark */}
        <text
          x={whiteEX}
          y={whiteEY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#FFFFFF"
          fontSize={75}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[0]}, ${parallax.y * parallaxLayers[0]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
        
        {/* Teal - layer 1 - cascading behind white "e" */}
        <text
          x={whiteEX + 16}
          y={whiteEY + 16}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.run}
          fontSize={52}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[1]}, ${parallax.y * parallaxLayers[1]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Orange - layer 2 */}
        <text
          x={whiteEX + 28}
          y={whiteEY + 28}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.strength}
          fontSize={38}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[2]}, ${parallax.y * parallaxLayers[2]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Green - layer 3 */}
        <text
          x={whiteEX + 38}
          y={whiteEY + 38}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.ride}
          fontSize={28}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[3]}, ${parallax.y * parallaxLayers[3]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Purple - layer 4 */}
        <text
          x={whiteEX + 46}
          y={whiteEY + 46}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.pilates}
          fontSize={20}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[4]}, ${parallax.y * parallaxLayers[4]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Swim blue - layer 5, deepest */}
        <text
          x={whiteEX + 53}
          y={whiteEY + 53}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.swim}
          fontSize={14}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[5]}, ${parallax.y * parallaxLayers[5]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
      </svg>
    </Component>
  );
}

// Fisher-Yates shuffle for unbiased randomization
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export function EffortsWordmark({ size = 48, className = "" }: EffortsWordmarkProps) {
  const uniqueId = React.useId().replace(/:/g, '');
  const fontFamily = "'Rajdhani', 'Orbitron', system-ui, sans-serif";
  const circleSize = size * 2.4; // larger circle for breathing room
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // Parallax state
  const [parallax, setParallax] = React.useState({ x: 0, y: 0 });
  
  // Discipline colors for gradient ring - vibrant, distinct colors
  const colorDefinitions = {
    run: '#00FFC8',      // Bright cyan/teal
    strength: '#FF8C00', // Bright orange
    ride: '#22c55e',     // Green (keep as is)
    pilates: '#B464FF',  // Bright purple
    swim: '#2B5A8C',     // Deep blue (keep as is)
  };

  // Shuffle color order once on component mount (app launch)
  // This creates a different cascade order each session while maintaining equality over time
  const [layerColors] = React.useState(() => {
    const colorKeys: Array<keyof typeof colorDefinitions> = ['run', 'strength', 'ride', 'pilates', 'swim'];
    return shuffleArray(colorKeys);
  });
  
  // Parallax effect - device orientation for mobile, mouse for desktop
  React.useEffect(() => {
    const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        // Normalize device orientation to parallax values - increased sensitivity
        const x = (e.gamma / 30) * 3; // -3 to 3 (increased from -2 to 2)
        const y = (e.beta / 30) * 3; // -3 to 3 (increased from -2 to 2)
        setParallax({ x: Math.max(-3, Math.min(3, x)), y: Math.max(-3, Math.min(3, y)) });
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = ((e.clientX - centerX) / rect.width) * 6; // -3 to 3 (increased from -2 to 2)
      const y = ((e.clientY - centerY) / rect.height) * 6; // -3 to 3 (increased from -2 to 2)
      setParallax({ x: Math.max(-3, Math.min(3, x)), y: Math.max(-3, Math.min(3, y)) });
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
    1.5,    // teal - closest (much more movement)
    2.5,    // orange (much more movement)
    3.5,    // green (much more movement)
    4.5,    // purple (much more movement)
    5.5,    // swim blue - furthest (much more movement)
  ];

  // VU meter pulse animation - subtle opacity variations
  const [pulsePhase, setPulsePhase] = React.useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setPulsePhase(prev => (prev + 0.1) % (Math.PI * 2));
    }, 50); // 50ms updates for smooth animation
    return () => clearInterval(interval);
  }, []);

  // Calculate opacity for each layer (VU meter effect - more pronounced heartbeat)
  const getVUOpacity = (layerIndex: number) => {
    const phase = pulsePhase + (layerIndex * 0.3); // Stagger each layer
    return 0.7 + (Math.sin(phase) * 0.3); // Pulse between 0.7 and 1.0 (more visible)
  };
  
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
          display: 'block', // ensure proper centering
        }}
      >
        <defs>
          {/* Gradient for ring - equal 5 colors (using shuffled order) */}
          <linearGradient id={`ringGrad-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colorDefinitions[layerColors[3]]}/>
            <stop offset="20%" stopColor={colorDefinitions[layerColors[4]]}/>
            <stop offset="40%" stopColor={colorDefinitions[layerColors[0]]}/>
            <stop offset="60%" stopColor={colorDefinitions[layerColors[2]]}/>
            <stop offset="80%" stopColor={colorDefinitions[layerColors[1]]}/>
            <stop offset="100%" stopColor={colorDefinitions[layerColors[3]]}/>
          </linearGradient>
          
          <filter id={`ringGlow-${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Removed blur filter for clarity - each "e" should be sharp and distinct */}
        </defs>
        
        {/* Dark background inside circle - removed */}
        {/* <circle cx={50} cy={50} r={44} fill="rgba(10,10,10,0.7)"/> */}
        
        {/* Gradient ring - hidden */}
        {/* <circle
          cx={50}
          cy={50}
          r={46}
          fill="none"
          stroke={`url(#ringGrad-${uniqueId})`}
          strokeWidth={2}
          filter={`url(#ringGlow-${uniqueId})`}
        /> */}
        
        {/* WHITE "e" - sharp, static */}
        <text
          x={42}
          y={42}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#FFFFFF"
          fontSize={55}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[0]}, ${parallax.y * parallaxLayers[0]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
        
        {/* Layer 1 - shuffled color, vibrant, sharp, static */}
        <text
          x={58}
          y={58}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colorDefinitions[layerColors[0]]}
          fontSize={38}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[1]}, ${parallax.y * parallaxLayers[1]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Layer 2 - shuffled color, vibrant, sharp, static */}
        <text
          x={70}
          y={70}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colorDefinitions[layerColors[1]]}
          fontSize={28}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[2]}, ${parallax.y * parallaxLayers[2]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Layer 3 - shuffled color, sharp, static */}
        <text
          x={80}
          y={80}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colorDefinitions[layerColors[2]]}
          fontSize={20}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[3]}, ${parallax.y * parallaxLayers[3]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Layer 4 - shuffled color, vibrant, sharp, static */}
        <text
          x={88}
          y={88}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colorDefinitions[layerColors[3]]}
          fontSize={14}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[4]}, ${parallax.y * parallaxLayers[4]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>

        {/* Layer 5, deepest - shuffled color, sharp, static */}
        <text
          x={95}
          y={95}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colorDefinitions[layerColors[4]]}
          fontSize={10}
          fontWeight={300}
          fontFamily={fontFamily}
          transform={`translate(${parallax.x * parallaxLayers[5]}, ${parallax.y * parallaxLayers[5]})`}
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          e
        </text>
      </svg>
      
      {/* "fforts" text - aligned with white e baseline */}
      <span
        style={{
          fontSize: size,
          fontWeight: 300,
          fontFamily,
          letterSpacing: '0.08em',
          color: '#fff',
          textTransform: 'lowercase',
          position: 'relative',
          zIndex: 3, // on top for bright ff
          marginTop: -size * 0.10, // lowered to align with white e baseline
          marginLeft: -size * 0.02,
          display: 'inline-block',
          lineHeight: 1, // tight line height for precise alignment
        }}
      >
        fforts
      </span>
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
  
  // Single accent color with glow - using centralized color system
  const accentColor = SPORT_COLORS.run;
  const glowColor = getDisciplineGlowColor('run', 0.6);

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

  // Vibrant discipline colors - using centralized color system
  const colors = {
    swim: SPORT_COLORS.swim,
    ride: SPORT_COLORS.ride,
    run: SPORT_COLORS.run,
    strength: SPORT_COLORS.strength,
    pilates: SPORT_COLORS.pilates_yoga,
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
          fill={SPORT_COLORS.run}
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
          background: `linear-gradient(90deg, ${SPORT_COLORS.run} 0%, ${SPORT_COLORS.strength} 50%, ${SPORT_COLORS.pilates_yoga} 100%)`,
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
            <stop offset="0%" stopColor={SPORT_COLORS.run} stopOpacity="0.9"/>
            <stop offset="50%" stopColor="#f97316" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.9"/>
          </linearGradient>
          
          {/* Energy gradient for the "e" */}
          <linearGradient id={`pillEGradient-${uniqueId}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={SPORT_COLORS.run} stopOpacity="0.85"/>
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
          fill={SPORT_COLORS.run}
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
