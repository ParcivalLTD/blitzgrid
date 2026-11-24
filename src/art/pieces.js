// Custom hand-drawn Staunton chess pieces (100x100 local viewBox).
// Unmistakable Chess.com Neo silhouette + ink crosshatching + expressive King states.

function getPalette(side) {
  if (side === 'white') {
    return {
      fill: '#f7f3e7',
      shade: '#ddd5c2',
      stroke: '#1d1c1a',
      hatch: '#8f8776',
      highlight: '#ffffff',
      eye: '#1d1c1a',
    };
  }
  return {
    fill: '#33302c',
    shade: '#201e1c',
    stroke: '#121110',
    hatch: '#68635b',
    highlight: '#878177',
    eye: '#eae5d8',
  };
}

function pawnBody(p) {
  return `
    <ellipse cx="50" cy="87.5" rx="25" ry="5.5" fill="rgba(16,15,13,0.22)"/>
    <!-- Base -->
    <path d="M26 84.5 C27 77 33 74.5 39 73.5 H61 C67 74.5 73 77 74 84.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linejoin="round"/>
    <path d="M54 74 C63 75 69.5 77.5 71.5 83.2 H55 Z" fill="${p.shade}"/>
    <!-- Stem -->
    <path d="M38.5 73.5 C40.5 64 42.8 55 43.2 48 H56.8 C57.2 55 59.5 64 61.5 73.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linejoin="round"/>
    <path d="M51 49 H55.6 C56.2 56 58.2 64.5 59.8 72 H52.4 Z" fill="${p.shade}"/>
    <!-- Collar -->
    <path d="M36.5 47.5 C36.5 44.2 42 42.5 50 42.5 C58 42.5 63.5 44.2 63.5 47.5 C63.5 50.2 58 51.5 50 51.5 C42 51.5 36.5 50.2 36.5 47.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.2"/>
    <!-- Head -->
    <circle cx="50" cy="31.5" r="13.5" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4"/>
    <path d="M54 20.5 A12.5 12.5 0 0 1 56 42.5 A9.8 11 0 0 0 54 20.5 Z" fill="${p.shade}"/>
    <!-- Hand-inked highlight & crosshatch -->
    <path d="M41.5 27.5 C42.5 24 45 22.2 48 21.8" stroke="${p.highlight}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M54 57 L58 55 M54.5 62 L59 60 M55.5 67 L60 65" stroke="${p.hatch}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M30 81.2 H70" stroke="${p.stroke}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
  `;
}

function knightBody(p) {
  return `
    <ellipse cx="50" cy="88" rx="28" ry="5.5" fill="rgba(16,15,13,0.23)"/>
    <!-- Base -->
    <path d="M23 85 C24.5 78 30 75 37 74 H65 C71 75 76 78 77.5 85 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linejoin="round"/>
    <path d="M56 75 H65 C70 76 73.8 78.5 75.2 83.5 H57 Z" fill="${p.shade}"/>
    <!-- Sculpted Stallion Head & Neck -->
    <path d="M31 74 C31.5 61 36 53 42.5 47.5 C36.5 49 30.2 51.5 25.2 49 C21.5 47 21.5 42.5 24 38.8 L34.5 25.5 C36.2 21.5 39.2 16 42.5 14.5 C44.5 17.5 45.5 20.5 46.2 22.8 C52.5 21.8 61.5 24.5 67.5 32.5 C73.5 40.5 74.5 55.5 68.5 74 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4" stroke-linejoin="round"/>
    <!-- Mane shadow & ink strokes -->
    <path d="M54.5 24.5 C61.5 27.5 67.5 34.5 69.8 45 C71.6 53.5 70.5 63.5 66.8 72.5 H57.5 C61 60.5 60.5 45 54 34 Z" fill="${p.shade}"/>
    <path d="M56.5 29 C63 32.5 67 39 68 46.5 M59 38 C64.5 42 67 48.5 66.8 55.5 M59.5 49 C64 53 65.2 59 64.2 66" stroke="${p.hatch}" stroke-width="2" stroke-linecap="round"/>
    <!-- Expressive eye, nostril & brow -->
    <circle cx="38.5" cy="33.5" r="2.3" fill="${p.eye}"/>
    <path d="M34.8 29.8 L41.5 30.8" stroke="${p.stroke}" stroke-width="2.1" stroke-linecap="round"/>
    <circle cx="27.2" cy="43.5" r="1.5" fill="${p.stroke}"/>
    <path d="M25.5 47.5 C29.5 47.5 33 45.8 36 43.2" stroke="${p.stroke}" stroke-width="2" stroke-linecap="round"/>
    <path d="M35 28.5 C37.2 24.5 40 20.5 42.5 18.2" stroke="${p.highlight}" stroke-width="1.9" stroke-linecap="round"/>
    <path d="M27.5 81.5 H72.5" stroke="${p.stroke}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
  `;
}

