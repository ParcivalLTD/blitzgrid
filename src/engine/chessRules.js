import { COLS, PIECE_MATERIAL, ROWS } from './constants.js';

export function oppositeSide(side) {
  return side === 'white' ? 'black' : 'white';
}

export function inBounds(col, row) {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

export function sqEq(a, b) {
  return a.col === b.col && a.row === b.row;
}

export function toAlgebraic(sq) {
  const file = String.fromCharCode(97 + sq.col);
  return `${file}${sq.row + 1}`;
}

export function isSquareCoveredByZone(sq, zone) {
  return (
    sq.col >= zone.col &&
    sq.col <= zone.col + 1 &&
    sq.row >= zone.row &&
    sq.row <= zone.row + 1
  );
}

/** True when an opponent's active Freeze Zone covers this square. */
export function isFrozenForSide(sq, side, freezeZones) {
  for (let i = 0; i < freezeZones.length; i++) {
    const z = freezeZones[i];
    if (z.remaining > 0 && z.owner !== side && isSquareCoveredByZone(sq, z)) {
      return true;
    }
  }
  return false;
}

/** Occupant currently holding logical square (ignoring airborne jumping Knights). */
export function getPieceAt(sq, pieces, excludeId) {
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.id === excludeId) continue;
    if (p.state === 'moving' && p.moveIsJump) continue;
    if (p.square.col === sq.col && p.square.row === sq.row) {
      return p;
    }
  }
  return undefined;
}

export function isPieceTargetable(p) {
  if (p.state === 'deploying' && p.stateTimer < 0.2) return false;
  if (p.state === 'moving' && p.moveIsJump) return false;
  if (p.state === 'swapping') return false;
  return true;
}

const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];

const KNIGHT_OFFSETS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

export function getBarricadeAt(sq, barricades = []) {
  for (let i = 0; i < barricades.length; i++) {
    const b = barricades[i];
    if (b.remaining > 0 && b.square.col === sq.col && b.square.row === sq.row) {
      return b;
    }
  }
  return undefined;
}

