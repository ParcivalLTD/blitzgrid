export const COLS = 6;
export const ROWS = 8;

export const KING_MAX_HP = 20;
export const ROYAL_BREACH_HP = 10;

export const START_ELIXIR = 5.0;
export const MAX_ELIXIR = 10.0;

export const ELIXIR_RATE_NORMAL = 1 / 2.2;
export const ELIXIR_RATE_OVERTIME = 1 / 1.1;
export const ELIXIR_RATE_SUDDEN = 1 / 0.75;

export const MATCH_DURATION_SEC = 120;
export const OVERTIME_MODE_DURATION_SEC = 60;
export const OVERTIME_REMAINING_SEC = 45;
export const SUDDEN_DEATH_DURATION_SEC = 45;
export const START_GRACE_SEC = 0.6;
export const SHATTER_DURATION_SEC = 0.78;
export const LAND_BOUNCE_SEC = 0.17;
export const ELIXIR_RUNE_FIRST_SEC = 18;
export const ELIXIR_RUNE_INTERVAL_SEC = 28;
export const ELIXIR_RUNE_BONUS = 2.0;

export const COOLDOWN_STANDARD = 2.5;
export const COOLDOWN_KING = 2.2;
export const COOLDOWN_KING_LAST_STAND = 1.6;
export const KING_LAST_STAND_HP = 5;
export const COOLDOWN_GILDED = 1.4;
export const HIT_STOP_SEC = 0.055;
export const READY_FLASH_SEC = 0.28;
export const RUNE_TELEGRAPH_SEC = 3.0;

export const DEPLOY_DURATION = 0.8;
export const DEPLOY_INVULN = 0.2;
export const PROMOTE_CHANNEL = 0.9;
export const FREEZE_DURATION = 4.0;
export const SWAP_DURATION = 0.16;
export const RECOIL_DURATION = 0.16;

export const STEP_MOVE_DURATION = 0.125;
export const KNIGHT_MOVE_DURATION = 0.2;
export const SLIDE_PER_TILE_DURATION = 0.06;

export const CHECK_CHIP_DAMAGE = 1;

export const PIECE_ELIXIR_VALUE = {
  P: 2,
  N: 3,
  B: 4,
  R: 5,
  Q: 7,
  K: 0,
};

export const PIECE_MATERIAL = {
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 0,
};

export const PIECE_KING_STRIKE = {
  P: 2,
  N: 3,
  B: 3,
  R: 4,
  Q: 5,
  K: 0,
};

export const CARD_DEFS = {
  pawn: {
    id: 'pawn',
    name: 'Pawn',
    cost: 2,
    kind: 'unit',
    pieceType: 'P',
    shortDesc: 'Cheap blocker. Auto-Queens across center in Overtime.',
  },
  knight: {
    id: 'knight',
    name: 'Knight',
    cost: 3,
    kind: 'unit',
    pieceType: 'N',
    shortDesc: 'Leaps over pieces & ice. 3 HP King strike.',
  },
  bishop: {
    id: 'bishop',
    name: 'Bishop',
    cost: 4,
    kind: 'unit',
    pieceType: 'B',
    shortDesc: 'Diagonal sniper. 3 HP King strike.',
  },
  rook: {
    id: 'rook',
    name: 'Rook',
    cost: 5,
    kind: 'unit',
    pieceType: 'R',
    shortDesc: 'Heavy file crusher. 4 HP King strike.',
  },
  freeze: {
    id: 'freeze',
    name: 'Freeze',
    cost: 3,
    kind: 'spell',
    shortDesc: 'Freezes a 2x2 zone for 4s. Blocks enemy sliders.',
  },
  swap: {
    id: 'swap',
    name: 'Swap',
    cost: 3,
    kind: 'spell',
    shortDesc: 'Swap any 2 friendly pieces, including your King.',
  },
  promote: {
    id: 'promote',
    name: 'Promote',
    cost: 3,
    kind: 'spell',
    shortDesc: 'Pawn: Ranks 1-3 -> Rook, Rank 4+ -> Queen. Other -> Gilded.',
  },
};

