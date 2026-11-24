import {
  BASE_DECK,
  CARD_DEFS,
  CHECK_CHIP_DAMAGE,
  COLS,
  COOLDOWN_GILDED,
  COOLDOWN_KING,
  COOLDOWN_STANDARD,
  DEPLOY_DURATION,
  ELIXIR_RATE_NORMAL,
  ELIXIR_RATE_OVERTIME,
  ELIXIR_RATE_SUDDEN,
  ELIXIR_RUNE_BONUS,
  ELIXIR_RUNE_FIRST_SEC,
  ELIXIR_RUNE_INTERVAL_SEC,
  FREEZE_DURATION,
  getBotById,
  KING_MAX_HP,
  KNIGHT_MOVE_DURATION,
  LAND_BOUNCE_SEC,
  MATCH_DURATION_SEC,
  MAX_ELIXIR,
  OVERTIME_MODE_DURATION_SEC,
  OVERTIME_REMAINING_SEC,
  PIECE_ELIXIR_VALUE,
  PIECE_KING_STRIKE,
  PROMOTE_CHANNEL,
  RECOIL_DURATION,
  ROYAL_BREACH_HP,
  ROWS,
  SHATTER_DURATION_SEC,
  SLIDE_PER_TILE_DURATION,
  START_ELIXIR,
  START_GRACE_SEC,
  STEP_MOVE_DURATION,
  SUDDEN_DEATH_DURATION_SEC,
  SWAP_DURATION,
} from './constants.js';
import {
  computeEvalNormalized,
  doesPieceAttackSquare,
  findAllChecks,
  getLegalDropSquares,
  getLegalTargets,
  getPieceAt,
  getRayPath,
  isFrozenForSide,
  isPieceTargetable,
  oppositeSide,
  sqEq,
  toAlgebraic,
} from './chessRules.js';
import { getPuzzleById } from './puzzles.js';

function makeEmptyStats() {
  return {
    brilliant: 0,
    great: 0,
    blunders: 0,
    bestTrade: 0,
    damageDealt: 0,
    queensPromoted: 0,
    captures: 0,
  };
}

/** Exact Promote spell outcome for any non-King piece (balanced: home Pawns -> Rook, Rank 4+ -> Queen). */
export function getPromoteOutcome(piece) {
  if (piece.type === 'P') {
    const advanced =
      (piece.side === 'white' && piece.square.row >= 3) ||
      (piece.side === 'black' && piece.square.row <= 4);
    return advanced ? 'Q' : 'R';
  }
  if (piece.type === 'Q') return 'SHIELD';
  return 'GILD';
}

export function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 8) return [...BASE_DECK];
  const valid = deck.every((id) => Boolean(CARD_DEFS[id]));
  if (!valid) return [...BASE_DECK];
  const unitCount = deck.filter((id) => CARD_DEFS[id].kind === 'unit').length;
  if (unitCount < 2) return [...BASE_DECK];
  return [...deck];
}

function shuffleDeck(deck) {
  const arr = validateDeck(deck);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  let safety = 0;
  while (safety++ < 20) {
    const unitCount = arr.slice(0, 4).filter((c) => CARD_DEFS[c].kind === 'unit').length;
    if (unitCount >= 2) break;
    const unitIdx = arr.findIndex((c, idx) => idx >= 4 && CARD_DEFS[c].kind === 'unit');
    const spellIdx = arr.findIndex((c, idx) => idx < 4 && CARD_DEFS[c].kind === 'spell');
    if (unitIdx >= 0 && spellIdx >= 0) {
      [arr[spellIdx], arr[unitIdx]] = [arr[unitIdx], arr[spellIdx]];
    }
  }
  return arr;
}

