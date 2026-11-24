import { CARD_DEFS, COLS, getBotById, PIECE_ELIXIR_VALUE, PIECE_KING_STRIKE, ROWS } from './constants.js';
import {
  doesPieceAttackSquare,
  findAllChecks,
  getLegalDropSquares,
  getLegalTargets,
  getPieceAt,
  getPreviewAttackSquares,
  getRayPath,
  sqEq,
} from './chessRules.js';

export class BotAI {
  constructor() {
    this.decisionTimer = 0.85;
    this.reflexTimer = 0.14;
  }

  reset() {
    this.decisionTimer = 0.75;
    this.reflexTimer = 0.14;
  }

  tick(engine, dt) {
    if (engine.isMultiplayer || !engine.isLivePlay()) return;

    const bot = getBotById(engine.botId);

    // High-ELO reflex layer (Tobi 1550 & GM Ink 1900): mid-slide dodging + recapture premoves!
    if (bot.elo >= 1500) {
      this.reflexTimer -= dt;
      if (this.reflexTimer <= 0) {
        this.reflexTimer = bot.elo >= 1800 ? 0.12 : 0.2;
        if (this.tryReflexDodgeOrPremove(engine, bot)) {
          return;
        }
      }
    }

    this.decisionTimer -= dt;
    if (this.decisionTimer > 0) return;

    const jitter = 0.85 + Math.random() * 0.3;
    const pace = engine.phase === 'overtime' ? 0.84 : engine.phase === 'sudden_death' ? 0.72 : 1.0;
    this.decisionTimer = bot.reactionSec * jitter * pace;

    this.takeBestAction(engine, bot);
  }

  /** Detect incoming White sliders/leaps targeting our valuable pieces -> dodge mid-slide or queue recapture premove! */
  tryReflexDodgeOrPremove(engine, bot) {
    const pieces = engine.pieces;
    const zones = engine.freezeZones;

    const incoming = pieces.filter((p) => p.side === 'white' && p.state === 'moving' && p.moveProgress < 0.78);
    if (incoming.length === 0) return false;

    for (const attacker of incoming) {
      const targetSq = attacker.targetSquare;
      const victim = getPieceAt(targetSq, pieces, attacker.id);
      if (!victim || victim.side !== 'black') continue;

      const victimVal = victim.type === 'K' ? 10 : PIECE_ELIXIR_VALUE[victim.type];
      if (victimVal < 3) continue; // Don't panic-dodge a cheap Pawn

      // 1. If victim is ready -> sidestep off the attack ray (clutch mid-slide dodge!)
      if (engine.isPieceReady(victim)) {
        const ray = attacker.moveIsJump ? [targetSq] : getRayPath(attacker.fromSquare, targetSq);
        const targets = getLegalTargets(victim, pieces, zones, false);
        const safeEscapes = targets.filter(
          (t) =>
            !ray.some((rsq) => sqEq(rsq, t.square)) &&
            !this.isSquareAttackedBy(t.square, 'white', pieces, zones, victim.id)
        );
        if (safeEscapes.length > 0 && Math.random() < (bot.elo >= 1800 ? 0.82 : 0.55)) {
          // Prefer a capturing escape if available
          safeEscapes.sort((a, b) => Number(b.isCapture) - Number(a.isCapture));
          return engine.commandMove('black', victim.id, safeEscapes[0].square) === 'moved';
        }
      }

      // 2. Otherwise queue a recapture premove on a cooling defender aimed at targetSq!
      if (bot.elo >= 1800) {
        for (const ally of pieces) {
          if (ally.side !== 'black' || ally.id === victim.id || ally.premove) continue;
          if (ally.state !== 'idle' || ally.cooldown <= 0 || ally.cooldown > 1.2) continue;
          const pTargets = getLegalTargets(ally, pieces, zones, true);
          if (pTargets.some((t) => sqEq(t.square, targetSq))) {
            engine.commandMove('black', ally.id, targetSq);
            return true;
          }
        }
      }
    }
    return false;
  }