/** Compute legal move & capture destinations for an on-board piece. */
export function getLegalTargets(piece, pieces, freezeZones, forPremove = false, barricades = []) {
  const results = [];
  const { col, row } = piece.square;
  const dir = piece.side === 'white' ? 1 : -1;

  const isBlockedIce = (sq) => !forPremove && isFrozenForSide(sq, piece.side, freezeZones);
  const wallAt = (sq) => (forPremove ? undefined : getBarricadeAt(sq, barricades));

  if (piece.type === 'P') {
    const fwd1 = { col, row: row + dir };
    if (inBounds(fwd1.col, fwd1.row)) {
      const occ1 = getPieceAt(fwd1, pieces, piece.id);
      const w1 = wallAt(fwd1);
      if (!occ1 && !w1 && !isBlockedIce(fwd1)) {
        results.push({ square: fwd1, isCapture: false, isKingStrike: false });

        const onStartRank = (piece.side === 'white' && row === 1) || (piece.side === 'black' && row === 6);
        if (onStartRank && !piece.hasMoved) {
          const fwd2 = { col, row: row + dir * 2 };
          if (inBounds(fwd2.col, fwd2.row)) {
            const occ2 = getPieceAt(fwd2, pieces, piece.id);
            if (!occ2 && !wallAt(fwd2) && !isBlockedIce(fwd2)) {
              results.push({ square: fwd2, isCapture: false, isKingStrike: false });
            }
          }
        }
      }
    }

    for (const dc of [-1, 1]) {
      const diag = { col: col + dc, row: row + dir };
      if (!inBounds(diag.col, diag.row)) continue;
      if (isBlockedIce(diag)) continue;
      const occ = getPieceAt(diag, pieces, piece.id);
      const w = wallAt(diag);
      if (occ && occ.side !== piece.side && (forPremove || isPieceTargetable(occ))) {
        results.push({
          square: diag,
          isCapture: occ.type !== 'K',
          isKingStrike: occ.type === 'K',
        });
      } else if (w) {
        // Pawns can diagonally smash a Stone Barricade!
        results.push({ square: diag, isCapture: true, isKingStrike: false, isBarricade: true });
      } else if (forPremove && !occ) {
        results.push({ square: diag, isCapture: true, isKingStrike: false });
      }
    }
    return results;
  }

  if (piece.type === 'N') {
    for (const [dc, dr] of KNIGHT_OFFSETS) {
      const target = { col: col + dc, row: row + dr };
      if (!inBounds(target.col, target.row)) continue;
      if (isBlockedIce(target)) continue;
      const occ = getPieceAt(target, pieces, piece.id);
      const w = wallAt(target);
      if (w) {
        results.push({ square: target, isCapture: true, isKingStrike: false, isBarricade: true });
      } else if (!occ) {
        results.push({ square: target, isCapture: false, isKingStrike: false });
      } else if (occ.side !== piece.side && (forPremove || isPieceTargetable(occ))) {
        results.push({
          square: target,
          isCapture: occ.type !== 'K',
          isKingStrike: occ.type === 'K',
        });
      }
    }
    return results;
  }

  if (piece.type === 'K') {
    for (const [dc, dr] of QUEEN_DIRS) {
      const target = { col: col + dc, row: row + dr };
      if (!inBounds(target.col, target.row)) continue;
      if (isBlockedIce(target)) continue;
      const occ = getPieceAt(target, pieces, piece.id);
      const w = wallAt(target);
      if (w) {
        results.push({ square: target, isCapture: true, isKingStrike: false, isBarricade: true });
      } else if (!occ) {
        results.push({ square: target, isCapture: false, isKingStrike: false });
      } else if (occ.side !== piece.side && occ.type !== 'K' && (forPremove || isPieceTargetable(occ))) {
        results.push({
          square: target,
          isCapture: true,
          isKingStrike: false,
        });
      }
    }

    // Real-time Castling (free K+R synergy on back rank!)
    const homeRow = piece.side === 'white' ? 0 : ROWS - 1;
    if (!forPremove && !piece.hasMoved && col === 3 && row === homeRow) {
      const leftRook = getPieceAt({ col: 0, row: homeRow }, pieces, piece.id);
      if (
        leftRook &&
        leftRook.side === piece.side &&
        leftRook.type === 'R' &&
        !leftRook.hasMoved &&
        leftRook.state === 'idle' &&
        leftRook.cooldown <= 0 &&
        !isBlockedIce({ col: 0, row: homeRow }) &&
        !isBlockedIce({ col: 1, row: homeRow }) &&
        !isBlockedIce({ col: 2, row: homeRow }) &&
        !wallAt({ col: 1, row: homeRow }) &&
        !wallAt({ col: 2, row: homeRow }) &&
        !getPieceAt({ col: 1, row: homeRow }, pieces) &&
        !getPieceAt({ col: 2, row: homeRow }, pieces)
      ) {
        results.push({
          square: { col: 1, row: homeRow },
          isCapture: false,
          isKingStrike: false,
          isCastle: 'left',
          castleRookId: leftRook.id,
        });
        results.push({
          square: { col: 0, row: homeRow },
          isCapture: false,
          isKingStrike: false,
          isCastle: 'left',
          castleRookId: leftRook.id,
        });
      }

      const rightRook = getPieceAt({ col: 5, row: homeRow }, pieces, piece.id);
      if (
        rightRook &&
        rightRook.side === piece.side &&
        rightRook.type === 'R' &&
        !rightRook.hasMoved &&
        rightRook.state === 'idle' &&
        rightRook.cooldown <= 0 &&
        !isBlockedIce({ col: 4, row: homeRow }) &&
        !isBlockedIce({ col: 5, row: homeRow }) &&
        !wallAt({ col: 4, row: homeRow }) &&
        !getPieceAt({ col: 4, row: homeRow }, pieces)
      ) {
        results.push({
          square: { col: 5, row: homeRow },
          isCapture: false,
          isKingStrike: false,
          isCastle: 'right',
          castleRookId: rightRook.id,
        });
      }
    }

    return results;
  }

  const dirs = piece.type === 'B' ? BISHOP_DIRS : piece.type === 'R' ? ROOK_DIRS : QUEEN_DIRS;
  for (const [dc, dr] of dirs) {
    let c = col + dc;
    let r = row + dr;
    while (inBounds(c, r)) {
      const target = { col: c, row: r };
      if (isBlockedIce(target)) break;
      const w = wallAt(target);
      if (w) {
        // Sliders stop at the Stone Barricade and can smash it in 1 hit!
        results.push({ square: target, isCapture: true, isKingStrike: false, isBarricade: true });
        break;
      }
      const occ = getPieceAt(target, pieces, piece.id);
      if (!occ) {
        results.push({ square: target, isCapture: false, isKingStrike: false });
      } else {
        if (occ.side !== piece.side && (forPremove || isPieceTargetable(occ))) {
          results.push({
            square: target,
            isCapture: occ.type !== 'K',
            isKingStrike: occ.type === 'K',
          });
        }
        break;
      }
      c += dc;
      r += dr;
    }
  }

  return results;
}

