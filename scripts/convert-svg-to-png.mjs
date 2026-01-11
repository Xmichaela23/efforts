/**
 * Convert SVG icons to PNG using browser rendering
 * This ensures the fonts render correctly
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// We'll use the render-icon.html page and capture screenshots at different sizes
console.log('To convert SVGs to PNGs with correct font rendering:');
console.log('1. Open http://localhost:8080/render-icon.html in browser');
console.log('2. Use browser dev tools to export as PNG at different sizes');
console.log('');
console.log('Or use an online converter like:');
console.log('https://cloudconvert.com/svg-to-png');
console.log('');
console.log('Required sizes:');
console.log('  - icon-192.png (192x192)');
console.log('  - icon-512.png (512x512)');
console.log('  - icon-1024.png (1024x1024)');

// Alternative: Create an HTML page that can export the SVG as PNG
const exportHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Export Icons</title>
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      background: #000;
      padding: 40px;
      color: #fff;
      font-family: system-ui, sans-serif;
    }
    .icon-preview {
      margin: 20px 0;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
    }
    canvas {
      background: #000;
      border: 1px solid rgba(255,255,255,0.2);
    }
    button {
      margin: 10px 5px;
      padding: 10px 20px;
      background: #14b8a6;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #0d9488;
    }
  </style>
</head>
<body>
  <h1>Export App Icons</h1>
  
  <div class="icon-preview">
    <h2>192x192</h2>
    <canvas id="canvas192" width="192" height="192"></canvas>
    <br>
    <button onclick="exportCanvas('canvas192', 192)">Download 192x192 PNG</button>
  </div>
  
  <div class="icon-preview">
    <h2>512x512</h2>
    <canvas id="canvas512" width="512" height="512"></canvas>
    <br>
    <button onclick="exportCanvas('canvas512', 512)">Download 512x512 PNG</button>
  </div>
  
  <div class="icon-preview">
    <h2>1024x1024</h2>
    <canvas id="canvas1024" width="1024" height="1024"></canvas>
    <br>
    <button onclick="exportCanvas('canvas1024', 1024)">Download 1024x1024 PNG</button>
  </div>
  
  <script>
    const colors = {
      run: '#14b8a6',
      strength: '#f97316',
      ride: '#22c55e',
      pilates: '#c084fc',
      swim: '#2B5A8C',
    };
    
    function renderIcon(canvasId, size) {
      const canvas = document.getElementById(canvasId);
      const ctx = canvas.getContext('2d');
      const scale = size / 100; // viewBox is 0 0 100 100
      
      // Clear
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      
      // Create SVG and render to canvas
      const svg = \`<svg width="\${size}" height="\${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="\${colors.pilates}"/>
            <stop offset="20%" stop-color="\${colors.swim}"/>
            <stop offset="40%" stop-color="\${colors.run}"/>
            <stop offset="60%" stop-color="\${colors.ride}"/>
            <stop offset="80%" stop-color="\${colors.strength}"/>
            <stop offset="100%" stop-color="\${colors.pilates}"/>
          </linearGradient>
          <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="cascade-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="50" cy="50" r="44" fill="rgba(10,10,10,0.7)"/>
        <circle cx="50" cy="50" r="46" fill="none" stroke="url(#ringGrad)" stroke-width="2" filter="url(#ringGlow)"/>
        <text x="42" y="42" text-anchor="middle" dominant-baseline="central" fill="white" font-size="55" font-weight="300" font-family="Rajdhani, Orbitron, system-ui, sans-serif" filter="url(#cascade-glow)">e</text>
        <text x="56" y="56" text-anchor="middle" dominant-baseline="central" fill="\${colors.run}" font-size="38" font-weight="300" font-family="Rajdhani, Orbitron, system-ui, sans-serif" filter="url(#cascade-glow)">e</text>
        <text x="67" y="67" text-anchor="middle" dominant-baseline="central" fill="\${colors.strength}" font-size="28" font-weight="300" font-family="Rajdhani, Orbitron, system-ui, sans-serif" filter="url(#cascade-glow)">e</text>
        <text x="76" y="76" text-anchor="middle" dominant-baseline="central" fill="\${colors.ride}" font-size="20" font-weight="300" font-family="Rajdhani, Orbitron, system-ui, sans-serif" filter="url(#cascade-glow)">e</text>
        <text x="84" y="84" text-anchor="middle" dominant-baseline="central" fill="\${colors.pilates}" font-size="14" font-weight="300" font-family="Rajdhani, Orbitron, system-ui, sans-serif" filter="url(#cascade-glow)">e</text>
        <text x="91" y="91" text-anchor="middle" dominant-baseline="central" fill="\${colors.swim}" font-size="10" font-weight="300" font-family="Rajdhani, Orbitron, system-ui, sans-serif" filter="url(#cascade-glow)">e</text>
      </svg>\`;
      
      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }
    
    function exportCanvas(canvasId, size) {
      const canvas = document.getElementById(canvasId);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = \`icon-\${size}.png\`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
    
    // Render all canvases
    renderIcon('canvas192', 192);
    renderIcon('canvas512', 512);
    renderIcon('canvas1024', 1024);
  </script>
</body>
</html>`;

const publicDir = join(process.cwd(), 'public');
writeFileSync(join(publicDir, 'export-icons.html'), exportHtml);
console.log('Created export-icons.html - open it in browser to download PNGs');
