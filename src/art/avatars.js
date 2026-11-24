// Minimal monochrome-ink hand-drawn portrait avatars (40x40 viewBox)

export function renderAvatarSvg(id, size = 32) {
  let inner = '';
  switch (id) {
    case 'you':
      inner = `
        <rect width="40" height="40" fill="#3a4530"/>
        <circle cx="20" cy="14.5" r="6.2" fill="#f2ede0" stroke="#1b1a18" stroke-width="2"/>
        <path d="M9.5 36 C10.5 26.8 14.5 23.2 20 23.2 C25.5 23.2 29.5 26.8 30.5 36 Z" fill="#f2ede0" stroke="#1b1a18" stroke-width="2" stroke-linejoin="round"/>
        <path d="M16 14 H17.5 M22.5 14 H24" stroke="#1b1a18" stroke-width="1.8" stroke-linecap="round"/>
      `;
      break;
    case 'doodle':
      inner = `
        <rect width="40" height="40" fill="#3f3b34"/>
        <rect x="10.5" y="10" width="19" height="17" rx="3" fill="#e8e2d3" stroke="#1b1a18" stroke-width="2"/>
        <path d="M20 5 V10" stroke="#1b1a18" stroke-width="2" stroke-linecap="round"/>
        <circle cx="20" cy="4.5" r="2" fill="#dda938" stroke="#1b1a18" stroke-width="1.4"/>
        <circle cx="15.8" cy="17.5" r="2.3" fill="none" stroke="#1b1a18" stroke-width="1.8"/>
        <circle cx="24.2" cy="17.5" r="2.3" fill="none" stroke="#1b1a18" stroke-width="1.8"/>
        <path d="M18.2 17.5 H21.8 M15.5 22.8 Q20 25 24.5 22.8" stroke="#1b1a18" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M12 37 C13 30 16 28 20 28 C24 28 27 30 28 37" fill="#c9c2b2" stroke="#1b1a18" stroke-width="2"/>
      `;
      break;
    case 'petra':
      inner = `
        <rect width="40" height="40" fill="#463530"/>
        <path d="M9.5 22 C9.5 11.5 13.5 7.5 20 7.5 C26.5 7.5 30.5 11.5 30.5 22 L28.5 27 H11.5 Z" fill="#23201e" stroke="#141312" stroke-width="1.8"/>
        <circle cx="20" cy="18.2" r="7.2" fill="#efe6d5" stroke="#1b1a18" stroke-width="1.9"/>
        <path d="M13 15.5 C16.5 12.2 23.5 12.2 27 15.5" fill="#23201e"/>
        <circle cx="17.3" cy="18.6" r="1.3" fill="#1b1a18"/>
        <circle cx="22.7" cy="18.6" r="1.3" fill="#1b1a18"/>
        <path d="M18 22.4 L22.2 21.8" stroke="#1b1a18" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M10.5 37 C11.5 30 15 27.5 20 27.5 C25 27.5 28.5 30 29.5 37" fill="#c97255" stroke="#1b1a18" stroke-width="2"/>
      `;
      break;
    case 'felix':
      inner = `
        <rect width="40" height="40" fill="#2c3c47"/>
        <circle cx="20" cy="16.5" r="7.4" fill="#ece6d8" stroke="#1b1a18" stroke-width="1.9"/>
        <path d="M12.5 14.5 C13.5 9.2 26.5 9.2 27.5 14.5" fill="#485966" stroke="#1b1a18" stroke-width="1.8"/>
        <circle cx="23.2" cy="17.2" r="2.7" fill="#bce5f7" fill-opacity="0.45" stroke="#1b1a18" stroke-width="1.5"/>
        <circle cx="16.8" cy="17.2" r="1.3" fill="#1b1a18"/>
        <path d="M17.5 21.4 H22.5" stroke="#1b1a18" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M10 37 C11 29.5 14.5 26 20 26 C25.5 26 29 29.5 30 37" fill="#5b8aa3" stroke="#1b1a18" stroke-width="2"/>
        <path d="M13 27.5 H27" stroke="#e4f2f8" stroke-width="2.4" stroke-linecap="round"/>
      `;
      break;
    case 'tobi':
      inner = `
        <rect width="40" height="40" fill="#3b324a"/>
        <circle cx="20" cy="18.2" r="7.2" fill="#eee5d4" stroke="#1b1a18" stroke-width="1.9"/>
        <path d="M10 14.2 C13 8.5 25 7.2 30.5 12.2 L26.5 15.2 L12.5 15.5 Z" fill="#6f58a8" stroke="#1b1a18" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M15.2 17.2 L18.6 18 M24.8 17 L21.4 18" stroke="#1b1a18" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M17 22.2 Q20.8 23.8 24 21.2" stroke="#1b1a18" stroke-width="1.7" stroke-linecap="round"/>
        <path d="M10.5 37 C11.5 30 15 27.5 20 27.5 C25 27.5 28.5 30 29.5 37" fill="#3a3347" stroke="#1b1a18" stroke-width="2"/>
      `;
      break;
    case 'gmink':
    default:
      inner = `
        <rect width="40" height="40" fill="#23211e"/>
        <path d="M20 7.5 L27.5 22 L23.5 30.5 H16.5 L12.5 22 Z" fill="#f3eee2" stroke="#141312" stroke-width="2" stroke-linejoin="round"/>
        <path d="M20 7.5 V19.5" stroke="#141312" stroke-width="1.8"/>
        <circle cx="20" cy="20.5" r="2.2" fill="#141312"/>
        <path d="M13 34.5 L15 28.5 H25 L27 34.5 Z" fill="#dda938" stroke="#141312" stroke-width="1.7" stroke-linejoin="round"/>
      `;
      break;
  }

  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" aria-hidden="true">${inner}</svg>`;
}
