// Bespoke hand-drawn SVG icon library — zero emojis anywhere in the app.

const S = (size, inner, stroke = 'currentColor', extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="${stroke}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${inner}</svg>`;

export const Icons = {
  logo(size = 22) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="3" fill="#EEEED2" stroke="#181715" stroke-width="2"/>
      <path d="M12 2.4 H21.2 V12 H12 Z" fill="#769656"/>
      <path d="M2.8 12 H12 V21.2 H2.8 Z" fill="#769656"/>
      <path d="M12 2.5 L12 21.5 M2.5 12 L21.5 12" stroke="#1d1c1a" stroke-width="1.3"/>
      <path d="M13.3 5.2 L8.4 12.2 H12.2 L10.7 18.8 L15.8 11.4 H12.1 Z" fill="#F4F1E6" stroke="#181715" stroke-width="1.45" stroke-linejoin="round"/>
    </svg>`;
  },

  elixirDrop(size = 14, fill = '#9b4dca') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10.1 2.2 C10.1 2.2 4.4 8.7 4.4 12.6 C4.4 15.8 6.9 18 10 18 C13.1 18 15.6 15.8 15.6 12.6 C15.6 8.6 10.1 2.2 10.1 2.2 Z" fill="${fill}" stroke="#1d1c1a" stroke-width="1.65" stroke-linejoin="round"/>
      <path d="M7.6 12.4 C7.6 14 8.6 15.1 9.8 15.4" stroke="#f4e6ff" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`;
  },

  crown(size = 14, color = '#dda938') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.8 15.2 L4.2 6.8 L7.9 10.4 L10.1 4.6 L12.3 10.4 L15.9 6.8 L17.2 15.2 Z" fill="${color}" stroke="#1c1b19" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M3.2 16.8 H16.8" stroke="#1c1b19" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  },

  shield(size = 14, color = '#dda938') {
    return S(
      size,
      `<path d="M10 2.4 L16.2 4.8 V9.6 C16.2 13.7 13.5 16.4 10 17.8 C6.5 16.4 3.8 13.7 3.8 9.6 V4.8 Z" fill="${color}" fill-opacity="0.24"/>
       <path d="M7.5 10.1 L9.4 12 L13 8.1"/>`,
      color
    );
  },

  freeze(size = 24, color = '#2b7ba3') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 2.8 V21.2 M4.1 7.4 L19.9 16.6 M19.9 7.4 L4.1 16.6"/>
      <path d="M9.6 4.8 L12 7 L14.4 4.8 M9.6 19.2 L12 17 L14.4 19.2"/>
      <path d="M5.4 10.4 L7.7 9.6 L6.9 7.2 M18.6 13.6 L16.3 14.4 L17.1 16.8"/>
      <path d="M17.1 7.2 L16.3 9.6 L18.6 10.4 M6.9 16.8 L7.7 14.4 L5.4 13.6"/>
      <circle cx="12" cy="12" r="2.2" fill="#d7f1fc" stroke="${color}" stroke-width="1.6"/>
    </svg>`;
  },

  swap(size = 24, color = '#5e45b0') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4.5 9.2 C7.2 5.4 13.8 5.2 18.4 8.6"/>
      <path d="M15.4 5.2 L19 8.8 L14.4 10.4"/>
      <path d="M19.5 14.8 C16.8 18.6 10.2 18.8 5.6 15.4"/>
      <path d="M8.6 18.8 L5 15.2 L9.6 13.6"/>
    </svg>`;
  },

  promote(size = 24, color = '#9c6e12') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5.2 14.6 L6.8 7.5 L10 10.6 L12.1 5.4 L14.2 10.6 L17.4 7.5 L18.8 14.6 Z" fill="#ebb948" stroke="#292114" stroke-width="1.65" stroke-linejoin="round"/>
      <path d="M5.8 16.8 H18.2" stroke="#292114" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M12 21 V17.2 M9.5 19.3 L12 16.9 L14.5 19.3" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  },

  haste(size = 24, color = '#248052') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.2 3.2 L6.6 13.1 H11.8 L9.9 20.8 L17.8 10.7 H12.4 Z" fill="#5fd196" stroke="#1b261f" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M3.2 8.2 H6.4 M2.5 12 H5.2 M18.5 15.8 H21.2" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>
    </svg>`;
  },

  wall(size = 24, color = '#5e5a52') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.2" y="5" width="17.6" height="14" rx="2.2" fill="#9c968b" stroke="#1d1c1a" stroke-width="1.8"/>
      <path d="M3.5 9.8 H20.5 M3.5 14.4 H20.5" stroke="#1d1c1a" stroke-width="1.5"/>
      <path d="M9.5 5 V9.8 M15.5 5 V9.8 M6.8 9.8 V14.4 M12.8 9.8 V14.4 M17.5 9.8 V14.4 M10 14.4 V19 M15.8 14.4 V19" stroke="${color}" stroke-width="1.45"/>
    </svg>`;
  },

  share(size = 14) {
    return S(
      size,
      `<path d="M10 12.6 V3.6 M6.6 6.8 L10 3.4 L13.4 6.8"/>
       <path d="M4.2 10.6 V15.4 C4.2 16.2 4.8 16.8 5.6 16.8 H14.4 C15.2 16.8 15.8 16.2 15.8 15.4 V10.6"/>`
    );
  },

  eye(size = 14) {
    return S(
      size,
      `<path d="M2.4 10 C4.5 6.4 7.1 5 10 5 C12.9 5 15.5 6.4 17.6 10 C15.5 13.6 12.9 15 10 15 C7.1 15 4.5 13.6 2.4 10 Z"/>
       <circle cx="10" cy="10" r="2.2" fill="currentColor"/>`
    );
  },

  search(size = 14) {
    return S(
      size,
      `<circle cx="8.8" cy="8.8" r="5"/>
       <path d="M12.6 12.6 L16.6 16.6"/>`
    );
  },

  soundOn(size = 16) {
    return S(
      size,
      `<path d="M3.5 8.1 H6.8 L11.1 4.4 V15.6 L6.8 11.9 H3.5 Z" fill="currentColor" fill-opacity="0.16"/>
       <path d="M14 7.4 C15.1 8.6 15.1 11.4 14 12.6"/>
       <path d="M16.2 5.4 C18.1 7.8 18.1 12.2 16.2 14.6"/>`
    );
  },

  soundOff(size = 16) {
    return S(
      size,
      `<path d="M3.5 8.1 H6.8 L11.1 4.4 V15.6 L6.8 11.9 H3.5 Z" fill="currentColor" fill-opacity="0.12"/>
       <path d="M13.8 7.6 L17.6 12.4 M17.6 7.6 L13.8 12.4"/>`
    );
  },

  boardTheme(size = 16) {
    return S(
      size,
      `<rect x="3" y="3" width="14" height="14" rx="1.8"/>
       <path d="M10 3 V17 M3 10 H17"/>
       <rect x="10" y="3" width="7" height="7" fill="currentColor" fill-opacity="0.32" stroke="none"/>
       <rect x="3" y="10" width="7" height="7" fill="currentColor" fill-opacity="0.32" stroke="none"/>`
    );
  },

  help(size = 16) {
    return S(
      size,
      `<circle cx="10" cy="10" r="7.4"/>
       <path d="M7.9 7.8 C8 6.4 9 5.7 10.2 5.7 C11.4 5.7 12.3 6.5 12.3 7.6 C12.3 8.8 10.8 9.4 10.1 10.4 V11.4"/>
       <circle cx="10.1" cy="14.1" r="0.7" fill="currentColor" stroke="none"/>`
    );
  },

  play(size = 15) {
    return S(
      size,
      `<path d="M5.5 3.6 L16.2 10 L5.5 16.4 Z" fill="currentColor"/>`
    );
  },

  rematch(size = 15) {
    return S(
      size,
      `<path d="M15.8 9.6 A5.8 5.8 0 1 1 14 5.5"/>
       <path d="M14.4 2.8 L14.5 6.2 L11.1 6.1"/>`
    );
  },

  flag(size = 14) {
    return S(
      size,
      `<path d="M5 17.2 V3.4"/>
       <path d="M5 4.2 C7.8 3.2 10.5 5.4 14.8 4.4 V10.8 C10.6 11.8 7.8 9.6 5 10.6"/>`
    );
  },

  botSwitch(size = 14) {
    return S(
      size,
      `<circle cx="10" cy="6.8" r="3"/>
       <path d="M4.2 16.4 C4.7 13.1 7.1 11.6 10 11.6 C12.9 11.6 15.3 13.1 15.8 16.4"/>`
    );
  },

  streak(size = 14, color = '#dda938') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M11.3 2.2 L5.1 10.8 H9.8 L8.5 17.8 L15 9.1 H10.2 Z" fill="${color}" stroke="#1c1b19" stroke-width="1.35" stroke-linejoin="round"/>
    </svg>`;
  },

  trophy(size = 14, color = '#dda938') {
    return S(
      size,
      `<path d="M6.2 4 H13.8 V8.8 C13.8 11.2 12.1 12.8 10 12.8 C7.9 12.8 6.2 11.2 6.2 8.8 Z" fill="${color}" fill-opacity="0.22"/>
       <path d="M6.2 5.4 H3.6 C3.6 8.2 4.6 9.6 6.2 9.8 M13.8 5.4 H16.4 C16.4 8.2 15.4 9.6 13.8 9.8"/>
       <path d="M10 12.8 V16.2 M7 16.4 H13"/>`,
      color
    );
  },

  clock(size = 14) {
    return S(
      size,
      `<circle cx="10" cy="10.4" r="6.6"/>
       <path d="M10 6.8 V10.5 L12.6 12"/>
       <path d="M8 2.4 H12"/>`
    );
  },

  close(size = 16) {
    return S(size, `<path d="M5 5 L15 15 M15 5 L5 15"/>`);
  },

  check(size = 13, color = '#81b64c') {
    return S(size, `<path d="M4.2 10.4 L8.1 14.2 L15.8 5.8"/>`, color);
  },

  pause(size = 14) {
    return S(size, `<path d="M7.2 4.5 V15.5 M12.8 4.5 V15.5" stroke-width="2.1"/>`);
  },

  users(size = 14) {
    return S(
      size,
      `<circle cx="7.4" cy="7.2" r="2.6"/>
       <path d="M2.8 15.8 C3.3 13 5.1 11.7 7.4 11.7 C9.7 11.7 11.5 13 12 15.8"/>
       <circle cx="13.8" cy="7.8" r="2.1"/>
       <path d="M12.6 12.1 C14.6 12.2 16.4 13.4 17 15.8"/>`
    );
  },

  deck(size = 14) {
    return S(
      size,
      `<rect x="4.5" y="4.8" width="9.2" height="12" rx="1.6"/>
       <path d="M7.8 3.2 H14.8 C15.7 3.2 16.2 3.8 16.2 4.7 V13.6"/>`
    );
  },

  puzzle(size = 14) {
    return S(
      size,
      `<path d="M4 7.5 H7.2 C7.2 5.6 9.8 5.6 9.8 7.5 H13.5 V10.6 C15.5 10.6 15.5 13.4 13.5 13.4 V16 H4 V13.2 C5.8 13.2 5.8 10.6 4 10.6 Z"/>`
    );
  },

  replay(size = 14) {
    return S(
      size,
      `<path d="M4.2 10 A5.8 5.8 0 1 0 5.9 5.9"/>
       <path d="M3.6 3.5 V6.8 H6.9"/>
       <path d="M9.1 7.6 L12.9 10 L9.1 12.4 Z" fill="currentColor"/>`
    );
  },

  history(size = 14) {
    return S(
      size,
      `<path d="M4.5 5.5 H15.5 M4.5 10 H15.5 M4.5 14.5 H11.5"/>`
    );
  },

  copy(size = 14) {
    return S(
      size,
      `<rect x="7" y="7" width="9.5" height="9.5" rx="1.6"/>
       <path d="M12.8 7 V4.8 C12.8 4 12.2 3.5 11.4 3.5 H4.8 C4 3.5 3.5 4 3.5 4.8 V11.4 C3.5 12.2 4 12.8 4.8 12.8 H7"/>`
    );
  },

  plus(size = 13) {
    return S(size, `<path d="M10 4.5 V15.5 M4.5 10 H15.5"/>`);
  },

  minus(size = 13) {
    return S(size, `<path d="M4.5 10 H15.5"/>`);
  },

  menu(size = 16) {
    return S(size, `<path d="M3.5 5.5 H16.5 M3.5 10 H16.5 M3.5 14.5 H16.5"/>`);
  },

  reset(size = 13) {
    return S(
      size,
      `<path d="M5.2 7.5 H12.4 A3.8 3.8 0 1 1 12.4 15.1 H7.5"/>
       <path d="M7.6 4.8 L4.6 7.5 L7.6 10.2"/>`
    );
  },
};
