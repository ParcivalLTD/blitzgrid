// Hand-inked Chess.com circular move annotation badges (!!, !, ??, +, star)

const BADGE_META = {
  brilliant: { bg: '#1bada6', text: '!!', title: 'Brilliant' },
  great: { bg: '#5c8bb0', text: '!', title: 'Great' },
  blunder: { bg: '#ca3431', text: '??', title: 'Blunder' },
  check: { bg: '#d65536', text: '+', title: 'Check' },
  streak: { bg: '#dda938', text: 'star', title: 'Blitz Streak' },
};

export function getBadgeColor(kind) {
  return (BADGE_META[kind] || BADGE_META.great).bg;
}

export function renderBadgeSvg(kind, size = 18) {
  const m = BADGE_META[kind] || BADGE_META.great;
  if (m.text === 'star') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 22 22" fill="none" aria-label="${m.title}">
      <circle cx="11" cy="11" r="9.6" fill="${m.bg}" stroke="#1a1917" stroke-width="1.8"/>
      <path d="M11 5.2 L12.7 8.9 L16.7 9.4 L13.7 12.1 L14.5 16.1 L11 14.1 L7.5 16.1 L8.3 12.1 L5.3 9.4 L9.3 8.9 Z" fill="#1c1a17"/>
    </svg>`;
  }

  const fontSize = m.text.length > 1 ? 11 : 13;
  return `<svg width="${size}" height="${size}" viewBox="0 0 22 22" fill="none" aria-label="${m.title}">
    <circle cx="11" cy="11" r="9.6" fill="${m.bg}" stroke="#1a1917" stroke-width="1.8"/>
    <text x="11" y="15.2" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-weight="800" font-size="${fontSize}">${m.text}</text>
  </svg>`;
}