export const BASE_DECK = [
  'pawn',
  'pawn',
  'knight',
  'bishop',
  'rook',
  'freeze',
  'swap',
  'promote',
];

export const BOARD_THEMES = ['green', 'walnut', 'slate', 'graphite'];

export const BOTS = [
  {
    id: 'doodle',
    name: 'Doodle',
    elo: 600,
    tagline: 'Casual sketcher. Slow tempo.',
    reactionSec: 1.75,
    aggression: 0.45,
    defense: 0.4,
    spellBias: { freeze: 0.25, swap: 0.15, promote: 0.45 },
    unitWeights: { pawn: 1.2, knight: 1.15, bishop: 0.85, rook: 0.8 },
    tradeAwareness: 0.25,
    quips: {
      start: 'Warmup round. Go easy on my King.',
      brilliant: 'Wait—did a Pawn just do that?',
      overtime: 'Double Elixir. Pawns, sprint.',
      win: 'Even a rough sketch finds a mate.',
      lose: 'Clean tactics. Run it back?',
    },
  },
  {
    id: 'petra',
    name: 'Petra',
    elo: 950,
    tagline: 'Pawn waves & Overtime Queens.',
    reactionSec: 1.3,
    aggression: 0.72,
    defense: 0.55,
    spellBias: { freeze: 0.4, swap: 0.35, promote: 0.95 },
    unitWeights: { pawn: 1.55, knight: 0.95, bishop: 0.9, rook: 0.85 },
    tradeAwareness: 0.5,
    quips: {
      start: 'Hold the center line if you can.',
      brilliant: 'Clean trade. Still more Pawns coming.',
      overtime: 'Final 45 seconds. Queens up.',
      win: 'Too many crowns on the board.',
      lose: 'Stopped the wave. Well played.',
    },
  },
  {
    id: 'felix',
    name: 'Felix',
    elo: 1250,
    tagline: 'Frost traps & open-file Rooks.',
    reactionSec: 1.0,
    aggression: 0.62,
    defense: 0.85,
    spellBias: { freeze: 0.95, swap: 0.45, promote: 0.65 },
    unitWeights: { pawn: 1.0, knight: 0.95, bishop: 1.25, rook: 1.35 },
    tradeAwareness: 0.72,
    quips: {
      start: 'Keep your open files closed.',
      brilliant: 'Sharp find. Adjusting the file.',
      overtime: 'Freeze the center, claim the crown.',
      win: 'Locked down from start to finish.',
      lose: 'Cracked my defense. Respect.',
    },
  },
  {
    id: 'tobi',
    name: 'Tobi',
    elo: 1550,
    tagline: 'Knight forks & King swaps.',
    reactionSec: 0.75,
    aggression: 0.82,
    defense: 0.78,
    spellBias: { freeze: 0.65, swap: 0.95, promote: 0.75 },
    unitWeights: { pawn: 1.0, knight: 1.45, bishop: 1.15, rook: 1.05 },
    tradeAwareness: 0.85,
    quips: {
      start: 'Watch the L-squares and watch my King.',
      brilliant: 'Okay, that was genuinely sharp.',
      overtime: 'Speed chess now. Keep up.',
      win: 'Caught you mid-slide.',
      lose: 'Out-tacticked on the clock.',
    },
  },
  {
    id: 'gmink',
    name: 'GM Ink',
    elo: 1900,
    tagline: 'Relentless trades & instant punish.',
    reactionSec: 0.5,
    aggression: 0.92,
    defense: 0.96,
    spellBias: { freeze: 0.88, swap: 0.85, promote: 0.92 },
    unitWeights: { pawn: 1.1, knight: 1.2, bishop: 1.2, rook: 1.25 },
    tradeAwareness: 0.98,
    quips: {
      start: 'Show me a brilliant move.',
      brilliant: 'Accurate. Let us see the follow-up.',
      overtime: 'No blunders past the center line.',
      win: 'Elixir advantage converted cleanly.',
      lose: 'Impressive calculation. Rematch.',
    },
  },
];

export function getBotById(id) {
  return BOTS.find((b) => b.id === id) || BOTS[1];
}