/** Attack rays for card-hover preview (helps place Bishops/Rooks/Knights cleanly). */
export function getPreviewAttackSquares(pieceType, side, origin, pieces, freezeZones) {
  const squares = [];
  const { col, row } = origin;
  const dir = side === 'white' ? 1 : -1;

  if (pieceType === 'P') {
    for (const dc of [-1, 1]) {
      if (inBounds(col + dc, row + dir)) squares.push({ col: col + dc, row: row + dir });
    }
    return squares;
  }

  if (pieceType === 'N') {
    for (const [dc, dr] of KNIGHT_OFFSETS) {
      if (inBounds(col + dc, row + dr)) squares.push({ col: col + dc, row: row + dr });
    }
    return squares;
  }

  const dirs = pieceType === 'B' ? BISHOP_DIRS : pieceType === 'R' ? ROOK_DIRS : QUEEN_DIRS;
  for (const [dc, dr] of dirs) {
    let c = col + dc;
    let r = row + dr;
    while (inBounds(c, r)) {
      const sq = { col: c, row: r };
      if (isFrozenForSide(sq, side, freezeZones)) break;
      squares.push(sq);
      if (getPieceAt(sq, pieces)) break;
      c += dc;
      r += dr;
    }
  }
  return squares;
}

export function doesPieceAttackSquare(attacker, targetSquare, pieces, freezeZones, barricades = []) {
  if (attacker.state === 'deploying' || attacker.state === 'moving' || attacker.state === 'swapping') {
    return false;
  }
  const targets = getLegalTargets(attacker, pieces, freezeZones, false, barricades);
  return targets.some((t) => sqEq(t.square, targetSquare));
}

export function findAllChecks(pieces, freezeZones, barricades = []) {
  const checks = [];
  const whiteKing = pieces.find((p) => p.side === 'white' && p.type === 'K');
  const blackKing = pieces.find((p) => p.side === 'black' && p.type === 'K');

  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.type === 'K') continue;
    if (p.state === 'deploying' || p.state === 'moving' || p.state === 'swapping') continue;
    const enemyKing = p.side === 'white' ? blackKing : whiteKing;
    if (!enemyKing) continue;
    if (doesPieceAttackSquare(p, enemyKing.square, pieces, freezeZones, barricades)) {
      checks.push({
        pieceId: p.id,
        attackerSq: p.square,
        kingSide: enemyKing.side,
        kingSq: enemyKing.square,
      });
    }
  }
  return checks;
}

export function getLegalDropSquares(side, pieces, freezeZones, breachUnlocked, barricades = []) {
  const minRow = side === 'white' ? 0 : breachUnlocked ? 4 : 5;
  const maxRow = side === 'white' ? (breachUnlocked ? 3 : 2) : 7;

  const valid = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = 0; col < COLS; col++) {
      const sq = { col, row };
      if (getPieceAt(sq, pieces)) continue;
      if (getBarricadeAt(sq, barricades)) continue;
      if (isFrozenForSide(sq, side, freezeZones)) continue;
      valid.push(sq);
    }
  }
  return valid;
}

/** Resolve the 2 adjacent drop squares for a Pawn Pair card given hovered anchor square. */
export function getPawnPairSquares(anchorSq, legalDrops) {
  if (!legalDrops.some((sq) => sqEq(sq, anchorSq))) return [];
  const right = { col: anchorSq.col + 1, row: anchorSq.row };
  if (legalDrops.some((sq) => sqEq(sq, right))) return [anchorSq, right];
  const left = { col: anchorSq.col - 1, row: anchorSq.row };
  if (legalDrops.some((sq) => sqEq(sq, left))) return [left, anchorSq];
  return [anchorSq];
}

export function getRayPath(from, to) {
  const dc = Math.sign(to.col - from.col);
  const dr = Math.sign(to.row - from.row);
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  const path = [];
  for (let i = 1; i <= steps; i++) {
    path.push({ col: from.col + dc * i, row: from.row + dr * i });
  }
  return path;
}

export function computeEvalNormalized(whiteHp, blackHp, whiteElixir, blackElixir, pieces) {
  let matDelta = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const val = PIECE_MATERIAL[p.type] + (p.gilded ? 1.5 : 0);
    matDelta += p.side === 'white' ? val : -val;
  }
  const hpDelta = (whiteHp - blackHp) * 1.4;
  const elixirDelta = (whiteElixir - blackElixir) * 0.25;
  const raw = hpDelta + matDelta * 0.75 + elixirDelta;
  return Math.tanh(raw / 14);
}