function bishopBody(p) {
  return `
    <ellipse cx="50" cy="88" rx="27" ry="5.5" fill="rgba(16,15,13,0.23)"/>
    <!-- Base -->
    <path d="M23.5 85 C25 78 31 74.8 38 74 H62 C69 74.8 75 78 76.5 85 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linejoin="round"/>
    <path d="M54 75 H62 C68 75.8 73 78.5 74.2 83.5 H55 Z" fill="${p.shade}"/>
    <!-- Stem -->
    <path d="M37 74 C39 63 41 56 41.5 51 H58.5 C59 56 61 63 63 74 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linejoin="round"/>
    <path d="M52 52.5 H57.2 C58 57.5 59.5 64 61.2 72.5 H53 Z" fill="${p.shade}"/>
    <!-- Collar ring -->
    <path d="M35 50.5 C35 47.5 41 46 50 46 C59 46 65 47.5 65 50.5 C65 53 59 54.4 50 54.4 C41 54.4 35 53 35 50.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.2"/>
    <!-- Mitre -->
    <path d="M37.5 46.5 C31.5 39 33.5 26 50 18 C66.5 26 68.5 39 62.5 46.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M52.5 20.5 C63.5 27.5 65.5 38 60.5 45.2 H52.5 C56.5 38 56 28.5 52.5 20.5 Z" fill="${p.shade}"/>
    <!-- Classic diagonal mitre slit -->
    <path d="M57.5 25.5 L47.2 35.8" stroke="${p.stroke}" stroke-width="3.5" stroke-linecap="round"/>
    <!-- Top finial orb -->
    <circle cx="50" cy="14" r="4.6" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.1"/>
    <!-- Highlight & crosshatch -->
    <path d="M39.5 34.5 C39 29 41.8 24.5 45.5 22.2" stroke="${p.highlight}" stroke-width="2.1" stroke-linecap="round"/>
    <path d="M54 58 L58.5 56 M55 63.5 L60 61.5 M56 69 L61 67" stroke="${p.hatch}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M28 81.5 H72" stroke="${p.stroke}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
  `;
}

function rookBody(p) {
  return `
    <ellipse cx="50" cy="88" rx="28" ry="5.5" fill="rgba(16,15,13,0.23)"/>
    <!-- Base -->
    <path d="M22 85 L25 75.5 H75 L78 85 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linejoin="round"/>
    <path d="M56 77 H73.5 L75.8 83.6 H56 Z" fill="${p.shade}"/>
    <!-- Tower shaft -->
    <path d="M31.5 75.5 L34.5 40 H65.5 L68.5 75.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M54.5 41.5 H64 L66.6 74 H55 Z" fill="${p.shade}"/>
    <!-- Battlement crown -->
    <path d="M27.5 40 L26.5 21.5 H36 V28.5 H44.5 V21.5 H55.5 V28.5 H64 V21.5 H73.5 L72.5 40 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M56 23 H71.8 L71 38.5 H56 Z" fill="${p.shade}"/>
    <!-- Masonry ink lines & hatching -->
    <path d="M31 40 H69 M34 52 H66 M33 64 H67" stroke="${p.stroke}" stroke-width="1.8" opacity="0.4"/>
    <path d="M57 45 L63 43 M57.5 56 L64 54 M58 67.5 L65 65.5" stroke="${p.hatch}" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M38 44 V71" stroke="${p.highlight}" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
  `;
}

