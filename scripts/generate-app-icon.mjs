import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import puppeteer from 'puppeteer';

/**
 * Generate app icon SVG (gradient circle with cascade "e"s)
 * This matches the EffortsButtonGradient design exactly
 */
function generateIconSVG(size = 512) {
  // Match the EffortsButtonGradient viewBox: "0 0 200 200"
  const viewBoxSize = 200;
  const centerX = 100;
  const centerY = 100;
  
  const colors = {
    swim: '#2563eb',     // blue
    ride: '#16a34a',     // green
    run: '#14b8a6',      // teal
    strength: '#f97316', // orange
    pilates: '#a855f7',  // purple
  };

  return `<svg width="${size}" height="${size}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <!-- Black background for entire icon -->
  <rect width="200" height="200" fill="#000000"/>
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&display=swap');
    </style>
    <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2B5A8C"/>
      <stop offset="20%" stop-color="#3b82f6"/>
      <stop offset="40%" stop-color="${colors.run}"/>
      <stop offset="60%" stop-color="${colors.strength}"/>
      <stop offset="80%" stop-color="${colors.pilates}"/>
      <stop offset="100%" stop-color="#2B5A8C"/>
    </linearGradient>
    <filter id="glowGradient" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="whiteGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="shadow"/>
      <feFlood flood-color="black" flood-opacity="0.5"/>
      <feComposite in2="shadow" operator="in" result="darkHalo"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="softGlow"/>
      <feMerge>
        <feMergeNode in="darkHalo"/>
        <feMergeNode in="softGlow"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <circle cx="${centerX}" cy="${centerY}" r="85" fill="none" stroke="url(#arcGradient)" stroke-width="2.5" filter="url(#glowGradient)" opacity="0.7"/>
  <circle cx="${centerX}" cy="${centerY}" r="75" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>
  <text x="${centerX - 8}" y="${centerY - 8}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="140" font-weight="300" font-family="'Rajdhani', system-ui, sans-serif" filter="url(#whiteGlow)">e</text>
  <text x="${centerX + 12}" y="${centerY + 12}" text-anchor="middle" dominant-baseline="central" fill="${colors.run}" font-size="105" font-weight="300" font-family="'Rajdhani', system-ui, sans-serif" filter="url(#neonGlow)">e</text>
  <text x="${centerX + 28}" y="${centerY + 28}" text-anchor="middle" dominant-baseline="central" fill="${colors.strength}" font-size="78" font-weight="300" font-family="'Rajdhani', system-ui, sans-serif" filter="url(#neonGlow)">e</text>
  <text x="${centerX + 42}" y="${centerY + 42}" text-anchor="middle" dominant-baseline="central" fill="#22c55e" font-size="55" font-weight="300" font-family="'Rajdhani', system-ui, sans-serif" filter="url(#neonGlow)">e</text>
  <text x="${centerX + 54}" y="${centerY + 54}" text-anchor="middle" dominant-baseline="central" fill="${colors.pilates}" font-size="38" font-weight="300" font-family="'Rajdhani', system-ui, sans-serif" filter="url(#neonGlow)">e</text>
  <text x="${centerX + 64}" y="${centerY + 64}" text-anchor="middle" dominant-baseline="central" fill="#2B5A8C" font-size="26" font-weight="300" font-family="'Rajdhani', system-ui, sans-serif" filter="url(#neonGlow)">e</text>
</svg>`;
}

// Generate PWA icons
const publicDir = join(process.cwd(), 'public');
const iconsDir = join(publicDir, 'icons');

// Note: This generates SVG files. You'll need to convert them to PNG.
// For now, we'll create the SVG files and you can use an online converter
// or install sharp/puppeteer to convert them.

console.log('Generating app icon SVGs...');

// Generate SVG for different sizes
const sizes = [192, 512, 1024, 180];

sizes.forEach(size => {
  const svg = generateIconSVG(size);
  const svgPath = join(iconsDir, `icon-${size}.svg`);
  writeFileSync(svgPath, svg);
  console.log(`✓ Generated ${svgPath}`);
});

// Convert SVG to PNG using sharp (requires SVG to be rendered first)
// Note: Sharp doesn't support SVG directly, so we'll use a workaround
// For now, we'll create instructions for manual conversion or use an online tool

// Convert SVG to PNG using puppeteer
console.log('\n📝 Converting SVGs to PNGs...');

async function convertSVGtoPNG(svgPath, pngPath, size) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Set viewport to match icon size
  await page.setViewport({ width: size, height: size });
  
  // Read SVG content
  const svgContent = readFileSync(svgPath, 'utf-8');
  
  // Create HTML page with SVG and font
  const html = `<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; background: transparent; }
    svg { display: block; }
    * { font-family: 'Rajdhani', system-ui, sans-serif !important; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;
  
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // Wait a bit for fonts to load
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Take screenshot
  await page.screenshot({
    path: pngPath,
    type: 'png',
    clip: { x: 0, y: 0, width: size, height: size }
  });
  
  await browser.close();
}

const pngSizes = [180, 192, 512, 1024];

for (const size of pngSizes) {
  const svgPath = join(iconsDir, `icon-${size}.svg`);
  const pngPath = join(iconsDir, `icon-${size}.png`);
  await convertSVGtoPNG(svgPath, pngPath, size);
  console.log(`✓ Generated ${pngPath}`);
}

console.log('\n✅ All icons generated successfully!');
