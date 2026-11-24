// 5 handcrafted real-time puzzles + deterministic Daily Seeded Blitz Challenge.

export const PUZZLES = [
  {
    id: 'puz_fork',
    name: 'Royal Fork',
    difficulty: 'Intro',
    durationSec: 18,
    overtime: false,
    botId: 'doodle',
    goalText: 'Shatter the 5 HP King before time runs out.',
    whiteHp: 16,
    blackHp: 5,
    whiteElixir: 6,
    blackElixir: 2,
    whiteHand: ['knight', 'promote', 'pawn', 'freeze'],
    whiteQueue: ['swap', 'bishop', 'rook', 'pawn'],
    pieces: [
      { side: 'white', type: 'K', col: 3, row: 0 },
      { side: 'white', type: 'N', col: 2, row: 4 },
      { side: 'white', type: 'P', col: 3, row: 2 },
      { side: 'black', type: 'K', col: 3, row: 7 },
      { side: 'black', type: 'R', col: 1, row: 6 },
      { side: 'black', type: 'P', col: 4, row: 6 },
    ],
  },
  {
    id: 'puz_swap',
    name: 'Freestyle Escape',
    difficulty: 'Tactical',
    durationSec: 22,
    overtime: false,
    botId: 'petra',
    goalText: 'Swap your 3 HP King out of danger and crush the 6 HP King.',
    whiteHp: 3,
    blackHp: 6,
    whiteElixir: 6,
    blackElixir: 3,
    whiteHand: ['swap', 'freeze', 'rook', 'pawn'],
    whiteQueue: ['knight', 'promote', 'bishop', 'pawn'],
    pieces: [
      { side: 'white', type: 'K', col: 3, row: 0 },
      { side: 'white', type: 'P', col: 0, row: 1 },
      { side: 'white', type: 'R', col: 5, row: 2 },
      { side: 'white', type: 'B', col: 1, row: 2 },
      { side: 'black', type: 'K', col: 3, row: 7 },
      { side: 'black', type: 'R', col: 3, row: 4 },
      { side: 'black', type: 'P', col: 2, row: 6 },
    ],
  },
  {
    id: 'puz_overtime',
    name: 'Center Surge',
    difficulty: 'Overtime',
    durationSec: 24,
    overtime: true,
    botId: 'felix',
    goalText: 'Overtime active. Rush Pawns across the center line for instant Queens.',
    whiteHp: 12,
    blackHp: 8,
    whiteElixir: 6,
    blackElixir: 3,
    whiteHand: ['freeze', 'pawn', 'knight', 'swap'],
    whiteQueue: ['promote', 'bishop', 'rook', 'pawn'],
    pieces: [
      { side: 'white', type: 'K', col: 3, row: 0 },
      { side: 'white', type: 'P', col: 1, row: 3, hasMoved: true },
      { side: 'white', type: 'P', col: 4, row: 3, hasMoved: true },
      { side: 'black', type: 'K', col: 3, row: 7 },
      { side: 'black', type: 'R', col: 1, row: 6 },
      { side: 'black', type: 'N', col: 4, row: 5 },
    ],
  },
  {
    id: 'puz_shield',
    name: 'Crown Shield',
    difficulty: 'Sharp',
    durationSec: 25,
    overtime: false,
    botId: 'tobi',
    goalText: 'Promote your Rook for a 1.4s Crown Shield and break the 8 HP King.',
    whiteHp: 10,
    blackHp: 8,
    whiteElixir: 7,
    blackElixir: 4,
    whiteHand: ['promote', 'freeze', 'knight', 'swap'],
    whiteQueue: ['pawn', 'bishop', 'rook', 'pawn'],
    pieces: [
      { side: 'white', type: 'K', col: 3, row: 0 },
      { side: 'white', type: 'R', col: 2, row: 2 },
      { side: 'white', type: 'P', col: 3, row: 2 },
      { side: 'black', type: 'K', col: 3, row: 7 },
      { side: 'black', type: 'Q', col: 2, row: 5 },
      { side: 'black', type: 'P', col: 3, row: 6 },
    ],
  },
  {
    id: 'puz_gm',
    name: 'Blitz Finale',
    difficulty: 'Master',
    durationSec: 32,
    overtime: true,
    botId: 'gmink',
    goalText: 'Break GM Ink (10 HP) in Overtime using every spell at your disposal.',
    whiteHp: 8,
    blackHp: 10,
    whiteElixir: 7,
    blackElixir: 5,
    whiteHand: ['freeze', 'promote', 'swap', 'knight'],
    whiteQueue: ['pawn', 'rook', 'bishop', 'pawn'],
    pieces: [
      { side: 'white', type: 'K', col: 3, row: 0 },
      { side: 'white', type: 'P', col: 1, row: 3, hasMoved: true },
      { side: 'white', type: 'B', col: 4, row: 1 },
      { side: 'black', type: 'K', col: 3, row: 7 },
      { side: 'black', type: 'R', col: 0, row: 6 },
      { side: 'black', type: 'B', col: 5, row: 6 },
      { side: 'black', type: 'N', col: 2, row: 5 },
    ],
  },
];