function queenBody(p) {
  return `
    <ellipse cx="50" cy="88" rx="29" ry="5.5" fill="rgba(16,15,13,0.24)"/>
    <!-- Base -->
    <path d="M22.5 85 C24 78 30 74.5 37 73.5 H63 C70 74.5 76 78 77.5 85 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linejoin="round"/>
    <path d="M55 75 H63 C68.5 75.8 73.5 78.2 75 83.5 H55.5 Z" fill="${p.shade}"/>
    <!-- Flared dress / crown body -->
    <path d="M33.5 73.5 L22.5 32 L36.5 48 L41.5 24 L50 45 L58.5 24 L63.5 48 L77.5 32 L66.5 73.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M53.5 44 L58.5 27.5 L63.5 50.5 L74.2 36.5 L64.8 72 H53.5 Z" fill="${p.shade}"/>
    <!-- Five coronet pearls -->
    <circle cx="21.5" cy="29" r="3.6" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2.6"/>
    <circle cx="40.5" cy="21" r="3.8" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2.6"/>
    <circle cx="50" cy="18.5" r="4.1" fill="#e5b84b" stroke="${p.stroke}" stroke-width="2.6"/>
    <circle cx="59.5" cy="21" r="3.8" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2.6"/>
    <circle cx="78.5" cy="29" r="3.6" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2.6"/>
    <!-- Waistband & ink hatching -->
    <path d="M32 64.5 C42 62 58 62 68 64.5" stroke="${p.stroke}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M55 54 L63 51 M55.5 60 L64 57 M56 68 L64.5 66" stroke="${p.hatch}" stroke-width="1.7" stroke-linecap="round"/>
    <path d="M27.5 81.5 H72.5" stroke="${p.stroke}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
  `;
}