  takeBestAction(engine, bot) {
    const candidates = [];
    const pieces = engine.pieces;
    const zones = engine.freezeZones;
    const black = engine.black;
    const rune = engine.elixirRune;

    const blackKing = pieces.find((p) => p.side === 'black' && p.type === 'K');
    const whiteKing = pieces.find((p) => p.side === 'white' && p.type === 'K');
    if (!blackKing || !whiteKing) return;

    const checks = findAllChecks(pieces, zones);
    const threatsToBlackKing = checks.filter((c) => c.kingSide === 'black');

    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.side !== 'black' || !engine.isPieceReady(p)) continue;
      const targets = getLegalTargets(p, pieces, zones, false);

      for (let j = 0; j < targets.length; j++) {
        const t = targets[j];
        let score = 0;

        // Real-time Castling when King is under check or Rook is ready on back rank
        if (t.isCastle) {
          score += threatsToBlackKing.length > 0 ? 72 * bot.defense : 26;
        }

        // Grabbing the Center-Line +2 Elixir Rune!
        if (rune && sqEq(t.square, rune.square)) {
          score += 42 * bot.aggression + (black.elixir < 7 ? 18 : 4);
        }

        if (t.isKingStrike) {
          const dmg = PIECE_KING_STRIKE[p.type] + (p.gilded ? 1 : 0);
          score += 55 + dmg * 14 * bot.aggression;
          if (engine.white.kingHp <= dmg || engine.phase === 'sudden_death') {
            score += 200;
          }
        }

        if (t.isCapture) {
          const victim = getPieceAt(t.square, pieces, p.id);
          if (victim) {
            const victimVal = PIECE_ELIXIR_VALUE[victim.type] + (victim.gilded ? 2 : 0);
            const myVal = PIECE_ELIXIR_VALUE[p.type];
            score += 32 + victimVal * 12;

            if (threatsToBlackKing.some((c) => c.pieceId === victim.id)) {
              score += 55 * bot.defense;
            }
            if (victimVal > myVal) {
              score += (victimVal - myVal) * 10 * bot.tradeAwareness;
            }
          }
        }

        if (p.type === 'P') {
          const isOT = engine.phase === 'overtime' || engine.phase === 'sudden_death';
          if (t.square.row === 0 || (isOT && t.square.row <= 3)) {
            score += 78 * bot.aggression;
          } else {
            score += (7 - t.square.row) * (isOT ? 6 : 2.5);
          }
        }

        if (p.type === 'K' && !t.isCastle) {
          if (threatsToBlackKing.length > 0) {
            const stillThreatened = this.isSquareAttackedBy(t.square, 'white', pieces, zones, p.id);
            score += stillThreatened ? -35 : 62 * bot.defense;
          } else {
            score -= t.isCapture ? 0 : 12 + (7 - t.square.row) * 4;
          }
        }

        if (p.type !== 'K' && !t.isKingStrike) {
          const virtualPiece = { ...p, square: t.square, state: 'idle' };
          if (doesPieceAttackSquare(virtualPiece, whiteKing.square, pieces, zones)) {
            score += 24 * bot.aggression;
          }
        }

        if (p.type !== 'K' && bot.tradeAwareness > 0.35) {
          const attackedAfter = this.isSquareAttackedBy(t.square, 'white', pieces, zones, p.id);
          if (attackedAfter && !t.isCapture) {
            score -= PIECE_ELIXIR_VALUE[p.type] * 9 * bot.tradeAwareness;
          } else if (attackedAfter && t.isCapture) {
            const victim = getPieceAt(t.square, pieces, p.id);
            const victimVal = victim ? PIECE_ELIXIR_VALUE[victim.type] : 0;
            if (PIECE_ELIXIR_VALUE[p.type] > victimVal) {
              score -= (PIECE_ELIXIR_VALUE[p.type] - victimVal) * 8 * bot.tradeAwareness;
            }
          }
        }

        const centerDist = Math.abs(t.square.col - 2.5);
        score += (3 - centerDist) * 2.2;
        if (p.type !== 'K' && t.square.row < p.square.row) {
          score += 5 * bot.aggression;
        }

        score += (Math.random() - 0.5) * (1 - bot.tradeAwareness) * 14;

        if (score > 6) {
          const pieceId = p.id;
          const dest = { ...t.square };
          candidates.push({
            score,
            execute: () => engine.commandMove('black', pieceId, dest) === 'moved',
          });
        }
      }
    }

    const dropSquares = getLegalDropSquares('black', pieces, zones, black.breachUnlocked);
    const elixirPressure = black.elixir >= 8.5 ? 24 : black.elixir >= 6.5 ? 10 : 0;

    black.hand.forEach((cardId, slotIdx) => {
      const def = CARD_DEFS[cardId];
      if (black.elixir < def.cost) return;

      if (def.kind === 'unit' && def.pieceType && dropSquares.length > 0) {
        const unitWeight = bot.unitWeights[cardId] || 1;
        const sample = this.pickTopDropSquares(
          def.pieceType,
          dropSquares,
          pieces,
          zones,
          whiteKing.square,
          blackKing.square,
          engine.phase === 'overtime' || engine.phase === 'sudden_death'
        );

        for (const { sq, baseScore } of sample) {
          const score = (baseScore + elixirPressure) * unitWeight + (Math.random() - 0.5) * 8;
          candidates.push({
            score,
            execute: () => engine.playUnitCard('black', slotIdx, sq),
          });
        }
      }

      if (cardId === 'freeze') {
        const bestFreeze = this.findBestFreeze(pieces, whiteKing.square, blackKing.square);
        if (bestFreeze) {
          const score = bestFreeze.value * bot.spellBias.freeze;
          if (score > 20) {
            candidates.push({
              score,
              execute: () => engine.playFreezeCard('black', slotIdx, bestFreeze.col, bestFreeze.row),
            });
          }
        }
      }

      if (cardId === 'promote') {
        const promoteTarget = this.findBestPromote(pieces, engine.elapsed);
        if (promoteTarget) {
          const score = promoteTarget.value * bot.spellBias.promote;
          if (score > 22) {
            candidates.push({
              score,
              execute: () => engine.playPromoteCard('black', slotIdx, promoteTarget.pieceId),
            });
          }
        }
      }

      if (cardId === 'swap') {
        const bestSwap = this.findBestSwap(pieces, zones, blackKing, threatsToBlackKing.length > 0);
        if (bestSwap) {
          const score = bestSwap.value * bot.spellBias.swap;
          if (score > 24) {
            candidates.push({
              score,
              execute: () => engine.playSwapCard('black', slotIdx, bestSwap.aId, bestSwap.bId),
            });
          }
        }
      }
    });

    if (candidates.length === 0) return;

    candidates.sort((a, b) => b.score - a.score);
    const pickIdx =
      candidates.length > 1 && Math.random() > 0.55 + bot.tradeAwareness * 0.42 ? 1 : 0;

    candidates[pickIdx].execute();
  }

  isSquareAttackedBy(sq, attackerSide, pieces, zones, ignorePieceId) {
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.side !== attackerSide || p.id === ignorePieceId) continue;
      if (p.state === 'moving' || p.state === 'swapping') continue;
      const targets = getLegalTargets(p, pieces, zones, false);
      if (targets.some((t) => sqEq(t.square, sq))) return true;
    }
    return false;
  }

  pickTopDropSquares(pieceType, dropSquares, pieces, zones, whiteKingSq, blackKingSq, isOvertime) {
    const scored = [];
    const whitePawnsNearCenter = pieces.filter(
      (p) => p.side === 'white' && p.type === 'P' && p.square.row >= 3
    );

    for (let i = 0; i < dropSquares.length; i++) {
      const sq = dropSquares[i];
      let baseScore = 20;
      baseScore += (7 - sq.row) * 3.5;

      const attacks = getPreviewAttackSquares(pieceType, 'black', sq, pieces, zones);
      if (attacks.some((a) => sqEq(a, whiteKingSq))) {
        baseScore += 22;
      }
      for (let j = 0; j < attacks.length; j++) {
        const occ = getPieceAt(attacks[j], pieces);
        if (occ && occ.side === 'white') {
          baseScore += PIECE_ELIXIR_VALUE[occ.type] * 4.5;
        }
      }

      if (pieceType === 'P' && isOvertime && sq.row <= 5) {
        baseScore += 26;
      }

      if (whitePawnsNearCenter.some((wp) => wp.square.col === sq.col && sq.row === wp.square.row + 1)) {
        baseScore += 18;
      }

      const distToKing = Math.max(Math.abs(sq.col - blackKingSq.col), Math.abs(sq.row - blackKingSq.row));
      if (distToKing === 1 && pieceType === 'P') {
        baseScore += 6;
      }

      if (this.isSquareAttackedBy(sq, 'white', pieces, zones)) {
        baseScore -= PIECE_ELIXIR_VALUE[pieceType] * 7;
      }

      scored.push({ sq, baseScore });
    }

    scored.sort((a, b) => b.baseScore - a.baseScore);
    return scored.slice(0, 3);
  }

  findBestFreeze(pieces, whiteKingSq, blackKingSq) {
    let best = null;
    for (let col = 0; col <= COLS - 2; col++) {
      for (let row = 0; row <= ROWS - 2; row++) {
        let value = 0;
        let hitEnemies = 0;
        for (let i = 0; i < pieces.length; i++) {
          const p = pieces[i];
          if (p.side !== 'white') continue;
          if (p.square.col >= col && p.square.col <= col + 1 && p.square.row >= row && p.square.row <= row + 1) {
            hitEnemies++;
            value += p.type === 'K' ? 24 : PIECE_ELIXIR_VALUE[p.type] * 8;
            const nearBlackKing =
              Math.max(Math.abs(p.square.col - blackKingSq.col), Math.abs(p.square.row - blackKingSq.row)) <= 2;
            if (nearBlackKing) value += 22;
            if (p.square.row >= 4 && p.type === 'P') value += 12;
          }
        }
        if (hitEnemies >= 2) value += 20;
        if (
          whiteKingSq.col >= col &&
          whiteKingSq.col <= col + 1 &&
          whiteKingSq.row >= row &&
          whiteKingSq.row <= row + 1
        ) {
          value += 10;
        }
        if (value > (best ? best.value : 22)) {
          best = { col, row, value };
        }
      }
    }
    return best;
  }

  findBestPromote(pieces, elapsed) {
    let best = null;
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      if (p.side !== 'black' || p.type === 'K') continue;
      if (p.state !== 'idle') continue;
      if (p.gilded && p.hasCrownShield) continue;
      if (p.type === 'Q' && p.hasCrownShield) continue;
      if (p.type === 'P' && !p.hasMoved && elapsed < 7.0) continue;

      let value = 0;
      if (p.type === 'P') {
        // Big preference for Pawns on Rank 5 or closer (row <= 4) which promote straight to Queen!
        value = p.square.row <= 4 ? 58 + (4 - p.square.row) * 5 : 32;
      } else if (p.type === 'R' || p.type === 'B' || p.type === 'N') {
        value = 34 + PIECE_ELIXIR_VALUE[p.type] * 3;
      }
      if (value > (best ? best.value : 0)) {
        best = { pieceId: p.id, value };
      }
    }
    return best;
  }

  findBestSwap(pieces, zones, blackKing, kingInCheck) {
    const friendlies = pieces.filter((p) => p.side === 'black' && p.state === 'idle');
    if (friendlies.length < 2) return null;

    if (kingInCheck && blackKing.state === 'idle') {
      for (let i = 0; i < friendlies.length; i++) {
        const ally = friendlies[i];
        if (ally.id === blackKing.id) continue;
        if (ally.square.row < 5) continue;
        if (!this.isSquareAttackedBy(ally.square, 'white', pieces, zones, blackKing.id)) {
          return { aId: blackKing.id, bId: ally.id, value: 78 };
        }
      }
    }

    const deepPawn = friendlies.find((p) => p.type === 'P' && p.square.row <= 2);
    const backHeavy = friendlies.find((p) => (p.type === 'R' || p.type === 'Q') && p.square.row >= 5);
    if (deepPawn && backHeavy) {
      return { aId: deepPawn.id, bId: backHeavy.id, value: 64 };
    }

    return null;
  }
}