export function getTodayDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic daily tactical puzzle generated cleanly from YYYY-MM-DD. */
export function buildDailyPuzzle(dateKey = getTodayDateKey()) {
  let seed = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    seed ^= dateKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const bots = ['petra', 'felix', 'tobi'];
  const botId = pick(bots);
  const overtime = rng() > 0.45;
  const blackHp = 7 + Math.floor(rng() * 4); // 7..10 HP
  const whiteHp = 10 + Math.floor(rng() * 5); // 10..14 HP

  const used = new Set(['3,0', '3,7']);
  const pieces = [
    { side: 'white', type: 'K', col: 3, row: 0 },
    { side: 'black', type: 'K', col: 3, row: 7 },
  ];

  const place = (side, type, minRow, maxRow) => {
    for (let tries = 0; tries < 25; tries++) {
      const col = Math.floor(rng() * 6);
      const row = minRow + Math.floor(rng() * (maxRow - minRow + 1));
      const key = `${col},${row}`;
      if (!used.has(key)) {
        used.add(key);
        pieces.push({ side, type, col, row, hasMoved: row >= 3 && row <= 4 });
        return;
      }
    }
  };

  place('white', pick(['N', 'B', 'R']), 1, 3);
  place('white', 'P', 2, 3);
  place('white', 'P', 1, 2);
  place('black', pick(['R', 'B', 'N']), 5, 6);
  place('black', pick(['N', 'B']), 5, 6);
  place('black', 'P', 5, 6);

  const spellOrder = ['freeze', 'swap', 'promote'].sort(() => rng() - 0.5);

  return {
    id: `daily_${dateKey}`,
    isDaily: true,
    dateKey,
    name: `Daily ${dateKey.slice(5)}`,
    difficulty: overtime ? 'Daily OT' : 'Daily',
    durationSec: 24,
    overtime,
    botId,
    goalText: `Daily Blitz (${dateKey}): Shatter the ${blackHp} HP King in 24s.`,
    whiteHp,
    blackHp,
    whiteElixir: 6,
    blackElixir: 3,
    whiteHand: [spellOrder[0], pick(['knight', 'bishop']), 'pawn', spellOrder[1]],
    whiteQueue: ['rook', spellOrder[2], 'pawn', 'knight'],
    pieces,
  };
}

export function getAllPuzzles() {
  return [buildDailyPuzzle(), ...PUZZLES];
}

export function getPuzzleById(id) {
  if (id && id.startsWith('daily_')) {
    return buildDailyPuzzle(id.slice(6));
  }
  return PUZZLES.find((p) => p.id === id) || buildDailyPuzzle();
}