function kingBody(p, opts = {}) {
  const hpRatio = opts.hpRatio ?? 1;
  const inCheck = Boolean(opts.inCheck);
  const hurt = Boolean(opts.hurt);
  const cracked = hpRatio <= 0.5;
  const critical = hpRatio <= 0.3;

  // Expressive minimalist ink face tucked subtly into the King's crown chest
  let faceMarkup = '';
  if (hurt) {
    faceMarkup = `
      <path d="M41.5 50 L45.5 53 L41.5 56 M58.5 50 L54.5 53 L58.5 56" stroke="${p.eye}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M46 61 Q50 57.5 54 61" stroke="${p.eye}" stroke-width="2.1" stroke-linecap="round"/>
    `;
  } else if (inCheck || critical) {
    faceMarkup = `
      <circle cx="43.5" cy="53" r="2.2" fill="${p.eye}"/>
      <circle cx="56.5" cy="53" r="2.2" fill="${p.eye}"/>
      <path d="M39.5 48.2 L46.2 50.4 M60.5 48.2 L53.8 50.4" stroke="${p.eye}" stroke-width="2.1" stroke-linecap="round"/>
      <ellipse cx="50" cy="60.5" rx="3.4" ry="2.2" fill="none" stroke="${p.eye}" stroke-width="1.9"/>
    `;
  } else {
    faceMarkup = `
      <circle cx="43.8" cy="53" r="1.9" fill="${p.eye}"/>
      <circle cx="56.2" cy="53" r="1.9" fill="${p.eye}"/>
      <path d="M46.8 59.5 H53.2" stroke="${p.eye}" stroke-width="2" stroke-linecap="round" opacity="0.75"/>
    `;
  }

  // Crack line across crown when <= 50% HP (Royal Breach)
  const crackMarkup = cracked
    ? `<path d="M62 36 L55.5 43 L59 47.5 L53.5 54" stroke="#cc3f3b" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';

  const sweatMarkup = critical
    ? `<path d="M74 34 C74 34 77.5 39 77.5 41.3 C77.5 43.2 76 44.5 74 44.5 C72 44.5 70.5 43.2 70.5 41.3 C70.5 39 74 34 74 34 Z" fill="#6bc8f0" stroke="#1c1b19" stroke-width="1.5"/>`
    : '';

  return `
    <ellipse cx="50" cy="88.5" rx="29" ry="5.5" fill="rgba(16,15,13,0.25)"/>
    <!-- Royal Cross Finial -->
    <path d="M50 8.5 V26.5 M42.5 15.5 H57.5" stroke="${p.stroke}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M50 9.5 V25.5 M43.5 15.5 H56.5" stroke="#dda938" stroke-width="1.8" stroke-linecap="round"/>
    <!-- Base -->
    <path d="M22.5 85.5 C24 78.5 30 75 37 74 H63 C70 75 76 78.5 77.5 85.5 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M55 75.5 H63 C68.5 76.2 73.5 78.5 75 84 H55.5 Z" fill="${p.shade}"/>
    <!-- Crown Lobes & Body -->
    <path d="M32 74 C22.5 60 20.5 43.5 29 36.5 C36 30.8 44.5 35.5 50 40.5 C55.5 35.5 64 30.8 71 36.5 C79.5 43.5 77.5 60 68 74 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.4" stroke-linejoin="round"/>
    <path d="M52 41 C57.5 36.2 64.5 33 69.5 37.5 C76.2 43.8 74.5 58.5 66.2 72.5 H54.5 C59.5 61 59.5 49 52 41 Z" fill="${p.shade}"/>
    <!-- Center Crown Arch -->
    <path d="M40.5 35 C42 26.5 45.8 23.5 50 23.5 C54.2 23.5 58 26.5 59.5 35" fill="${p.fill}" stroke="${p.stroke}" stroke-width="3.3" stroke-linecap="round"/>
    <!-- Belt -->
    <path d="M31.5 66.5 C42 64 58 64 68.5 66.5" stroke="${p.stroke}" stroke-width="2.4" stroke-linecap="round"/>
    ${faceMarkup}
    ${crackMarkup}
    ${sweatMarkup}
    <path d="M27.5 82 H72.5" stroke="${p.stroke}" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
  `;
}

/**
 * Render inner SVG markup for a piece in a 100x100 coordinate frame.
 */
export function renderPieceInner(type, side, opts = {}) {
  const palette = getPalette(side);
  let body = '';
  switch (type) {
    case 'P':
      body = pawnBody(palette);
      break;
    case 'N':
      body = knightBody(palette);
      break;
    case 'B':
      body = bishopBody(palette);
      break;
    case 'R':
      body = rookBody(palette);
      break;
    case 'Q':
      body = queenBody(palette);
      break;
    case 'K':
      body = kingBody(palette, opts);
      break;
  }

  let overlays = '';
  if (opts.gilded) {
    overlays += `
      <g transform="translate(62, 6) scale(0.95)">
        <path d="M2 16 L4 6 L9 10.5 L12 3.5 L15 10.5 L20 6 L22 16 Z" fill="#ebb948" stroke="#1c1b19" stroke-width="2" stroke-linejoin="round"/>
      </g>
    `;
  }
  if (opts.hasCrownShield) {
    overlays += `
      <circle cx="50" cy="52" r="41" fill="none" stroke="#dda938" stroke-width="2.8" stroke-dasharray="8 5" opacity="0.9"/>
    `;
  }

  return body + overlays;
}

/** Standalone <svg> wrapper for Card Hand & Captured tray. */
export function renderPieceSvg(type, side, size = 34, opts = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" aria-hidden="true">${renderPieceInner(
    type,
    side,
    opts
  )}</svg>`;
}