export function formatClock(sec) {
  const clamped = Math.max(0, Math.ceil(sec));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function clampFreezeOrigin(col, row) {
  return {
    col: Math.max(0, Math.min(COLS - 2, col)),
    row: Math.max(0, Math.min(ROWS - 2, row)),
  };
}

export class GameEngine {
  constructor(botId = 'petra', playerElo = 800, customDeck = BASE_DECK) {
    this.phase = 'idle';
    this.mode = 'blitz';
    this.puzzleId = null;
    this.isMultiplayer = false;
    this.isRemoteGuest = false;

    this.paused = false;
    this.startGrace = 0;
    this.shatterTimer = 0;
    this.pendingEnd = null;
    this.defeatedSide = null;

    this.elapsed = 0;
    this.timeRemaining = MATCH_DURATION_SEC;
    this.botId = botId;
    this.playerElo = playerElo;
    this.whiteDeck = validateDeck(customDeck);
    this.blackDeck = [...BASE_DECK];

    this.white = null;
    this.black = null;
    this.pieces = [];
    this.freezeZones = [];
    this.elixirRune = null; // { square: { col, row }, spawnedAt: number }
    this.nextRuneTime = ELIXIR_RUNE_FIRST_SEC;

    this.lastMove = null;
    this.moveLog = [];
    this.floatingBadges = [];
    this.bannerText = null;
    this.bannerId = 0;
    this.botQuip = null;
    this.botQuipTimer = 0;
    this.result = null;
    this.statsBySide = { white: makeEmptyStats(), black: makeEmptyStats() };

    this.replayFrames = [];
    this.replayAccum = 0;

    this.nextId = 1;
    this.lastTickSecond = -1;
    this.eventListeners = new Set();

    this.setupBoard('idle');
  }

  get stats() {
    return this.statsBySide.white;
  }

  onEvent(fn) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  emit(ev) {
    for (const fn of this.eventListeners) fn(ev);
  }

  setBot(botId) {
    this.botId = botId;
    if (this.phase === 'idle' || this.phase === 'ended') {
      this.setupBoard('idle');
    }
  }

  setCustomDeck(deck) {
    this.whiteDeck = validateDeck(deck);
    if (this.phase === 'idle') {
      this.setupBoard('idle');
    }
  }

  setPlayerElo(elo) {
    this.playerElo = elo;
  }

  togglePause() {
    if (this.isMultiplayer) return false;
    if (this.phase !== 'active' && this.phase !== 'overtime' && this.phase !== 'sudden_death') {
      return false;
    }
    this.paused = !this.paused;
    return this.paused;
  }

  startMatch({ botId, mode = 'blitz', puzzleId = null, isMultiplayer = false, isRemoteGuest = false, blackDeck = null } = {}) {
    if (botId) this.botId = botId;
    this.mode = mode;
    this.puzzleId = mode === 'puzzle' ? (puzzleId || 'puz_fork') : null;
    this.isMultiplayer = isMultiplayer;
    this.isRemoteGuest = isRemoteGuest;
    this.blackDeck = blackDeck ? validateDeck(blackDeck) : [...BASE_DECK];
    this.paused = false;

    if (mode === 'puzzle') {
      this.setupPuzzle(this.puzzleId);
      return;
    }

    const startPhase = mode === 'overtime' ? 'overtime' : 'active';
    this.setupBoard(startPhase);
    this.startGrace = START_GRACE_SEC;
    this.nextRuneTime = mode === 'overtime' ? 12 : ELIXIR_RUNE_FIRST_SEC;

    if (mode === 'overtime') {
      this.timeRemaining = OVERTIME_MODE_DURATION_SEC;
      this.showBanner('INSTANT OVERTIME — 2x ELIXIR');
      this.emit({ type: 'OVERTIME' });
    } else {
      this.showBanner('READY');
    }

    if (!isMultiplayer) {
      const bot = getBotById(this.botId);
      this.showBotQuip(bot.quips.start, 3.8);
    }
    this.captureReplayFrame(true);
  }

  setupPuzzle(puzzleId) {
    const puz = getPuzzleById(puzzleId);
    this.botId = puz.botId;
    this.phase = puz.overtime ? 'overtime' : 'active';
    this.elapsed = 0;
    this.timeRemaining = puz.durationSec;
    this.startGrace = 0.5;
    this.shatterTimer = 0;
    this.pendingEnd = null;
    this.defeatedSide = null;
    this.paused = false;
    this.lastTickSecond = -1;
    this.freezeZones = [];
    this.elixirRune = null;
    this.nextRuneTime = 9999; // Disabled in puzzles for exact determinism
    this.lastMove = null;
    this.moveLog = [];
    this.floatingBadges = [];
    this.result = null;
    this.replayFrames = [];
    this.replayAccum = 0;
    this.statsBySide = { white: makeEmptyStats(), black: makeEmptyStats() };

    this.white = {
      elixir: puz.whiteElixir,
      kingHp: puz.whiteHp,
      maxKingHp: KING_MAX_HP,
      hand: [...puz.whiteHand],
      queue: [...puz.whiteQueue],
      captured: [],
      breachUnlocked: puz.blackHp <= ROYAL_BREACH_HP,
      recentCaptureTime: -99,
      captureStreak: 0,
    };

    const blackDeck = shuffleDeck(BASE_DECK);
    this.black = {
      elixir: puz.blackElixir,
      kingHp: puz.blackHp,
      maxKingHp: KING_MAX_HP,
      hand: blackDeck.slice(0, 4),
      queue: blackDeck.slice(4),
      captured: [],
      breachUnlocked: puz.whiteHp <= ROYAL_BREACH_HP,
      recentCaptureTime: -99,
      captureStreak: 0,
    };

    this.pieces = puz.pieces.map((spec) => {
      const p = this.createPiece(spec.side, spec.type, { col: spec.col, row: spec.row }, 'idle');
      if (spec.hasMoved) p.hasMoved = true;
      return p;
    });

    this.showBanner(`PUZZLE: ${puz.name.toUpperCase()}`);
    this.showBotQuip(puz.goalText, 6.0);
    this.captureReplayFrame(true);
  }

  resetToIdle() {
    this.isMultiplayer = false;
    this.isRemoteGuest = false;
    this.paused = false;
    this.setupBoard('idle');
  }

  makeSideState(deckSource) {
    const deck = shuffleDeck(deckSource);
    return {
      elixir: START_ELIXIR,
      kingHp: KING_MAX_HP,
      maxKingHp: KING_MAX_HP,
      hand: deck.slice(0, 4),
      queue: deck.slice(4),
      captured: [],
      breachUnlocked: false,
      recentCaptureTime: -99,
      captureStreak: 0,
    };
  }

  createPiece(side, type, sq, state = 'idle') {
    const maxCd = type === 'K' ? COOLDOWN_KING : COOLDOWN_STANDARD;
    return {
      id: `p_${this.nextId++}`,
      side,
      type,
      square: { ...sq },
      fromSquare: { ...sq },
      targetSquare: { ...sq },
      renderX: sq.col,
      renderY: sq.row,
      netX: sq.col,
      netY: sq.row,
      moveProgress: 1,
      moveDuration: 0,
      moveIsJump: false,
      isStrikeMove: false,
      strikeLaunchSquare: null,
      state,
      stateTimer: 0,
      stateDuration: state === 'deploying' ? DEPLOY_DURATION : 0,
      cooldown: 0,
      maxCooldown: maxCd,
      gilded: false,
      hasCrownShield: false,
      hasMoved: false,
      premove: null,
      hurtFlash: 0,
      checkFlash: 0,
      landBounce: 0,
    };
  }

  setupBoard(phase) {
    this.phase = phase;
    this.elapsed = 0;
    this.timeRemaining = this.mode === 'overtime' ? OVERTIME_MODE_DURATION_SEC : MATCH_DURATION_SEC;
    this.startGrace = 0;
    this.shatterTimer = 0;
    this.pendingEnd = null;
    this.defeatedSide = null;
    this.paused = false;
    this.lastTickSecond = -1;
    this.white = this.makeSideState(this.whiteDeck);
    this.black = this.makeSideState(this.blackDeck);
    this.freezeZones = [];
    this.elixirRune = null;
    this.nextRuneTime = ELIXIR_RUNE_FIRST_SEC;
    this.lastMove = null;
    this.moveLog = [];
    this.floatingBadges = [];
    this.bannerText = null;
    this.botQuip = null;
    this.botQuipTimer = 0;
    this.result = null;
    this.replayFrames = [];
    this.replayAccum = 0;
    this.statsBySide = { white: makeEmptyStats(), black: makeEmptyStats() };

    this.pieces = [
      this.createPiece('white', 'K', { col: 3, row: 0 }),
      this.createPiece('white', 'P', { col: 2, row: 1 }),
      this.createPiece('white', 'P', { col: 3, row: 1 }),
      this.createPiece('black', 'K', { col: 3, row: 7 }),
      this.createPiece('black', 'P', { col: 2, row: 6 }),
      this.createPiece('black', 'P', { col: 3, row: 6 }),
    ];
  }

  getSideState(side) {
    return side === 'white' ? this.white : this.black;
  }

  isLivePlay() {
    return (
      (this.phase === 'active' || this.phase === 'overtime' || this.phase === 'sudden_death') &&
      !this.paused &&
      this.startGrace <= 0
    );
  }

  getElixirMultiplier() {
    if (this.phase === 'sudden_death') return 3;
    if (this.phase === 'overtime') return 2;
    return 1;
  }

  getElixirRate() {
    if (this.phase === 'sudden_death') return ELIXIR_RATE_SUDDEN;
    if (this.phase === 'overtime') return ELIXIR_RATE_OVERTIME;
    return ELIXIR_RATE_NORMAL;
  }

  showBanner(text) {
    this.bannerText = text;
    this.bannerId++;
  }

  showBotQuip(text, duration = 3.5) {
    this.botQuip = text;
    this.botQuipTimer = duration;
  }

  pushLog(side, text, badge, spellIcon) {
    this.moveLog.unshift({
      id: `log_${this.nextId++}`,
      timeStr: formatClock(this.timeRemaining),
      side,
      text,
      badge,
      spellIcon,
    });
    if (this.moveLog.length > 60) this.moveLog.pop();
  }

  pushBadge(badge, at, label) {
    this.floatingBadges.push({
      id: `b_${this.nextId++}`,
      col: at.col,
      row: at.row,
      badge,
      label,
      createdAt: this.elapsed,
      duration: 1.25,
    });
    this.emit({ type: 'BADGE', badge, at, label });
  }

  cycleCard(side, slotIndex) {
    const s = this.getSideState(side);
    const played = s.hand[slotIndex];
    const drawn = s.queue.shift();
    s.hand[slotIndex] = drawn;
    s.queue.push(played);
  }

  // =========================================================================
  // Actions
  // =========================================================================

  canControlPiece(piece, side) {
    if (this.phase === 'idle' || this.phase === 'ended' || this.phase === 'shattering') return false;
    if (this.paused) return false;
    if (piece.side !== side) return false;
    if (piece.state === 'moving' || piece.state === 'recoiling' || piece.state === 'swapping') {
      return false;
    }
    return true;
  }

  isPieceReady(piece) {
    if (this.startGrace > 0) return false;
    if (piece.state !== 'idle') return false;
    if (piece.cooldown > 0) return false;
    if (isFrozenForSide(piece.square, piece.side, this.freezeZones)) return false;
    return true;
  }

  commandMove(side, pieceId, targetSquare) {
    if (this.phase === 'idle' || this.phase === 'ended' || this.phase === 'shattering' || this.paused) {
      return 'invalid';
    }
    const piece = this.pieces.find((p) => p.id === pieceId);
    if (!piece || !this.canControlPiece(piece, side)) return 'invalid';
    if (sqEq(piece.square, targetSquare)) {
      piece.premove = null;
      return 'invalid';
    }

    if (!this.isPieceReady(piece)) {
      const premoveTargets = getLegalTargets(piece, this.pieces, this.freezeZones, true);
      if (premoveTargets.some((t) => sqEq(t.square, targetSquare))) {
        piece.premove = { ...targetSquare };
        return 'premoved';
      }
      return 'invalid';
    }

    const targets = getLegalTargets(piece, this.pieces, this.freezeZones, false);
    const found = targets.find((t) => sqEq(t.square, targetSquare));
    if (!found) return 'invalid';

    if (found.isCastle) {
      return this.executeCastle(piece, found.castleRookId, found.isCastle) ? 'moved' : 'invalid';
    }

    this.launchMove(piece, targetSquare, found.isKingStrike);
    return 'moved';
  }

  /** Free real-time Castling (K + unmoved back-rank Rook)! */
  executeCastle(king, rookId, dir) {
    const rook = this.pieces.find((p) => p.id === rookId && p.side === king.side);
    if (!rook || rook.state !== 'idle' || rook.cooldown > 0 || rook.hasMoved) return false;

    const homeRow = king.side === 'white' ? 0 : ROWS - 1;
    const kingDest = dir === 'left' ? { col: 1, row: homeRow } : { col: 4, row: homeRow };
    const rookDest = dir === 'left' ? { col: 2, row: homeRow } : { col: 3, row: homeRow };

    king.fromSquare = { ...king.square };
    king.targetSquare = kingDest;
    king.square = { ...kingDest };
    king.moveProgress = 0;
    king.moveDuration = SWAP_DURATION;
    king.state = 'swapping';
    king.hasMoved = true;
    king.cooldown = king.maxCooldown;
    king.premove = null;

    rook.fromSquare = { ...rook.square };
    rook.targetSquare = rookDest;
    rook.square = { ...rookDest };
    rook.moveProgress = 0;
    rook.moveDuration = SWAP_DURATION;
    rook.state = 'swapping';
    rook.hasMoved = true;
    rook.cooldown = rook.maxCooldown;
    rook.premove = null;

    this.lastMove = { from: { ...king.fromSquare }, to: { ...kingDest }, side: king.side };
    this.statsBySide[king.side].great++;
    this.pushLog(king.side, dir === 'left' ? 'O-O-O' : 'O-O', 'great');
    this.pushBadge('great', kingDest, 'CASTLE');
    this.emit({ type: 'CASTLE', side: king.side, kingSq: kingDest, rookSq: rookDest });
    this.captureReplayFrame(true);
    return true;
  }

  clearPremove(side, pieceId) {
    const piece = this.pieces.find((p) => p.id === pieceId && p.side === side);
    if (piece) piece.premove = null;
  }

  clearAllPremoves(side) {
    for (const p of this.pieces) {
      if (p.side === side) p.premove = null;
    }
  }

  launchMove(piece, targetSquare, isKingStrike) {
    piece.premove = null;
    piece.fromSquare = { ...piece.square };
    piece.targetSquare = { ...targetSquare };
    piece.moveProgress = 0;
    piece.state = 'moving';
    piece.isStrikeMove = isKingStrike;
    piece.strikeLaunchSquare = isKingStrike ? { ...piece.square } : null;
    piece.moveIsJump = piece.type === 'N';

    const dist = Math.max(
      Math.abs(targetSquare.col - piece.square.col),
      Math.abs(targetSquare.row - piece.square.row)
    );
    if (piece.type === 'N') {
      piece.moveDuration = KNIGHT_MOVE_DURATION;
    } else if (piece.type === 'P' || piece.type === 'K') {
      piece.moveDuration = STEP_MOVE_DURATION;
    } else {
      piece.moveDuration = Math.max(STEP_MOVE_DURATION, dist * SLIDE_PER_TILE_DURATION);
    }

    this.lastMove = {
      from: { ...piece.fromSquare },
      to: { ...targetSquare },
      side: piece.side,
    };

    this.emit({
      type: 'MOVE',
      side: piece.side,
      pieceType: piece.type,
      from: piece.fromSquare,
      to: targetSquare,
      isJump: piece.moveIsJump,
    });
    this.captureReplayFrame(true);
  }

  playUnitCard(side, slotIndex, targetSquare) {
    if (!this.isLivePlay()) return false;
    const s = this.getSideState(side);
    const cardId = s.hand[slotIndex];
    if (!cardId) return false;
    const def = CARD_DEFS[cardId];
    if (def.kind !== 'unit' || !def.pieceType) return false;
    if (s.elixir < def.cost) return false;

    const legalDrops = getLegalDropSquares(side, this.pieces, this.freezeZones, s.breachUnlocked);
    if (!legalDrops.some((sq) => sqEq(sq, targetSquare))) return false;

    s.elixir = Math.max(0, s.elixir - def.cost);
    this.cycleCard(side, slotIndex);

    const newPiece = this.createPiece(side, def.pieceType, targetSquare, 'deploying');
    newPiece.landBounce = LAND_BOUNCE_SEC;
    this.pieces.push(newPiece);

    this.pushLog(side, `${def.pieceType === 'P' ? 'P' : def.pieceType} @ ${toAlgebraic(targetSquare)}`);
    this.emit({ type: 'DEPLOY', side, pieceType: def.pieceType, at: targetSquare });

    // Dropping directly onto a Rank 4/5 Elixir Rune (when breach unlocked) claims it!
    this.checkElixirRuneClaim(side, targetSquare);
    this.captureReplayFrame(true);
    return true;
  }

  playFreezeCard(side, slotIndex, originCol, originRow) {
    if (!this.isLivePlay()) return false;
    const s = this.getSideState(side);
    if (s.hand[slotIndex] !== 'freeze') return false;
    if (s.elixir < CARD_DEFS.freeze.cost) return false;

    const clamped = clampFreezeOrigin(originCol, originRow);
    s.elixir = Math.max(0, s.elixir - CARD_DEFS.freeze.cost);
    this.cycleCard(side, slotIndex);

    this.freezeZones.push({
      id: `fz_${this.nextId++}`,
      owner: side,
      col: clamped.col,
      row: clamped.row,
      remaining: FREEZE_DURATION,
      duration: FREEZE_DURATION,
    });

    const frozenEnemies = this.pieces.filter(
      (p) =>
        p.side !== side &&
        p.square.col >= clamped.col &&
        p.square.col <= clamped.col + 1 &&
        p.square.row >= clamped.row &&
        p.square.row <= clamped.row + 1
    );

    let badge;
    if (frozenEnemies.length >= 2) {
      badge = 'great';
      this.statsBySide[side].great++;
      this.pushBadge('great', { col: clamped.col, row: clamped.row + 1 });
    }

    this.pushLog(side, `Freeze ${toAlgebraic(clamped)}`, badge, 'freeze');
    this.emit({ type: 'FREEZE', side, col: clamped.col, row: clamped.row });
    this.captureReplayFrame(true);
    return true;
  }

  playSwapCard(side, slotIndex, pieceAId, pieceBId) {
    if (!this.isLivePlay()) return false;
    if (pieceAId === pieceBId) return false;
    const s = this.getSideState(side);
    if (s.hand[slotIndex] !== 'swap') return false;
    if (s.elixir < CARD_DEFS.swap.cost) return false;

    const a = this.pieces.find((p) => p.id === pieceAId && p.side === side);
    const b = this.pieces.find((p) => p.id === pieceBId && p.side === side);
    if (!a || !b) return false;
    if (a.state === 'moving' || b.state === 'moving' || a.state === 'swapping' || b.state === 'swapping') {
      return false;
    }

    const checksBefore = findAllChecks(this.pieces, this.freezeZones);
    const kingWasChecked =
      (a.type === 'K' || b.type === 'K') && checksBefore.some((c) => c.kingSide === side);

    s.elixir = Math.max(0, s.elixir - CARD_DEFS.swap.cost);
    this.cycleCard(side, slotIndex);

    const sqA = { ...a.square };
    const sqB = { ...b.square };

    a.fromSquare = sqA;
    a.targetSquare = sqB;
    a.square = sqB;
    a.moveProgress = 0;
    a.moveDuration = SWAP_DURATION;
    a.state = 'swapping';
    a.premove = null;
    a.hasMoved = true;

    b.fromSquare = sqB;
    b.targetSquare = sqA;
    b.square = sqA;
    b.moveProgress = 0;
    b.moveDuration = SWAP_DURATION;
    b.state = 'swapping';
    b.premove = null;
    b.hasMoved = true;

    let badge;
    if (kingWasChecked) {
      const checksAfter = findAllChecks(this.pieces, this.freezeZones);
      if (!checksAfter.some((c) => c.kingSide === side)) {
        badge = 'brilliant';
        const kingSq = a.type === 'K' ? sqB : sqA;
        this.statsBySide[side].brilliant++;
        if (side === 'white' && !this.isMultiplayer) {
          this.showBotQuip(getBotById(this.botId).quips.brilliant, 3.0);
        }
        this.pushBadge('brilliant', kingSq, 'DODGE');
      }
    }

    this.pushLog(side, `Swap ${toAlgebraic(sqA)}/${toAlgebraic(sqB)}`, badge, 'swap');
    this.emit({ type: 'SWAP', side, sqA, sqB });
    this.captureReplayFrame(true);
    return true;
  }

  playPromoteCard(side, slotIndex, pieceId) {
    if (!this.isLivePlay()) return false;
    const s = this.getSideState(side);
    if (s.hand[slotIndex] !== 'promote') return false;
    if (s.elixir < CARD_DEFS.promote.cost) return false;

    const piece = this.pieces.find((p) => p.id === pieceId && p.side === side);
    if (!piece || piece.type === 'K') return false;
    if (piece.state === 'moving' || piece.state === 'promoting' || piece.state === 'swapping') {
      return false;
    }
    if (piece.type === 'Q' && piece.hasCrownShield) return false;
    if (piece.gilded && piece.hasCrownShield) return false;

    s.elixir = Math.max(0, s.elixir - CARD_DEFS.promote.cost);
    this.cycleCard(side, slotIndex);

    piece.state = 'promoting';
    piece.stateTimer = 0;
    piece.stateDuration = PROMOTE_CHANNEL;
    piece.premove = null;

    const outcome = getPromoteOutcome(piece);
    const logText =
      outcome === 'Q'
        ? `${toAlgebraic(piece.square)}=Q`
        : outcome === 'R'
          ? `${toAlgebraic(piece.square)}=R`
          : `Gild ${piece.type}${toAlgebraic(piece.square)}`;

    this.pushLog(side, logText, undefined, 'promote');
    this.captureReplayFrame(true);
    return true;
  }

  resign(side = 'white') {
    if (this.phase === 'idle' || this.phase === 'ended' || this.phase === 'shattering') return;
    this.finishMatch(oppositeSide(side), 'resign', false);
  }

  // =========================================================================
  // Elixir Rune Spawner & Claim
  // =========================================================================

  spawnElixirRune() {
    const candidates = [];
    for (const row of [3, 4]) {
      for (let col = 0; col < COLS; col++) {
        const sq = { col, row };
        if (getPieceAt(sq, this.pieces)) continue;
        if (this.freezeZones.some((z) => col >= z.col && col <= z.col + 1 && row >= z.row && row <= z.row + 1)) {
          continue;
        }
        candidates.push(sq);
      }
    }
    if (candidates.length === 0) return;
    const sq = candidates[Math.floor(Math.random() * candidates.length)];
    this.elixirRune = { square: sq, spawnedAt: this.elapsed };
    this.emit({ type: 'RUNE_SPAWN', at: sq });
    this.captureReplayFrame(true);
  }

  checkElixirRuneClaim(side, sq) {
    if (!this.elixirRune) return false;
    if (!sqEq(this.elixirRune.square, sq)) return false;
    const s = this.getSideState(side);
    s.elixir = Math.min(MAX_ELIXIR, s.elixir + ELIXIR_RUNE_BONUS);
    const at = { ...this.elixirRune.square };
    this.elixirRune = null;
    this.nextRuneTime = this.elapsed + ELIXIR_RUNE_INTERVAL_SEC;
    this.pushLog(side, `Rune +${ELIXIR_RUNE_BONUS} @ ${toAlgebraic(at)}`);
    this.emit({ type: 'RUNE_CLAIM', side, at, bonus: ELIXIR_RUNE_BONUS });
    return true;
  }

  // =========================================================================
  // Real-Time Tick
  // =========================================================================

  tick(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), 0.05);

    if (this.botQuipTimer > 0) {
      this.botQuipTimer -= dt;
      if (this.botQuipTimer <= 0) this.botQuip = null;
    }

    this.floatingBadges = this.floatingBadges.filter(
      (b) => this.elapsed - b.createdAt < b.duration
    );

    if (this.phase === 'idle' || this.phase === 'ended' || this.paused) return;

    if (this.phase === 'shattering') {
      this.shatterTimer -= dt;
      if (this.shatterTimer <= 0 && this.pendingEnd) {
        const { winner, reason } = this.pendingEnd;
        this.pendingEnd = null;
        this.finalizeMatch(winner, reason);
      }
      return;
    }

    if (this.startGrace > 0) {
      this.startGrace = Math.max(0, this.startGrace - dt);
      if (this.startGrace === 0 && this.mode === 'blitz') {
        this.showBanner('GO');
      }
      return;
    }

    this.elapsed += dt;
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);

    if (this.mode === 'blitz' && this.phase === 'active' && this.timeRemaining <= OVERTIME_REMAINING_SEC) {
      this.phase = 'overtime';
      this.showBanner('OVERTIME — 2x ELIXIR & CENTER QUEENS');
      if (!this.isMultiplayer) this.showBotQuip(getBotById(this.botId).quips.overtime, 3.6);
      this.emit({ type: 'OVERTIME' });
      this.captureReplayFrame(true);
    }

    // Center-Line +2 Elixir Rune spawner
    if (this.mode !== 'puzzle' && !this.elixirRune && this.elapsed >= this.nextRuneTime) {
      this.spawnElixirRune();
    }

    if (this.timeRemaining <= 10 && this.timeRemaining > 0) {
      const secInt = Math.ceil(this.timeRemaining);
      if (secInt !== this.lastTickSecond) {
        this.lastTickSecond = secInt;
        this.emit({ type: 'CLOCK_TICK', overtime: this.phase !== 'active' });
      }
    }

    if (this.timeRemaining <= 0) {
      if (this.mode === 'puzzle') {
        this.finishMatch('black', 'time', false);
        return;
      }
      if (this.phase === 'overtime' || this.phase === 'active') {
        if (this.white.kingHp !== this.black.kingHp) {
          this.finishMatch(this.white.kingHp > this.black.kingHp ? 'white' : 'black', 'time', false);
          return;
        }
        this.phase = 'sudden_death';
        this.timeRemaining = SUDDEN_DEATH_DURATION_SEC;
        this.lastTickSecond = -1;
        this.showBanner('SUDDEN DEATH — 3x ELIXIR');
        this.emit({ type: 'SUDDEN_DEATH' });
      } else if (this.phase === 'sudden_death') {
        if (this.white.kingHp !== this.black.kingHp) {
          this.finishMatch(this.white.kingHp > this.black.kingHp ? 'white' : 'black', 'sudden_death', false);
        } else {
          const evalScore = this.getEvalNormalized();
          const winner = Math.abs(evalScore) < 0.04 ? 'draw' : evalScore > 0 ? 'white' : 'black';
          this.finishMatch(winner, 'time', false);
        }
        return;
      }
    }

    const rate = this.getElixirRate();
    this.white.elixir = Math.min(MAX_ELIXIR, this.white.elixir + rate * dt);
    this.black.elixir = Math.min(MAX_ELIXIR, this.black.elixir + rate * dt);

    for (let i = 0; i < this.freezeZones.length; i++) {
      this.freezeZones[i].remaining -= dt;
    }
    this.freezeZones = this.freezeZones.filter((z) => z.remaining > 0);

    const snapshot = [...this.pieces];
    for (let i = 0; i < snapshot.length; i++) {
      const p = snapshot[i];
      if (!this.pieces.includes(p)) continue;

      if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt);
      if (p.checkFlash > 0) p.checkFlash = Math.max(0, p.checkFlash - dt);
      if (p.landBounce > 0) p.landBounce = Math.max(0, p.landBounce - dt);

      const frozen = isFrozenForSide(p.square, p.side, this.freezeZones);

      if (p.state === 'deploying') {
        if (!frozen) {
          p.stateTimer += dt;
          if (p.stateTimer >= p.stateDuration) {
            p.state = 'idle';
            p.stateTimer = 0;
            p.landBounce = LAND_BOUNCE_SEC * 0.7;
            this.checkImmediateCheckTrigger(p);
          }
        }
        continue;
      }

      if (p.state === 'promoting') {
        if (!frozen) {
          p.stateTimer += dt;
          if (p.stateTimer >= p.stateDuration) {
            this.completePromotion(p);
          }
        }
        continue;
      }

      if (p.state === 'swapping') {
        p.moveProgress = Math.min(1, p.moveProgress + dt / p.moveDuration);
        const t = 1 - (1 - p.moveProgress) * (1 - p.moveProgress);
        p.renderX = p.fromSquare.col + (p.targetSquare.col - p.fromSquare.col) * t;
        p.renderY = p.fromSquare.row + (p.targetSquare.row - p.fromSquare.row) * t;
        if (p.moveProgress >= 1) {
          p.state = 'idle';
          p.renderX = p.square.col;
          p.renderY = p.square.row;
          p.landBounce = LAND_BOUNCE_SEC;
          this.checkElixirRuneClaim(p.side, p.square);
          this.checkImmediateCheckTrigger(p);
        }
        continue;
      }

      if (p.state === 'recoiling') {
        p.moveProgress = Math.min(1, p.moveProgress + dt / p.moveDuration);
        const t = 1 - (1 - p.moveProgress) * (1 - p.moveProgress);
        p.renderX = p.fromSquare.col + (p.targetSquare.col - p.fromSquare.col) * t;
        p.renderY = p.fromSquare.row + (p.targetSquare.row - p.fromSquare.row) * t;
        if (p.moveProgress >= 1) {
          p.state = 'idle';
          p.square = { ...p.targetSquare };
          p.renderX = p.square.col;
          p.renderY = p.square.row;
          p.landBounce = LAND_BOUNCE_SEC * 0.85;
        }
        continue;
      }

      if (p.state === 'moving') {
        this.advanceMovingPiece(p, dt);
        if (this.phase === 'ended' || this.phase === 'shattering') return;
        continue;
      }

      if (p.cooldown > 0 && !frozen) {
        p.cooldown = Math.max(0, p.cooldown - dt);
      }

      if (p.premove && this.isPieceReady(p)) {
        const queued = p.premove;
        p.premove = null;
        const targets = getLegalTargets(p, this.pieces, this.freezeZones, false);
        const match = targets.find((t) => sqEq(t.square, queued));
        if (match) {
          if (match.isCastle) {
            this.executeCastle(p, match.castleRookId, match.isCastle);
          } else {
            this.launchMove(p, queued, match.isKingStrike);
          }
        }
      }
    }

    this.replayAccum += dt;
    if (this.replayAccum >= 0.25) {
      this.replayAccum = 0;
      this.captureReplayFrame(false);
    }
  }

  /** Smooth 60 FPS client-side extrapolation/interpolation for 1v1 Guest between 20 Hz Host snapshots. */
  tickGuestInterpolation(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    if (this.phase === 'idle' || this.phase === 'ended') return;

    this.floatingBadges = this.floatingBadges.filter(
      (b) => this.elapsed - b.createdAt < b.duration
    );

    if (this.phase === 'shattering' || this.startGrace > 0) return;

    this.elapsed += dt;
    this.timeRemaining = Math.max(0, this.timeRemaining - dt);

    const rate = this.getElixirRate();
    this.white.elixir = Math.min(MAX_ELIXIR, this.white.elixir + rate * dt);
    this.black.elixir = Math.min(MAX_ELIXIR, this.black.elixir + rate * dt);

    for (let i = 0; i < this.freezeZones.length; i++) {
      this.freezeZones[i].remaining = Math.max(0, this.freezeZones[i].remaining - dt);
    }

    const alpha = 1 - Math.exp(-26 * dt);
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      const tx = typeof p.netX === 'number' ? p.netX : p.renderX;
      const ty = typeof p.netY === 'number' ? p.netY : p.renderY;
      p.renderX += (tx - p.renderX) * alpha;
      p.renderY += (ty - p.renderY) * alpha;

      const frozen = isFrozenForSide(p.square, p.side, this.freezeZones);
      if (p.state === 'idle' && p.cooldown > 0 && !frozen) {
        p.cooldown = Math.max(0, p.cooldown - dt);
      } else if ((p.state === 'deploying' || p.state === 'promoting') && !frozen) {
        p.stateTimer = Math.min(p.stateDuration, p.stateTimer + dt);
      }
      if (p.landBounce > 0) p.landBounce = Math.max(0, p.landBounce - dt);
      if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    }
  }

  advanceMovingPiece(p, dt) {
    const prevProgress = p.moveProgress;
    p.moveProgress = Math.min(1, p.moveProgress + dt / p.moveDuration);

    const t = p.moveProgress;
    p.renderX = p.fromSquare.col + (p.targetSquare.col - p.fromSquare.col) * t;
    p.renderY = p.fromSquare.row + (p.targetSquare.row - p.fromSquare.row) * t;

    if (!p.moveIsJump && (p.type === 'B' || p.type === 'R' || p.type === 'Q') && p.moveProgress < 1) {
      const path = getRayPath(p.fromSquare, p.targetSquare);
      if (path.length > 1) {
        const prevIdx = Math.floor(prevProgress * path.length);
        const currIdx = Math.min(path.length - 1, Math.floor(p.moveProgress * path.length));
        for (let idx = Math.max(0, prevIdx); idx < currIdx; idx++) {
          const midSq = path[idx];
          // Sliding through an Elixir Rune claims it mid-flight!
          this.checkElixirRuneClaim(p.side, midSq);

          const blocker = getPieceAt(midSq, this.pieces, p.id);
          if (blocker && isPieceTargetable(blocker)) {
            if (blocker.side !== p.side) {
              p.targetSquare = { ...midSq };
              p.isStrikeMove = blocker.type === 'K';
              if (p.isStrikeMove) p.strikeLaunchSquare = { ...p.fromSquare };
              p.moveProgress = 1;
              break;
            } else {
              const stopSq = idx > 0 ? path[idx - 1] : p.fromSquare;
              p.targetSquare = { ...stopSq };
              p.isStrikeMove = false;
              p.moveProgress = 1;
              break;
            }
          }
          if (isFrozenForSide(midSq, p.side, this.freezeZones)) {
            const stopSq = idx > 0 ? path[idx - 1] : p.fromSquare;
            p.targetSquare = { ...stopSq };
            p.isStrikeMove = false;
            p.moveProgress = 1;
            break;
          }
        }
      }
    }

    if (p.moveProgress >= 1) {
      this.resolveMoveArrival(p);
    }
  }

  resolveMoveArrival(p) {
    const dest = p.targetSquare;
    const occupant = getPieceAt(dest, this.pieces, p.id);

    if (occupant && occupant.side === p.side) {
      this.startRecoil(p, p.fromSquare, false);
      return;
    }

    if (occupant && occupant.side !== p.side && occupant.type === 'K') {
      const baseDmg = PIECE_KING_STRIKE[p.type];
      const dmg = baseDmg + (p.gilded ? 1 : 0);
      const launchSq = p.strikeLaunchSquare || p.fromSquare;

      this.damageKing(occupant.side, dmg, p.side, p.type, dest, true);
      p.hasMoved = true;
      p.cooldown = p.maxCooldown;

      if (this.phase !== 'ended' && this.phase !== 'shattering') {
        this.startRecoil(p, launchSq, true);
      }
      return;
    }

    if (occupant && occupant.side !== p.side && isPieceTargetable(occupant)) {
      if (occupant.hasCrownShield) {
        occupant.hasCrownShield = false;
        occupant.hurtFlash = 0.35;
        p.hasMoved = true;
        p.cooldown = p.maxCooldown;
        this.emit({ type: 'CROWN_BREAK', at: dest });
        this.pushLog(occupant.side, `Shield @ ${toAlgebraic(dest)}`);
        this.startRecoil(p, p.fromSquare, true);
        this.captureReplayFrame(true);
        return;
      }

      this.pieces = this.pieces.filter((x) => x.id !== occupant.id);
      const attackerSide = this.getSideState(p.side);
      const attackerStats = this.statsBySide[p.side];
      const victimStats = this.statsBySide[occupant.side];
      attackerSide.captured.push(occupant.type);

      if (this.elapsed - attackerSide.recentCaptureTime <= 3.5) {
        attackerSide.captureStreak++;
      } else {
        attackerSide.captureStreak = 1;
      }
      attackerSide.recentCaptureTime = this.elapsed;

      const tradeDelta = PIECE_ELIXIR_VALUE[occupant.type] - PIECE_ELIXIR_VALUE[p.type];
      let badge;

      attackerStats.captures++;
      if (tradeDelta > attackerStats.bestTrade) attackerStats.bestTrade = tradeDelta;

      if (tradeDelta >= 2 || (p.type === 'P' && occupant.type === 'Q')) {
        badge = 'brilliant';
        attackerStats.brilliant++;
        if (p.side === 'white' && !this.isMultiplayer) {
          this.showBotQuip(getBotById(this.botId).quips.brilliant, 3.0);
        }
        this.pushBadge('brilliant', dest, `+${Math.max(2, tradeDelta)}`);
      } else if (attackerSide.captureStreak >= 2) {
        badge = 'streak';
        this.pushBadge('streak', dest, `x${attackerSide.captureStreak}`);
      } else if (tradeDelta >= 2) {
        victimStats.blunders++;
        this.pushBadge('blunder', dest);
      }

      p.square = { ...dest };
      p.renderX = dest.col;
      p.renderY = dest.row;
      p.state = 'idle';
      p.hasMoved = true;
      p.cooldown = p.maxCooldown;
      p.landBounce = LAND_BOUNCE_SEC;

      const capNotation = `${p.type === 'P' ? 'P' : p.type}x${occupant.type}${toAlgebraic(dest)}`;
      this.pushLog(p.side, capNotation, badge);
      this.emit({
        type: 'CAPTURE',
        side: p.side,
        capturer: p.type,
        victim: occupant.type,
        at: dest,
        streak: attackerSide.captureStreak,
        tradeDelta,
      });

      this.checkElixirRuneClaim(p.side, dest);
      this.checkAutoPromotion(p);
      this.checkImmediateCheckTrigger(p);
      this.captureReplayFrame(true);
      return;
    }

    const wasTargetedStrike = p.isStrikeMove;
    p.square = { ...dest };
    p.renderX = dest.col;
    p.renderY = dest.row;
    p.state = 'idle';
    p.hasMoved = true;
    p.cooldown = p.maxCooldown;
    p.landBounce = LAND_BOUNCE_SEC;

    if (wasTargetedStrike) {
      this.emit({ type: 'DODGE', at: dest });
    }

    this.checkElixirRuneClaim(p.side, dest);
    const promoted = this.checkAutoPromotion(p);
    const checked = this.checkImmediateCheckTrigger(p);
    if (!promoted && !checked) {
      const quietNotation = `${p.type === 'P' ? '' : p.type}${toAlgebraic(dest)}`;
      this.pushLog(p.side, quietNotation);
    }
    this.captureReplayFrame(true);
  }

  startRecoil(p, returnSq, keepCooldown) {
    p.fromSquare = { ...p.targetSquare };
    p.targetSquare = { ...returnSq };
    p.square = { ...returnSq };
    p.moveProgress = 0;
    p.moveDuration = RECOIL_DURATION;
    p.state = 'recoiling';
    p.isStrikeMove = false;
    if (!keepCooldown) p.cooldown = 0;
  }

  checkAutoPromotion(p) {
    if (p.type !== 'P') return false;
    const isOvertime = this.phase === 'overtime' || this.phase === 'sudden_death';
    const reachedBackRank =
      (p.side === 'white' && p.square.row === ROWS - 1) || (p.side === 'black' && p.square.row === 0);
    const crossedCenter =
      isOvertime &&
      ((p.side === 'white' && p.square.row >= 4) || (p.side === 'black' && p.square.row <= 3));

    if (reachedBackRank || crossedCenter) {
      p.type = 'Q';
      p.landBounce = LAND_BOUNCE_SEC;
      this.statsBySide[p.side].queensPromoted++;
      this.pushLog(p.side, `${toAlgebraic(p.square)}=Q`, 'great', 'promote');
      this.pushBadge('great', p.square, 'QUEEN');
      this.emit({ type: 'PROMOTE', side: p.side, at: p.square, toQueen: true });
      return true;
    }
    return false;
  }

  completePromotion(p) {
    p.state = 'idle';
    p.stateTimer = 0;
    p.landBounce = LAND_BOUNCE_SEC;
    const outcome = getPromoteOutcome(p);

    if (outcome === 'Q') {
      p.type = 'Q';
      this.statsBySide[p.side].queensPromoted++;
      this.pushBadge('great', p.square, 'QUEEN');
      this.emit({ type: 'PROMOTE', side: p.side, at: p.square, toQueen: true });
    } else if (outcome === 'R') {
      p.type = 'R';
      this.pushBadge('great', p.square, 'ROOK');
      this.emit({ type: 'PROMOTE', side: p.side, at: p.square, toQueen: false });
    } else if (outcome === 'SHIELD') {
      p.hasCrownShield = true;
      this.emit({ type: 'PROMOTE', side: p.side, at: p.square, toQueen: false });
    } else {
      p.gilded = true;
      p.hasCrownShield = true;
      p.maxCooldown = COOLDOWN_GILDED;
      p.cooldown = Math.min(p.cooldown, COOLDOWN_GILDED);
      this.emit({ type: 'PROMOTE', side: p.side, at: p.square, toQueen: false });
    }
    this.checkImmediateCheckTrigger(p);
    this.captureReplayFrame(true);
  }

  checkImmediateCheckTrigger(p) {
    if (p.type === 'K' || this.phase === 'ended' || this.phase === 'shattering') return false;
    const enemySide = oppositeSide(p.side);
    const enemyKing = this.pieces.find((k) => k.side === enemySide && k.type === 'K');
    if (!enemyKing) return false;

    if (doesPieceAttackSquare(p, enemyKing.square, this.pieces, this.freezeZones)) {
      enemyKing.checkFlash = 0.5;
      this.damageKing(enemySide, CHECK_CHIP_DAMAGE, p.side, p.type, enemyKing.square, false);
      this.pushBadge('check', enemyKing.square, `-${CHECK_CHIP_DAMAGE}`);
      this.emit({
        type: 'CHECK',
        attackerSide: p.side,
        at: p.square,
        kingSq: enemyKing.square,
      });

      const targets = getLegalTargets(p, this.pieces, this.freezeZones, false);
      const otherValuable = targets.some((t) => {
        if (!t.isCapture || t.isKingStrike) return false;
        const victim = getPieceAt(t.square, this.pieces, p.id);
        return victim && PIECE_ELIXIR_VALUE[victim.type] >= 3;
      });
      if (otherValuable) {
        this.statsBySide[p.side].great++;
        this.pushBadge('great', p.square, 'FORK');
      }
      return true;
    }
    return false;
  }

  damageKing(victimSide, damage, attackerSide, attackerType, kingSq, isStrike) {
    const victimState = this.getSideState(victimSide);
    const attackerState = this.getSideState(attackerSide);
    const prevHp = victimState.kingHp;
    victimState.kingHp = Math.max(0, victimState.kingHp - damage);

    const kingPiece = this.pieces.find((p) => p.side === victimSide && p.type === 'K');
    if (kingPiece) kingPiece.hurtFlash = isStrike ? 0.45 : 0.28;

    this.statsBySide[attackerSide].damageDealt += damage;

    if (isStrike) {
      let badge;
      if (damage >= 3) {
        badge = 'great';
        this.statsBySide[attackerSide].great++;
        this.pushBadge('great', kingSq, `-${damage}`);
      } else {
        this.pushBadge('check', kingSq, `-${damage}`);
      }
      this.pushLog(attackerSide, `${attackerType} strikes K (-${damage})`, badge);
      this.emit({
        type: 'KING_STRIKE',
        attackerSide,
        pieceType: attackerType,
        damage,
        kingSq,
      });
    } else {
      this.pushLog(attackerSide, `${attackerType}${toAlgebraic(kingSq)}+ (-1)`, 'check');
    }

    if (prevHp > ROYAL_BREACH_HP && victimState.kingHp <= ROYAL_BREACH_HP && victimState.kingHp > 0) {
      attackerState.breachUnlocked = true;
      if (attackerSide === 'white' || this.isMultiplayer) {
        this.showBanner('ROYAL BREACH — FORWARD DROP UNLOCKED');
      }
      this.emit({ type: 'BREACH', side: attackerSide });
    }

    if (victimState.kingHp <= 0) {
      this.finishMatch(attackerSide, 'checkmate', true, kingSq);
    } else if (this.phase === 'sudden_death') {
      this.finishMatch(attackerSide, 'sudden_death', true, kingSq);
    }
  }

  finishMatch(winner, reason, useShatterBeat = false, kingSq = null) {
    if (this.phase === 'ended' || this.phase === 'shattering') return;
    this.captureReplayFrame(true);

    if (useShatterBeat && winner !== 'draw') {
      this.phase = 'shattering';
      this.shatterTimer = SHATTER_DURATION_SEC;
      this.pendingEnd = { winner, reason };
      this.defeatedSide = oppositeSide(winner);
      const loserKing = this.pieces.find((p) => p.side === this.defeatedSide && p.type === 'K');
      this.emit({
        type: 'KING_SHATTER',
        loserSide: this.defeatedSide,
        at: kingSq || (loserKing ? loserKing.square : { col: 3, row: 7 }),
      });
      return;
    }

    this.finalizeMatch(winner, reason);
  }

  finalizeMatch(winner, reason) {
    if (this.phase === 'ended') return;
    this.phase = 'ended';

    let eloDelta = 0;
    if (this.mode !== 'puzzle') {
      const oppElo = this.isMultiplayer ? this.playerElo : getBotById(this.botId).elo;
      const expected = 1 / (1 + Math.pow(10, (oppElo - this.playerElo) / 400));
      const score = winner === 'white' ? 1 : winner === 'draw' ? 0.5 : 0;
      eloDelta = Math.round(28 * (score - expected));
    }

    this.result = {
      winner,
      reason,
      eloDelta,
      mode: this.mode,
      puzzleId: this.puzzleId,
      stats: { ...this.statsBySide.white },
      statsBySide: {
        white: { ...this.statsBySide.white },
        black: { ...this.statsBySide.black },
      },
    };

    if (!this.isMultiplayer && this.mode !== 'puzzle') {
      const bot = getBotById(this.botId);
      if (winner === 'white') this.showBotQuip(bot.quips.lose, 5.5);
      else if (winner === 'black') this.showBotQuip(bot.quips.win, 5.5);
    }

    this.emit({ type: 'GAME_OVER', winner });
  }

  // =========================================================================
  // Replay Recording & Network Serialization
  // =========================================================================

  captureReplayFrame(force = false) {
    if (this.phase === 'idle') return;
    if (!force && this.replayFrames.length > 600) return;
    this.replayFrames.push({
      t: Number(this.elapsed.toFixed(2)),
      timeRemaining: Number(this.timeRemaining.toFixed(2)),
      phase: this.phase,
      whiteHp: this.white.kingHp,
      blackHp: this.black.kingHp,
      whiteElixir: Number(this.white.elixir.toFixed(2)),
      blackElixir: Number(this.black.elixir.toFixed(2)),
      evalNorm: this.getEvalNormalized(),
      elixirRune: this.elixirRune ? { square: { ...this.elixirRune.square }, spawnedAt: this.elixirRune.spawnedAt } : null,
      lastMove: this.lastMove ? { from: { ...this.lastMove.from }, to: { ...this.lastMove.to }, side: this.lastMove.side } : null,
      freezeZones: this.freezeZones.map((z) => ({ ...z })),
      pieces: this.pieces.map((p) => ({
        id: p.id,
        side: p.side,
        type: p.type,
        square: { ...p.square },
        renderX: Number(p.renderX.toFixed(2)),
        renderY: Number(p.renderY.toFixed(2)),
        state: p.state,
        stateTimer: p.stateTimer,
        stateDuration: p.stateDuration,
        cooldown: Number(p.cooldown.toFixed(2)),
        maxCooldown: p.maxCooldown,
        gilded: p.gilded,
        hasCrownShield: p.hasCrownShield,
        moveIsJump: p.moveIsJump,
        moveProgress: p.moveProgress,
        hurtFlash: p.hurtFlash,
        landBounce: 0,
        premove: null,
      })),
    });
  }

  exportNetState() {
    return {
      phase: this.phase,
      mode: this.mode,
      elapsed: this.elapsed,
      timeRemaining: this.timeRemaining,
      startGrace: this.startGrace,
      defeatedSide: this.defeatedSide,
      white: this.white,
      black: this.black,
      pieces: this.pieces,
      freezeZones: this.freezeZones,
      elixirRune: this.elixirRune,
      lastMove: this.lastMove,
      moveLog: this.moveLog.slice(0, 25),
      floatingBadges: this.floatingBadges,
      bannerText: this.bannerText,
      bannerId: this.bannerId,
      result: this.result,
    };
  }

  applyNetState(net) {
    const prevById = new Map(this.pieces.map((p) => [p.id, p]));

    this.phase = net.phase;
    this.mode = net.mode;
    this.elapsed = net.elapsed;
    this.timeRemaining = net.timeRemaining;
    this.startGrace = net.startGrace;
    this.defeatedSide = net.defeatedSide;
    this.white = net.white;
    this.black = net.black;
    this.freezeZones = net.freezeZones;
    this.elixirRune = net.elixirRune || null;
    this.lastMove = net.lastMove;
    this.moveLog = net.moveLog;
    this.floatingBadges = net.floatingBadges;
    this.bannerText = net.bannerText;
    this.bannerId = net.bannerId;
    this.result = net.result;

    // Preserve local renderX/renderY for silky 60 FPS interpolation toward authoritative netX/netY!
    this.pieces = net.pieces.map((np) => {
      const prev = prevById.get(np.id);
      const jumpDist = prev ? Math.hypot(np.renderX - prev.renderX, np.renderY - prev.renderY) : 99;
      return {
        ...np,
        netX: np.renderX,
        netY: np.renderY,
        renderX: prev && jumpDist < 4.5 ? prev.renderX : np.renderX,
        renderY: prev && jumpDist < 4.5 ? prev.renderY : np.renderY,
      };
    });
  }

  getEvalNormalized() {
    return computeEvalNormalized(
      this.white.kingHp,
      this.black.kingHp,
      this.white.elixir,
      this.black.elixir,
      this.pieces
    );
  }

  getActiveChecks() {
    return findAllChecks(this.pieces, this.freezeZones);
  }
}
