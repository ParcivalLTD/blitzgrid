import { CARD_DEFS, COLS, KING_MAX_HP, LAND_BOUNCE_SEC, READY_FLASH_SEC, ROWS } from '../engine/constants.js';
import {
  findAllChecks,
  getBarricadeAt,
  getLegalDropSquares,
  getLegalTargets,
  getPawnPairSquares,
  getPieceAt,
  getPreviewAttackSquares,
  inBounds,
  isFrozenForSide,
  sqEq,
} from '../engine/chessRules.js';
import { clampFreezeOrigin, getPromoteOutcome } from '../engine/GameEngine.js';
import { renderPieceInner } from '../art/pieces.js';
import { renderBadgeSvg } from '../art/badges.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TILE = 100;

function el(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v));
  }
  return node;
}

export class BoardRenderer {
  constructor(svgEl, engine, callbacks = {}) {
    this.svg = svgEl;
    this.engine = engine;
    this.perspective = 'white';
    this.onSelectionChange = callbacks.onSelectionChange || (() => {});
    this.onCommand = callbacks.onCommand || null;
    this.onTileSnap = callbacks.onTileSnap || null;
    this.onFirstInteraction = callbacks.onFirstInteraction || null;
    this.readOnly = false;
    this.showFirstMoveHint = false;

    this.selectedPieceId = null;
    this.selectedCardSlot = null;
    this.swapFirstPieceId = null;

    this.dragMode = null; // 'piece' | 'card' | 'swap' | null
    this.dragMoved = false;
    this.dragStartClient = { x: 0, y: 0 };
    this.pointerSvg = { x: 0, y: 0 };
    this.hoverSquare = null;
    this.lastSnapKey = null;
    this.snapPopUntil = 0;

    // Chess.com right-click planning arrows + optimistic Guest premoves + touch UX state
    this.userArrows = []; // { from: Square, to: Square }
    this.rightDragStart = null;
    this.optimisticPremoves = new Map(); // pieceId -> Square
    this.isTouchPointer = false;
    this.peekEnemyPieceId = null; // Tap-to-peek enemy threats on touch devices
    this.wasAlreadySelected = false;

    this.layers = {};
    this.pieceNodes = new Map();
    this.replayOverride = null;

    this.buildStaticBoard();
    this.bindPointerEvents();
  }

  setPerspective(side) {
    const next = side === 'black' ? 'black' : 'white';
    if (this.perspective === next) return;
    this.perspective = next;
    this.clearSelection();
    this.userArrows = [];
    this.optimisticPremoves.clear();
    this.pieceNodes.clear();
    this.buildStaticBoard();
  }

  setReplayFrame(frame) {
    this.replayOverride = frame;
    if (frame) {
      this.clearSelection();
      this.userArrows = [];
    }
  }

  sqToSvg(col, row) {
    if (this.perspective === 'black') {
      return { x: (COLS - 1 - col) * TILE, y: row * TILE };
    }
    return { x: col * TILE, y: (ROWS - 1 - row) * TILE };
  }

  clientToBoard(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const svgX = ((clientX - rect.left) / rect.width) * (COLS * TILE);
    const svgY = ((clientY - rect.top) / rect.height) * (ROWS * TILE);
    const visualCol = Math.floor(svgX / TILE);
    const visualRow = Math.floor(svgY / TILE);
    const col = this.perspective === 'black' ? COLS - 1 - visualCol : visualCol;
    const row = this.perspective === 'black' ? visualRow : ROWS - 1 - visualRow;
    return {
      svgX,
      svgY,
      col,
      row,
      inBoard: inBounds(col, row),
    };
  }

  pointerToFreezeOrigin() {
    const visualX = this.pointerSvg.x / TILE;
    const visualY = this.pointerSvg.y / TILE;
    const col = this.perspective === 'black' ? Math.round(COLS - visualX - 1) : Math.round(visualX - 1);
    const row = this.perspective === 'black' ? Math.round(visualY - 1) : Math.round(ROWS - visualY - 1);
    return clampFreezeOrigin(col, row);
  }

  dispatchCommand(cmd) {
    // Record optimistic Guest premove arrow instantly at 0ms latency!
    if (this.engine.isRemoteGuest) {
      if (cmd.kind === 'MOVE') {
        const piece = this.engine.pieces.find((p) => p.id === cmd.pieceId);
        if (piece && !this.engine.isPieceReady(piece)) {
          this.optimisticPremoves.set(piece.id, { ...cmd.targetSquare });
        }
      } else if (cmd.kind === 'CLEAR_PREMOVE') {
        this.optimisticPremoves.delete(cmd.pieceId);
      } else if (cmd.kind === 'CLEAR_ALL_PREMOVES') {
        this.optimisticPremoves.clear();
      }
    }

    if (this.onCommand) return this.onCommand(cmd);
    const side = this.perspective;
    switch (cmd.kind) {
      case 'MOVE':
        return this.engine.commandMove(side, cmd.pieceId, cmd.targetSquare);
      case 'CLEAR_PREMOVE':
        this.engine.clearPremove(side, cmd.pieceId);
        return true;
      case 'CLEAR_ALL_PREMOVES':
        this.engine.clearAllPremoves(side);
        return true;
      case 'UNIT':
        return this.engine.playUnitCard(side, cmd.slotIndex, cmd.targetSquare);
      case 'FREEZE':
        return this.engine.playFreezeCard(side, cmd.slotIndex, cmd.col, cmd.row);
      case 'SWAP':
        return this.engine.playSwapCard(side, cmd.slotIndex, cmd.pieceAId, cmd.pieceBId);
      case 'PROMOTE':
        return this.engine.playPromoteCard(side, cmd.slotIndex, cmd.pieceId);
      case 'HASTE':
        return this.engine.playHasteCard(side, cmd.slotIndex, cmd.pieceId);
      case 'WALL':
        return this.engine.playWallCard(side, cmd.slotIndex, cmd.targetSquare);
      default:
        return false;
    }
  }

  buildStaticBoard() {
    this.svg.innerHTML = '';
    this.svg.setAttribute('viewBox', `0 0 ${COLS * TILE} ${ROWS * TILE}`);

    // Paper grain, frost hatch, check halo, arrows & subtle 2-frame living Ink Boil filters
    const defs = el('defs');
    defs.innerHTML = `
      <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" stitchTiles="stitch" result="noise"/>
        <feColorMatrix type="saturate" values="0" in="noise" result="gray"/>
        <feComponentTransfer in="gray">
          <feFuncA type="linear" slope="0.065"/>
        </feComponentTransfer>
      </filter>
      <filter id="ink-boil-a" x="-6%" y="-6%" width="112%" height="112%">
        <feTurbulence type="turbulence" baseFrequency="0.032" numOctaves="1" seed="2" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.35" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="ink-boil-b" x="-6%" y="-6%" width="112%" height="112%">
        <feTurbulence type="turbulence" baseFrequency="0.032" numOctaves="1" seed="9" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.35" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <pattern id="frost-hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <line x1="0" y1="0" x2="0" y2="16" stroke="#c8f0ff" stroke-width="2.2" stroke-opacity="0.45"/>
        <line x1="8" y1="0" x2="8" y2="16" stroke="#4296c2" stroke-width="1.3" stroke-opacity="0.35"/>
      </pattern>
      <radialGradient id="check-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#e03b35" stop-opacity="0.9"/>
        <stop offset="65%" stop-color="#cc3f3b" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#cc3f3b" stop-opacity="0"/>
      </radialGradient>
      <marker id="check-arrow-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 1 1.5 L 8.5 5 L 1 8.5 Z" fill="#cc3f3b"/>
      </marker>
      <marker id="premove-arrow-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 1 1.5 L 8.5 5 L 1 8.5 Z" fill="#e05a5a"/>
      </marker>
      <marker id="plan-arrow-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto-start-reverse">
        <path d="M 1 1.5 L 8.5 5 L 1 8.5 Z" fill="#e69528"/>
      </marker>
      <marker id="hint-arrow-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto-start-reverse">
        <path d="M 1 1.5 L 8.5 5 L 1 8.5 Z" fill="#f7f4eb"/>
      </marker>
    `;
    this.svg.appendChild(defs);

    const squaresG = el('g', { id: 'layer-squares' });
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const isDark = (col + row) % 2 === 0;
        const { x, y } = this.sqToSvg(col, row);
        squaresG.appendChild(
          el('rect', {
            x,
            y,
            width: TILE,
            height: TILE,
            fill: isDark ? 'var(--sq-dark)' : 'var(--sq-light)',
            stroke: 'rgba(26,24,22,0.08)',
            'stroke-width': 1,
          })
        );
      }
    }
    squaresG.appendChild(
      el('rect', {
        x: 0,
        y: 0,
        width: COLS * TILE,
        height: ROWS * TILE,
        filter: 'url(#paper-grain)',
        'pointer-events': 'none',
      })
    );
    this.svg.appendChild(squaresG);

    const coordsG = el('g', { id: 'layer-coords', 'pointer-events': 'none' });
    const leftCol = this.perspective === 'black' ? COLS - 1 : 0;
    const bottomRow = this.perspective === 'black' ? ROWS - 1 : 0;

    for (let row = 0; row < ROWS; row++) {
      const isDark = (leftCol + row) % 2 === 0;
      const { x, y } = this.sqToSvg(leftCol, row);
      const t = el('text', {
        x: x + 7,
        y: y + 20,
        fill: isDark ? 'var(--sq-light)' : 'var(--sq-dark)',
        'font-size': 16,
        'font-weight': 700,
        'font-family': 'Inter, sans-serif',
        opacity: 0.9,
      });
      t.textContent = String(row + 1);
      coordsG.appendChild(t);
    }

    for (let col = 0; col < COLS; col++) {
      const isDark = (col + bottomRow) % 2 === 0;
      const { x, y } = this.sqToSvg(col, bottomRow);
      const t = el('text', {
        x: x + TILE - 15,
        y: y + TILE - 8,
        fill: isDark ? 'var(--sq-light)' : 'var(--sq-dark)',
        'font-size': 16,
        'font-weight': 700,
        'font-family': 'Inter, sans-serif',
        opacity: 0.9,
      });
      t.textContent = String.fromCharCode(97 + col);
      coordsG.appendChild(t);
    }
    this.svg.appendChild(coordsG);

    const layerNames = [
      'highlights',
      'centerLine',
      'rune',
      'freezes',
      'barricades',
      'threatPeek',
      'targets',
      'arrows',
      'pieces',
      'onboardingHint',
      'dragGhost',
      'badges',
    ];
    for (const name of layerNames) {
      const g = el('g', { id: `layer-${name}`, 'pointer-events': 'none' });
      this.layers[name] = g;
      this.svg.appendChild(g);
    }
  }

  dismissFirstMoveHint() {
    if (!this.showFirstMoveHint) return;
    this.showFirstMoveHint = false;
    if (this.onFirstInteraction) this.onFirstInteraction();
  }

  selectCardSlot(slotIndex, startDragEvent = null) {
    if (this.replayOverride || this.readOnly) return;
    if (this.engine.phase === 'idle' || this.engine.phase === 'ended' || this.engine.phase === 'shattering' || this.engine.paused) {
      return;
    }
    this.dismissFirstMoveHint();
    const myState = this.engine.getSideState(this.perspective);
    const cardId = myState.hand[slotIndex];
    if (!cardId) return;
    const def = CARD_DEFS[cardId];
    if (myState.elixir < def.cost) return;

    if (this.selectedCardSlot === slotIndex && !startDragEvent) {
      this.clearSelection();
      return;
    }

    this.selectedPieceId = null;
    this.swapFirstPieceId = null;
    this.selectedCardSlot = slotIndex;
    this.userArrows = [];

    if (startDragEvent) {
      this.isTouchPointer = startDragEvent.pointerType === 'touch';
      this.dragMode = 'card';
      this.dragMoved = false;
      this.lastSnapKey = null;
      this.dragStartClient = { x: startDragEvent.clientX, y: startDragEvent.clientY };
      const pos = this.clientToBoard(startDragEvent.clientX, startDragEvent.clientY);
      if (pos) {
        this.pointerSvg = { x: pos.svgX, y: pos.svgY };
        this.hoverSquare = pos.inBoard ? { col: pos.col, row: pos.row } : null;
      }
    }
    this.peekEnemyPieceId = null;
    this.onSelectionChange();
  }

  clearSelection() {
    this.selectedPieceId = null;
    this.selectedCardSlot = null;
    this.swapFirstPieceId = null;
    this.dragMode = null;
    this.dragMoved = false;
    this.wasAlreadySelected = false;
    this.onSelectionChange();
  }

  toggleUserArrow(from, to) {
    const idx = this.userArrows.findIndex((a) => sqEq(a.from, from) && sqEq(a.to, to));
    if (idx >= 0) this.userArrows.splice(idx, 1);
    else this.userArrows.push({ from: { ...from }, to: { ...to } });
  }

  bindPointerEvents() {
    this.svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    this.svg.addEventListener('pointerdown', (e) => {
      if (this.replayOverride || this.readOnly) return;
      this.isTouchPointer = e.pointerType === 'touch';
      const pos = this.clientToBoard(e.clientX, e.clientY);
      if (!pos || !pos.inBoard) return;
      const sq = { col: pos.col, row: pos.row };
      this.pointerSvg = { x: pos.svgX, y: pos.svgY };
      this.hoverSquare = sq;

      // Right-click down: prepare either Chess.com planning arrow drag OR cancel/clear premoves!
      if (e.button === 2) {
        this.rightDragStart = sq;
        return;
      }

      if (e.button !== 0) return;

      // Any left-click clears drawn planning arrows (authentic Chess.com feel)
      if (this.userArrows.length > 0) this.userArrows = [];

      if (this.engine.phase === 'idle' || this.engine.phase === 'ended' || this.engine.phase === 'shattering' || this.engine.paused) {
        return;
      }

      const mySide = this.perspective;
      const myState = this.engine.getSideState(mySide);

      // Case 1: Card selected
      if (this.selectedCardSlot !== null) {
        this.peekEnemyPieceId = null;
        const cid = myState.hand[this.selectedCardSlot];
        if (cid === 'swap') {
          const p = getPieceAt(sq, this.engine.pieces);
          if (p && p.side === mySide) {
            if (!this.swapFirstPieceId) {
              this.swapFirstPieceId = p.id;
              this.dragMode = 'swap';
              this.dragMoved = false;
              this.dragStartClient = { x: e.clientX, y: e.clientY };
              this.onSelectionChange();
              return;
            }
            if (this.swapFirstPieceId !== p.id) {
              const ok = this.dispatchCommand({
                kind: 'SWAP',
                slotIndex: this.selectedCardSlot,
                pieceAId: this.swapFirstPieceId,
                pieceBId: p.id,
              });
              if (ok) this.clearSelection();
              return;
            }
          }
        } else {
          const handled = this.handleCardActionAt(sq);
          if (handled) return;
        }
      }

      const clickedPiece = getPieceAt(sq, this.engine.pieces);

      // Case 2: Board piece already selected -> try moving (including Castle onto friendly Rook!)
      if (this.selectedPieceId) {
        if (clickedPiece && clickedPiece.id === this.selectedPieceId) {
          this.wasAlreadySelected = true;
          this.dragMode = 'piece';
          this.dragMoved = false;
          this.dragStartClient = { x: e.clientX, y: e.clientY };
          return;
        }
        const res = this.dispatchCommand({
          kind: 'MOVE',
          pieceId: this.selectedPieceId,
          targetSquare: sq,
        });
        if (res === 'moved' || res === 'premoved' || res === true) {
          this.peekEnemyPieceId = null;
          this.clearSelection();
          return;
        }
      }

      // Case 3: Pick up controllable friendly piece
      if (clickedPiece && this.engine.canControlPiece(clickedPiece, mySide)) {
        this.dismissFirstMoveHint();
        this.peekEnemyPieceId = null;
        this.selectedCardSlot = null;
        this.swapFirstPieceId = null;
        this.selectedPieceId = clickedPiece.id;
        // Single tap (without drag) on a premoved piece cancels its premove!
        this.wasAlreadySelected = Boolean(clickedPiece.premove || this.optimisticPremoves.has(clickedPiece.id));
        this.dragMode = 'piece';
        this.dragMoved = false;
        this.dragStartClient = { x: e.clientX, y: e.clientY };
        this.onSelectionChange();
      } else if (clickedPiece && clickedPiece.side !== mySide) {
        // Touch-friendly Enemy Threat Peek: tap an enemy piece to toggle its attack preview!
        this.clearSelection();
        this.peekEnemyPieceId = this.peekEnemyPieceId === clickedPiece.id ? null : clickedPiece.id;
      } else {
        // Tapping the destination square of a queued premove cancels that premove cleanly on touch!
        const premovedToHere = this.engine.pieces.find(
          (p) =>
            p.side === mySide &&
            ((p.premove && sqEq(p.premove, sq)) ||
              (this.optimisticPremoves.has(p.id) && sqEq(this.optimisticPremoves.get(p.id), sq)))
        );
        if (premovedToHere) {
          this.dispatchCommand({ kind: 'CLEAR_PREMOVE', pieceId: premovedToHere.id });
        }
        this.peekEnemyPieceId = null;
        this.clearSelection();
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') this.isTouchPointer = true;
      else if (e.pointerType === 'mouse') this.isTouchPointer = false;

      if (this.dragMode) {
        const dx = e.clientX - this.dragStartClient.x;
        const dy = e.clientY - this.dragStartClient.y;
        // Forgiving 10px touch drag threshold vs 6px mouse threshold
        const threshSq = this.isTouchPointer ? 100 : 36;
        if (dx * dx + dy * dy > threshSq) {
          this.dragMoved = true;
        }
      }

      // True 1:1 zero-offset pointer tracking!
      const pos = this.clientToBoard(e.clientX, e.clientY);
      if (pos) {
        this.pointerSvg = { x: pos.svgX, y: pos.svgY };
        this.hoverSquare = pos.inBoard ? { col: pos.col, row: pos.row } : null;
        if (this.dragMode && pos.inBoard) {
          const snapKey = `${pos.col},${pos.row}`;
          if (snapKey !== this.lastSnapKey) {
            this.lastSnapKey = snapKey;
            this.snapPopUntil = performance.now() + 115;
            if (this.isTouchPointer && this.onTileSnap) this.onTileSnap();
          }
        }
      } else {
        this.hoverSquare = null;
      }
    });

    window.addEventListener('pointercancel', () => {
      this.dragMode = null;
      this.dragMoved = false;
      this.rightDragStart = null;
      this.wasAlreadySelected = false;
      this.lastSnapKey = null;
    });

    window.addEventListener('pointerup', (e) => {
      const pos = this.clientToBoard(e.clientX, e.clientY);

      // Right-click release -> Draw orange planning arrow OR clear premoves!
      if (e.button === 2 && this.rightDragStart) {
        const start = this.rightDragStart;
        this.rightDragStart = null;
        if (pos && pos.inBoard) {
          const end = { col: pos.col, row: pos.row };
          if (!sqEq(start, end)) {
            this.toggleUserArrow(start, end);
            return;
          }
          const p = getPieceAt(end, this.engine.pieces);
          if (p && p.side === this.perspective && (p.premove || this.optimisticPremoves.has(p.id))) {
            this.dispatchCommand({ kind: 'CLEAR_PREMOVE', pieceId: p.id });
          } else {
            this.dispatchCommand({ kind: 'CLEAR_ALL_PREMOVES' });
            this.userArrows = [];
          }
        }
        this.clearSelection();
        return;
      }

      if (!this.dragMode) return;
      const mode = this.dragMode;
      const moved = this.dragMoved;
      const wasSelected = this.wasAlreadySelected;
      this.dragMode = null;
      this.dragMoved = false;
      this.wasAlreadySelected = false;

      if (mode === 'piece' && this.selectedPieceId) {
        if (moved && pos && pos.inBoard) {
          const sq = { col: pos.col, row: pos.row };
          const res = this.dispatchCommand({
            kind: 'MOVE',
            pieceId: this.selectedPieceId,
            targetSquare: sq,
          });
          if (res === 'moved' || res === 'premoved' || res === true) {
            this.clearSelection();
          }
        } else if (!moved && wasSelected) {
          // Touch-friendly 2nd tap on selected piece cancels its queued premove (or deselects)!
          const p = this.engine.pieces.find((x) => x.id === this.selectedPieceId);
          if (p && (p.premove || this.optimisticPremoves.has(p.id))) {
            this.dispatchCommand({ kind: 'CLEAR_PREMOVE', pieceId: p.id });
          }
          this.clearSelection();
        }
        return;
      }

      if (mode === 'swap' && this.selectedCardSlot !== null && this.swapFirstPieceId) {
        if (moved && pos && pos.inBoard) {
          const target = getPieceAt({ col: pos.col, row: pos.row }, this.engine.pieces);
          if (target && target.side === this.perspective && target.id !== this.swapFirstPieceId) {
            const ok = this.dispatchCommand({
              kind: 'SWAP',
              slotIndex: this.selectedCardSlot,
              pieceAId: this.swapFirstPieceId,
              pieceBId: target.id,
            });
            if (ok) this.clearSelection();
          }
        }
        return;
      }

      if (mode === 'card' && this.selectedCardSlot !== null) {
        if (pos && pos.inBoard) {
          this.pointerSvg = { x: pos.svgX, y: pos.svgY };
          this.handleCardActionAt({ col: pos.col, row: pos.row });
        } else if (moved) {
          this.clearSelection();
        }
      }
    });
  }

  handleCardActionAt(sq) {
    const slot = this.selectedCardSlot;
    if (slot === null) return false;
    const mySide = this.perspective;
    const myState = this.engine.getSideState(mySide);
    const cardId = myState.hand[slot];
    if (!cardId) {
      this.clearSelection();
      return false;
    }
    const def = CARD_DEFS[cardId];

    if (def.kind === 'unit') {
      const ok = this.dispatchCommand({ kind: 'UNIT', slotIndex: slot, targetSquare: sq });
      if (ok) {
        this.clearSelection();
        return true;
      }
      return false;
    }

    if (cardId === 'freeze') {
      const origin = this.pointerToFreezeOrigin();
      const ok = this.dispatchCommand({ kind: 'FREEZE', slotIndex: slot, col: origin.col, row: origin.row });
      if (ok) {
        this.clearSelection();
        return true;
      }
      return false;
    }

    if (cardId === 'promote') {
      const p = getPieceAt(sq, this.engine.pieces);
      if (p && p.side === mySide && p.type !== 'K') {
        const ok = this.dispatchCommand({ kind: 'PROMOTE', slotIndex: slot, pieceId: p.id });
        if (ok) {
          this.clearSelection();
          return true;
        }
      }
      return false;
    }

    if (cardId === 'haste') {
      const p = getPieceAt(sq, this.engine.pieces);
      if (p && p.side === mySide && (p.cooldown > 0 || p.state === 'deploying')) {
        const ok = this.dispatchCommand({ kind: 'HASTE', slotIndex: slot, pieceId: p.id });
        if (ok) {
          this.clearSelection();
          return true;
        }
      }
      return false;
    }

    if (cardId === 'wall') {
      const blocked =
        getPieceAt(sq, this.engine.pieces) ||
        getBarricadeAt(sq, this.engine.barricades) ||
        isFrozenForSide(sq, mySide, this.engine.freezeZones);
      if (!blocked) {
        const ok = this.dispatchCommand({ kind: 'WALL', slotIndex: slot, targetSquare: sq });
        if (ok) {
          this.clearSelection();
          return true;
        }
      }
      return false;
    }

    if (cardId === 'swap') {
      const p = getPieceAt(sq, this.engine.pieces);
      if (p && p.side === mySide) {
        if (!this.swapFirstPieceId) {
          this.swapFirstPieceId = p.id;
          this.onSelectionChange();
          return true;
        }
        if (this.swapFirstPieceId !== p.id) {
          const ok = this.dispatchCommand({
            kind: 'SWAP',
            slotIndex: slot,
            pieceAId: this.swapFirstPieceId,
            pieceBId: p.id,
          });
          if (ok) {
            this.clearSelection();
            return true;
          }
        }
      }
      return false;
    }

    return false;
  }

  // =========================================================================
  // 60 FPS Render Sync
  // =========================================================================

  render() {
    const rf = this.replayOverride;
    const eng = this.engine;
    const mySide = this.perspective;

    const pieces = rf ? rf.pieces : eng.pieces;
    const freezeZones = rf ? rf.freezeZones : eng.freezeZones;
    const barricades = rf ? (rf.barricades || []) : (eng.barricades || []);
    const rune = rf ? rf.elixirRune : eng.elixirRune;
    const phase = rf ? rf.phase : eng.phase;
    const elapsed = rf ? rf.t : eng.elapsed;
    const lastMove = rf ? rf.lastMove : eng.lastMove;
    const whiteHp = rf ? rf.whiteHp : eng.white.kingHp;
    const blackHp = rf ? rf.blackHp : eng.black.kingHp;
    const checks = findAllChecks(pieces, freezeZones, barricades);

    // Subtle 5 Hz two-frame ink boil selector for living hand-drawn highlights
    const boilId = Math.floor(performance.now() / 210) % 2 === 0 ? 'url(#ink-boil-a)' : 'url(#ink-boil-b)';

    if (!rf) {
      // Reconcile optimistic Guest premoves once piece moves or host confirms
      for (const [pid] of this.optimisticPremoves.entries()) {
        const p = pieces.find((x) => x.id === pid);
        if (!p || p.state === 'moving' || p.premove) {
          this.optimisticPremoves.delete(pid);
        }
      }

      if (this.selectedPieceId && !pieces.some((p) => p.id === this.selectedPieceId)) {
        this.selectedPieceId = null;
      }
      if (this.swapFirstPieceId && !pieces.some((p) => p.id === this.swapFirstPieceId)) {
        this.swapFirstPieceId = null;
      }
      if (this.selectedCardSlot !== null) {
        const myState = eng.getSideState(mySide);
        const cid = myState.hand[this.selectedCardSlot];
        if (!cid || myState.elixir < CARD_DEFS[cid].cost) {
          this.selectedCardSlot = null;
          this.swapFirstPieceId = null;
          this.dragMode = null;
          this.onSelectionChange();
        }
      }
    }

    this.renderCenterLine(phase, elapsed, boilId);
    this.renderElixirRune(rune, elapsed, boilId);
    this.renderHighlights(pieces, lastMove, checks, mySide);
    this.renderFreezes(freezeZones, mySide, boilId);
    this.renderBarricades(barricades, boilId);
    this.renderEnemyThreatPeek(pieces, freezeZones, barricades, mySide, Boolean(rf));
    this.renderTargetsAndPreviews(eng, pieces, freezeZones, barricades, mySide, Boolean(rf), boilId);
    this.renderArrows(pieces, checks, mySide, boilId);
    this.renderPieces(pieces, freezeZones, checks, whiteHp, blackHp, phase, eng.defeatedSide);
    this.renderOnboardingHint(pieces, phase, elapsed, Boolean(rf));
    this.renderDragGhost(eng, pieces, freezeZones, barricades, mySide, Boolean(rf));
    this.renderBadges(rf ? [] : eng.floatingBadges, elapsed);
  }

  renderCenterLine(phase, elapsed, boilId) {
    const g = this.layers.centerLine;
    const isOT = phase === 'overtime' || phase === 'sudden_death';
    const y = 4 * TILE;
    const stroke = isOT ? '#dda938' : 'rgba(255,255,255,0.42)';
    const dashOffset = isOT ? -((elapsed * 32) % 24) : 0;

    g.innerHTML = `
      <g ${isOT ? `filter="${boilId}"` : ''}>
        <line x1="0" y1="${y}" x2="${COLS * TILE}" y2="${y}"
          stroke="${stroke}" stroke-width="${isOT ? 4 : 2.2}"
          stroke-dasharray="${isOT ? '14 10' : '10 9'}"
          stroke-dashoffset="${dashOffset}" stroke-linecap="round"/>
        ${
          isOT
            ? `<rect x="0" y="${y - 3}" width="${COLS * TILE}" height="6" fill="#dda938" opacity="0.18"/>`
            : ''
        }
      </g>
    `;
  }

  renderElixirRune(rune, elapsed, boilId) {
    const g = this.layers.rune;
    if (!rune) {
      g.innerHTML = '';
      return;
    }
    const { x, y } = this.sqToSvg(rune.square.col, rune.square.row);
    const cx = x + 50;
    const cy = y + 50;

    // 3-Second Objective Telegraph Race!
    if (rune.status === 'telegraph') {
      const dur = rune.telegraphDuration || 3.0;
      const rem = Math.max(0, rune.remainingTelegraph ?? 0);
      const pct = Math.min(1, 1 - rem / dur);
      const r = 34;
      const circ = 2 * Math.PI * r;
      const offset = circ * (1 - pct);
      const secLabel = String(Math.max(1, Math.ceil(rem)));
      g.innerHTML = `
        <g filter="${boilId}">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="#9b4dca" fill-opacity="0.14" stroke="#b96ee8" stroke-width="2.4" stroke-dasharray="6 5" opacity="0.7"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#d594ff" stroke-width="4"
            stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
            transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
        </g>
        <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="22"
          stroke="#1b1917" stroke-width="3.5" paint-order="stroke" fill="#f0d4ff">${secLabel}</text>
        <text x="${cx}" y="${y + 92}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="11"
          stroke="#1b1917" stroke-width="2.8" paint-order="stroke" fill="#ddb3f8">+2</text>
      `;
      return;
    }

    const pulse = 1 + Math.sin(elapsed * 5.2) * 0.06;
    g.innerHTML = `
      <g filter="${boilId}" transform="translate(${cx}, ${cy}) scale(${pulse.toFixed(3)})">
        <polygon points="0,-34 34,0 0,34 -34,0" fill="#9b4dca" fill-opacity="0.22" stroke="#b96ee8" stroke-width="2.6" stroke-dasharray="7 4"/>
        <path d="M0 -18 C0 -18 -13 -3 -13 6 C-13 13.5 -7.2 19 0 19 C7.2 19 13 13.5 13 6 C13 -3 0 -18 0 -18 Z"
          fill="#9b4dca" stroke="#1d1c1a" stroke-width="2.8" stroke-linejoin="round"/>
        <path d="M-5.5 5.5 C-5.5 9.2 -3.2 11.8 -0.5 12.6" stroke="#f5e6ff" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <text x="${cx}" y="${y + 92}" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="13"
        stroke="#1b1917" stroke-width="3" paint-order="stroke" fill="#e9c8ff">+2</text>
    `;
  }

  renderHighlights(pieces, lastMove, checks, mySide) {
    const parts = [];

    if (lastMove) {
      for (const sq of [lastMove.from, lastMove.to]) {
        const { x, y } = this.sqToSvg(sq.col, sq.row);
        const isDark = (sq.col + sq.row) % 2 === 0;
        parts.push(
          `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" fill="${
            isDark ? 'var(--sq-hi-dark)' : 'var(--sq-hi-light)'
          }" opacity="0.72"/>`
        );
      }
    }

    if (this.selectedPieceId) {
      const p = pieces.find((x) => x.id === this.selectedPieceId);
      if (p) {
        const { x, y } = this.sqToSvg(p.square.col, p.square.row);
        parts.push(
          `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" fill="var(--sq-hi-light)" opacity="0.62"/>`
        );
      }
    }

    for (const p of pieces) {
      const pm = p.side === mySide ? (p.premove || this.optimisticPremoves.get(p.id)) : null;
      if (pm) {
        for (const sq of [p.square, pm]) {
          const { x, y } = this.sqToSvg(sq.col, sq.row);
          const isDark = (sq.col + sq.row) % 2 === 0;
          parts.push(
            `<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" fill="${
              isDark ? 'var(--sq-premove-dark)' : 'var(--sq-premove-light)'
            }" opacity="0.56"/>`
          );
        }
      }
    }

    const checkedKingSides = new Set(checks.map((c) => c.kingSide));
    for (const side of checkedKingSides) {
      const king = pieces.find((p) => p.side === side && p.type === 'K');
      if (king) {
        const { x, y } = this.sqToSvg(king.square.col, king.square.row);
        parts.push(`<rect x="${x}" y="${y}" width="${TILE}" height="${TILE}" fill="url(#check-halo)"/>`);
      }
    }

    this.layers.highlights.innerHTML = parts.join('');
  }

  renderFreezes(freezeZones, mySide, boilId) {
    const parts = [];
    for (const z of freezeZones) {
      const topLeftCol = this.perspective === 'black' ? COLS - 2 - z.col : z.col;
      const topLeftRow = this.perspective === 'black' ? z.row : ROWS - 2 - z.row;
      const x = topLeftCol * TILE;
      const y = topLeftRow * TILE;
      const w = 2 * TILE;
      const h = 2 * TILE;
      const pct = Math.max(0, z.remaining / z.duration);
      const isFriendly = z.owner === mySide;
      const tint = isFriendly ? '#5cb8e4' : '#3a8ab5';

      parts.push(`
        <g opacity="${0.35 + pct * 0.65}" filter="${boilId}">
          <rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="6" fill="${tint}" fill-opacity="0.22"/>
          <rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="6" fill="url(#frost-hatch)" stroke="${tint}" stroke-width="3" stroke-dasharray="12 6"/>
          <rect x="${x + 12}" y="${y + h - 10}" width="${(w - 24) * pct}" height="4" rx="2" fill="#d9f4ff"/>
        </g>
      `);
    }
    this.layers.freezes.innerHTML = parts.join('');
  }

  renderBarricades(barricades, boilId) {
    const g = this.layers.barricades;
    if (!barricades || barricades.length === 0) {
      g.innerHTML = '';
      return;
    }
    const parts = [];
    for (const b of barricades) {
      const { x, y } = this.sqToSvg(b.square.col, b.square.row);
      const pct = Math.max(0, Math.min(1, b.remaining / (b.duration || 6)));
      parts.push(`
        <g opacity="${(0.45 + pct * 0.55).toFixed(2)}" filter="${boilId}">
          <rect x="${x + 12}" y="${y + 20}" width="76" height="58" rx="6" fill="#9b9589" stroke="#1b1a18" stroke-width="3.2"/>
          <path d="M${x + 14} ${y + 40} H${x + 86} M${x + 14} ${y + 58} H${x + 86}" stroke="#1b1a18" stroke-width="2.4"/>
          <path d="M${x + 39} ${y + 21} V${y + 40} M${x + 65} ${y + 21} V${y + 40} M${x + 28} ${y + 40} V${y + 58} M${x + 54} ${y + 40} V${y + 58} M${x + 76} ${y + 40} V${y + 58} M${x + 41} ${y + 58} V${y + 77} M${x + 66} ${y + 58} V${y + 77}" stroke="#4e4b45" stroke-width="2.2"/>
          <path d="M${x + 18} ${y + 25} H${x + 34} M${x + 45} ${y + 25} H${x + 60}" stroke="#d9d4c7" stroke-width="2" stroke-linecap="round" opacity="0.65"/>
          <rect x="${x + 16}" y="${y + 84}" width="68" height="5" rx="2.5" fill="#1b1917"/>
          <rect x="${x + 17}" y="${y + 85}" width="${(66 * pct).toFixed(1)}" height="3" rx="1.5" fill="#d4cec2"/>
        </g>
      `);
    }
    g.innerHTML = parts.join('');
  }

  /** Hovering (desktop) OR tapping (touch) an enemy piece subtly outlines its attack squares. */
  renderEnemyThreatPeek(pieces, freezeZones, barricades, mySide, isReplay) {
    const g = this.layers.threatPeek;
    if (isReplay || this.readOnly || this.dragMode || this.selectedCardSlot !== null) {
      g.innerHTML = '';
      return;
    }

    let enemy = null;
    if (this.peekEnemyPieceId) {
      const found = pieces.find((p) => p.id === this.peekEnemyPieceId && p.side !== mySide);
      if (found) enemy = found;
      else this.peekEnemyPieceId = null;
    } else if (!this.isTouchPointer && this.hoverSquare) {
      const hovered = getPieceAt(this.hoverSquare, pieces);
      if (hovered && hovered.side !== mySide) enemy = hovered;
    }

    if (!enemy || enemy.state === 'deploying') {
      g.innerHTML = '';
      return;
    }

    const targets = getLegalTargets(enemy, pieces, freezeZones, false, barricades);
    const parts = [];
    const ePos = this.sqToSvg(enemy.square.col, enemy.square.row);
    if (this.peekEnemyPieceId === enemy.id) {
      parts.push(
        `<rect x="${ePos.x + 3}" y="${ePos.y + 3}" width="${TILE - 6}" height="${TILE - 6}" rx="5" fill="none" stroke="rgba(204,63,59,0.72)" stroke-width="3"/>`
      );
    }
    for (const t of targets) {
      const { x, y } = this.sqToSvg(t.square.col, t.square.row);
      if (t.isCapture || t.isKingStrike) {
        parts.push(
          `<rect x="${x + 5}" y="${y + 5}" width="${TILE - 10}" height="${TILE - 10}" rx="5" fill="rgba(204,63,59,0.16)" stroke="rgba(204,63,59,0.55)" stroke-width="2.5" stroke-dasharray="6 4"/>`
        );
      } else {
        parts.push(
          `<circle cx="${x + 50}" cy="${y + 50}" r="11" fill="rgba(204,63,59,0.34)"/>`
        );
      }
    }
    g.innerHTML = parts.join('');
  }

  renderTargetsAndPreviews(eng, pieces, freezeZones, barricades, mySide, isReplay, boilId) {
    if (isReplay || this.readOnly) {
      this.layers.targets.innerHTML = '';
      return;
    }

    const parts = [];

    if (this.selectedPieceId) {
      const piece = pieces.find((p) => p.id === this.selectedPieceId);
      if (piece) {
        const isPremoveMode = !eng.isPieceReady(piece);
        const originPiece =
          piece.state === 'moving' || piece.state === 'recoiling'
            ? { ...piece, square: { ...piece.targetSquare } }
            : piece;
        const targets = getLegalTargets(originPiece, pieces, freezeZones, isPremoveMode, barricades);
        for (const t of targets) {
          const { x, y } = this.sqToSvg(t.square.col, t.square.row);
          const cx = x + TILE / 2;
          const cy = y + TILE / 2;

          if (t.isCastle) {
            parts.push(`
              <circle cx="${cx}" cy="${cy}" r="38" fill="rgba(221,169,56,0.18)" stroke="#dda938" stroke-width="4.5" stroke-dasharray="8 5"/>
            `);
          } else if (t.isKingStrike) {
            parts.push(`
              <circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="#cc3f3b" stroke-width="7.5" opacity="0.88"/>
              <path d="M${cx - 14} ${cy} H${cx + 14} M${cx} ${cy - 14} V${cy + 14}" stroke="#cc3f3b" stroke-width="3.2" stroke-linecap="round" opacity="0.85"/>
            `);
          } else if (t.isCapture) {
            parts.push(
              `<circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="${
                isPremoveMode ? 'rgba(217,83,79,0.58)' : 'rgba(20,19,17,0.24)'
              }" stroke-width="8.5"/>`
            );
          } else {
            parts.push(
              `<circle cx="${cx}" cy="${cy}" r="15" fill="${
                isPremoveMode ? 'rgba(217,83,79,0.55)' : 'rgba(20,19,17,0.22)'
              }"/>`
            );
          }
        }
      }
    }

    if (this.selectedCardSlot !== null) {
      const myState = eng.getSideState(mySide);
      const cardId = myState.hand[this.selectedCardSlot];
      const def = cardId ? CARD_DEFS[cardId] : null;

      if (def && def.kind === 'unit' && def.pieceType) {
        const drops = getLegalDropSquares(mySide, pieces, freezeZones, myState.breachUnlocked, barricades);
        const hoveredPair =
          def.isPair && this.hoverSquare ? getPawnPairSquares(this.hoverSquare, drops) : [];

        for (const sq of drops) {
          const { x, y } = this.sqToSvg(sq.col, sq.row);
          const isHovered = def.isPair
            ? hoveredPair.some((psq) => sqEq(psq, sq))
            : this.hoverSquare && sqEq(sq, this.hoverSquare);
          parts.push(
            `<rect x="${x + 4}" y="${y + 4}" width="${TILE - 8}" height="${TILE - 8}" rx="4"
              fill="${isHovered ? 'rgba(129,182,76,0.34)' : 'rgba(129,182,76,0.14)'}"
              stroke="${isHovered ? '#81b64c' : 'rgba(129,182,76,0.55)'}"
              stroke-width="${isHovered ? 3.5 : 1.8}" stroke-dasharray="${isHovered ? '' : '6 5'}"/>`
          );
        }

        if (this.hoverSquare && drops.some((sq) => sqEq(sq, this.hoverSquare))) {
          const previewOrigins = def.isPair ? hoveredPair : [this.hoverSquare];
          const seen = new Set();
          for (const originSq of previewOrigins) {
            const rays = getPreviewAttackSquares(def.pieceType, mySide, originSq, pieces, freezeZones);
            for (const rsq of rays) {
              const key = `${rsq.col},${rsq.row}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const { x, y } = this.sqToSvg(rsq.col, rsq.row);
              parts.push(
                `<circle cx="${x + 50}" cy="${y + 50}" r="10" fill="rgba(29,28,26,0.28)" stroke="rgba(244,241,230,0.65)" stroke-width="2"/>`
              );
            }
          }
        }
      }

      if (cardId === 'freeze' && this.hoverSquare) {
        const origin = this.pointerToFreezeOrigin();
        const topLeftCol = this.perspective === 'black' ? COLS - 2 - origin.col : origin.col;
        const topLeftRow = this.perspective === 'black' ? origin.row : ROWS - 2 - origin.row;
        const x = topLeftCol * TILE;
        const y = topLeftRow * TILE;
        const hitCount = pieces.filter(
          (p) =>
            p.side !== mySide &&
            p.square.col >= origin.col &&
            p.square.col <= origin.col + 1 &&
            p.square.row >= origin.row &&
            p.square.row <= origin.row + 1
        ).length;

        parts.push(`
          <rect x="${x + 3}" y="${y + 3}" width="${2 * TILE - 6}" height="${2 * TILE - 6}" rx="6"
            fill="rgba(92,184,228,0.22)" stroke="#5cb8e4" stroke-width="3.5" stroke-dasharray="10 6" filter="${boilId}"/>
          ${
            hitCount > 0
              ? `<rect x="${x + 8}" y="${y + 8}" width="84" height="22" rx="4" fill="#1d2b33" stroke="#5cb8e4" stroke-width="1.5"/>
                 <text x="${x + 50}" y="${y + 23}" text-anchor="middle" fill="#d9f4ff" font-family="Inter, sans-serif" font-weight="800" font-size="11">${hitCount} FROZEN</text>`
              : ''
          }
        `);
      }

      if (cardId === 'haste') {
        for (const p of pieces) {
          if (p.side !== mySide) continue;
          if (!(p.cooldown > 0 || p.state === 'deploying')) continue;
          const { x, y } = this.sqToSvg(p.square.col, p.square.row);
          const hovered = this.hoverSquare && sqEq(p.square, this.hoverSquare);
          const showCue = hovered || this.isTouchPointer;
          parts.push(`
            <rect x="${x + 4}" y="${y + 4}" width="${TILE - 8}" height="${TILE - 8}" rx="6"
              fill="rgba(78,184,122,${hovered ? 0.36 : 0.18})" stroke="#4eb87a" stroke-width="${hovered ? 3.5 : 2.2}"/>
            ${
              showCue
                ? `<rect x="${x + 16}" y="${y - 10}" width="68" height="20" rx="4" fill="#152b20" stroke="#4eb87a" stroke-width="1.5"/>
                   <text x="${x + 50}" y="${y + 4}" text-anchor="middle" fill="#d7ffe8" font-family="Inter, sans-serif" font-weight="800" font-size="11">READY!</text>`
                : ''
            }
          `);
        }
      }

      if (cardId === 'wall' && this.hoverSquare) {
        const hs = this.hoverSquare;
        const blocked =
          getPieceAt(hs, pieces) ||
          getBarricadeAt(hs, barricades) ||
          isFrozenForSide(hs, mySide, freezeZones);
        const { x, y } = this.sqToSvg(hs.col, hs.row);
        if (!blocked) {
          parts.push(`
            <rect x="${x + 8}" y="${y + 16}" width="84" height="66" rx="6"
              fill="rgba(155,149,137,0.42)" stroke="#e6e0d4" stroke-width="3" stroke-dasharray="8 5" filter="${boilId}"/>
            <path d="M${x + 12} ${y + 38} H${x + 88} M${x + 12} ${y + 58} H${x + 88}" stroke="rgba(27,26,24,0.55)" stroke-width="2"/>
          `);
        } else {
          parts.push(`
            <rect x="${x + 5}" y="${y + 5}" width="${TILE - 10}" height="${TILE - 10}" rx="5"
              fill="rgba(204,63,59,0.22)" stroke="#cc3f3b" stroke-width="2.5"/>
          `);
        }
      }

      if (cardId === 'promote') {
        for (const p of pieces) {
          if (p.side !== mySide || p.type === 'K') continue;
          if (p.gilded && p.hasCrownShield) continue;
          if (p.type === 'Q' && p.hasCrownShield) continue;
          const { x, y } = this.sqToSvg(p.square.col, p.square.row);
          const hovered = this.hoverSquare && sqEq(p.square, this.hoverSquare);
          const showCue = hovered || this.isTouchPointer;
          const outcome = getPromoteOutcome(p);
          const cue =
            outcome === 'Q'
              ? '= QUEEN'
              : outcome === 'R'
                ? '= ROOK'
                : outcome === 'SHIELD'
                  ? '+SHIELD'
                  : 'GILD 1.4s';
          parts.push(`
            <rect x="${x + 4}" y="${y + 4}" width="${TILE - 8}" height="${TILE - 8}" rx="6"
              fill="rgba(221,169,56,${hovered ? 0.35 : 0.16})" stroke="#dda938" stroke-width="${hovered ? 3.5 : 2}"/>
            ${
              showCue
                ? `<rect x="${x + 12}" y="${y - 10}" width="76" height="20" rx="4" fill="#292114" stroke="#dda938" stroke-width="1.5"/>
                   <text x="${x + 50}" y="${y + 4}" text-anchor="middle" fill="#f7e3a8" font-family="Inter, sans-serif" font-weight="800" font-size="11">${cue}</text>`
                : ''
            }
          `);
        }
      }

      if (cardId === 'swap') {
        for (const p of pieces) {
          if (p.side !== mySide) continue;
          const { x, y } = this.sqToSvg(p.square.col, p.square.row);
          const isFirst = p.id === this.swapFirstPieceId;
          const hovered = this.hoverSquare && sqEq(p.square, this.hoverSquare);
          parts.push(`
            <rect x="${x + 4}" y="${y + 4}" width="${TILE - 8}" height="${TILE - 8}" rx="6"
              fill="rgba(147,120,230,${isFirst ? 0.42 : hovered ? 0.28 : 0.14})"
              stroke="#9378e6" stroke-width="${isFirst || hovered ? 3.5 : 2}"/>
          `);
        }
        if (this.swapFirstPieceId) {
          const first = pieces.find((p) => p.id === this.swapFirstPieceId);
          if (first) {
            const a = this.sqToSvg(first.square.col, first.square.row);
            parts.push(`
              <line x1="${a.x + 50}" y1="${a.y + 50}" x2="${this.pointerSvg.x}" y2="${this.pointerSvg.y}"
                stroke="#9378e6" stroke-width="3.5" stroke-dasharray="8 6" stroke-linecap="round" filter="${boilId}"/>
            `);
          }
        }
      }
    }

    this.layers.targets.innerHTML = parts.join('');
  }

  renderArrows(pieces, checks, mySide, boilId) {
    const parts = [];

    // Chess.com user-drawn right-click planning arrows (warm matte orange)
    for (const arr of this.userArrows) {
      const f = this.sqToSvg(arr.from.col, arr.from.row);
      const t = this.sqToSvg(arr.to.col, arr.to.row);
      const fx = f.x + 50;
      const fy = f.y + 50;
      const tx = t.x + 50;
      const ty = t.y + 50;
      const dx = tx - fx;
      const dy = ty - fy;
      const len = Math.hypot(dx, dy) || 1;
      const ex = tx - (dx / len) * 18;
      const ey = ty - (dy / len) * 18;
      parts.push(
        `<line x1="${fx}" y1="${fy}" x2="${ex}" y2="${ey}" stroke="#e69528" stroke-width="9" stroke-linecap="round" opacity="0.78" marker-end="url(#plan-arrow-head)"/>`
      );
    }

    // Active right-click planning arrow preview while dragging
    if (this.rightDragStart && this.hoverSquare && !sqEq(this.rightDragStart, this.hoverSquare)) {
      const f = this.sqToSvg(this.rightDragStart.col, this.rightDragStart.row);
      const t = this.sqToSvg(this.hoverSquare.col, this.hoverSquare.row);
      parts.push(
        `<line x1="${f.x + 50}" y1="${f.y + 50}" x2="${t.x + 50}" y2="${t.y + 50}" stroke="#e69528" stroke-width="7.5" stroke-dasharray="10 6" stroke-linecap="round" opacity="0.62" marker-end="url(#plan-arrow-head)"/>`
      );
    }

    // Check sightlines (with subtle living ink boil)
    for (const c of checks) {
      const a = this.sqToSvg(c.attackerSq.col, c.attackerSq.row);
      const k = this.sqToSvg(c.kingSq.col, c.kingSq.row);
      const ax = a.x + 50;
      const ay = a.y + 50;
      const kx = k.x + 50;
      const ky = k.y + 50;
      const dx = kx - ax;
      const dy = ky - ay;
      const len = Math.hypot(dx, dy) || 1;
      const ex = kx - (dx / len) * 28;
      const ey = ky - (dy / len) * 28;

      parts.push(
        `<line x1="${ax}" y1="${ay}" x2="${ex}" y2="${ey}" stroke="#cc3f3b" stroke-width="4" stroke-dasharray="9 6" stroke-linecap="round" opacity="0.72" filter="${boilId}" marker-end="url(#check-arrow-head)"/>`
      );
    }

    // Queued Premove arrows (including instant 0ms optimistic Guest premoves & mid-slide chains)
    for (const p of pieces) {
      const pm = p.side === mySide ? (p.premove || this.optimisticPremoves.get(p.id)) : null;
      if (pm) {
        const origSq = p.state === 'moving' || p.state === 'recoiling' ? p.targetSquare : p.square;
        const f = this.sqToSvg(origSq.col, origSq.row);
        const t = this.sqToSvg(pm.col, pm.row);
        parts.push(
          `<line x1="${f.x + 50}" y1="${f.y + 50}" x2="${t.x + 50}" y2="${t.y + 50}"
            stroke="#e05a5a" stroke-width="4.5" stroke-dasharray="7 6" stroke-linecap="round" opacity="0.88" marker-end="url(#premove-arrow-head)"/>`
        );
      }
    }

    this.layers.arrows.innerHTML = parts.join('');
  }

  renderPieces(pieces, freezeZones, checks, whiteHp, blackHp, phase, defeatedSide) {
    const checkedKingSides = new Set(checks.map((c) => c.kingSide));
    const activeIds = new Set();

    for (const p of pieces) {
      activeIds.add(p.id);
      let node = this.pieceNodes.get(p.id);
      if (!node) {
        node = el('g', { 'data-piece-id': p.id });
        this.layers.pieces.appendChild(node);
        this.pieceNodes.set(p.id, node);
      }

      const isDraggingThis = this.dragMode === 'piece' && this.dragMoved && this.selectedPieceId === p.id;
      const pos = this.sqToSvg(p.renderX, p.renderY);
      let svgX = pos.x;
      let svgY = pos.y;

      let sx = 1;
      let sy = 1;
      let rot = 0;

      if (p.state === 'deploying' && p.stateTimer < 0.22) {
        // Snappy ink-stamp drop-settle on piece deploy!
        const dtFrac = p.stateTimer / 0.22;
        const ease = 1 - Math.pow(1 - dtFrac, 3);
        svgY -= (1 - ease) * 24;
        const squash = Math.sin(dtFrac * Math.PI);
        sx = 1 + squash * 0.12;
        sy = 1 - squash * 0.1;
      } else if (p.state === 'moving' && p.moveIsJump) {
        const arc = Math.sin(p.moveProgress * Math.PI);
        svgY -= arc * 26;
        sx = 1 + arc * 0.14;
        sy = 1 + arc * 0.14;
      } else if (p.landBounce > 0) {
        const b = Math.sin((p.landBounce / LAND_BOUNCE_SEC) * Math.PI);
        sx = 1 + b * 0.13;
        sy = 1 - b * 0.11;
      }

      const isDefeatedKing =
        p.type === 'K' && p.side === defeatedSide && (phase === 'shattering' || phase === 'ended');
      if (isDefeatedKing) {
        rot = 78;
        svgY += 10;
      }

      let opacity = 1;
      if (p.state === 'deploying') {
        opacity = 0.35 + 0.65 * Math.min(1, p.stateTimer / p.stateDuration);
      } else if (isDraggingThis) {
        opacity = 0.32;
      }

      const tx = svgX + 50;
      const ty = svgY + 84;
      node.setAttribute(
        'transform',
        `translate(${tx.toFixed(1)}, ${ty.toFixed(1)}) rotate(${rot}) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) translate(-50, -84)`
      );
      node.setAttribute('opacity', opacity.toFixed(2));

      const hpRatio = p.type === 'K' ? (p.side === 'white' ? whiteHp : blackHp) / KING_MAX_HP : 1;
      const inCheck = p.type === 'K' && checkedKingSides.has(p.side);
      const hurt = p.hurtFlash > 0 || isDefeatedKing;
      const frozen = isFrozenForSide(p.square, p.side, freezeZones);

      const artKey = `${p.type}|${p.side}|${p.gilded}|${p.hasCrownShield}|${
        hpRatio <= 0.3 ? 'c' : hpRatio <= 0.5 ? 'h' : 'f'
      }|${inCheck}|${hurt}`;
      if (node.dataset.artKey !== artKey) {
        node.dataset.artKey = artKey;
        node.innerHTML = `
          <g class="piece-art">${renderPieceInner(p.type, p.side, {
            hpRatio,
            inCheck,
            hurt,
            gilded: p.gilded,
            hasCrownShield: p.hasCrownShield,
          })}</g>
          <g class="piece-ring"></g>
        `;
      }

      const ringG = node.querySelector('.piece-ring');
      ringG.innerHTML = isDefeatedKing ? '' : this.buildPieceRingMarkup(p, frozen, hpRatio, phase);
    }

    for (const [id, node] of this.pieceNodes.entries()) {
      if (!activeIds.has(id)) {
        node.remove();
        this.pieceNodes.delete(id);
      }
    }
  }

  buildPieceRingMarkup(p, frozen, hpRatio, phase) {
    const r = 43;
    const circ = 2 * Math.PI * r;
    const parts = [];

    if (p.type === 'K') {
      const barW = 58;
      const fillW = Math.max(0, barW * hpRatio);
      const color = hpRatio <= 0.3 ? '#cc3f3b' : hpRatio <= 0.5 ? '#dda938' : '#81b64c';
      parts.push(`
        <rect x="${50 - barW / 2}" y="90" width="${barW}" height="6" rx="2.5" fill="#1b1917" stroke="#111" stroke-width="1"/>
        <rect x="${50 - barW / 2 + 1}" y="91" width="${Math.max(0, fillW - 2)}" height="4" rx="1.8" fill="${color}"/>
      `);
    }

    // Overtime Auto-Queen Threat Chevron above Pawns 1 step from crossing the Center Line!
    const isOT = phase === 'overtime' || phase === 'sudden_death';
    const oneStepFromQueen =
      isOT &&
      p.type === 'P' &&
      ((p.side === 'white' && p.square.row === 3) || (p.side === 'black' && p.square.row === 4));
    if (oneStepFromQueen) {
      const bob = Math.sin(performance.now() * 0.008) * 2.5;
      parts.push(`
        <g transform="translate(38, ${(3 + bob).toFixed(1)})">
          <path d="M2 13 L4 5 L8.5 9 L12 2.5 L15.5 9 L20 5 L22 13 Z" fill="#dda938" stroke="#1b1a18" stroke-width="1.8" stroke-linejoin="round"/>
        </g>
      `);
    }

    // Brief warm-gold ready-flash halo the instant stamina finishes refilling!
    if (p.justReadyFlash > 0) {
      const t = 1 - p.justReadyFlash / READY_FLASH_SEC;
      const rad = 40 + t * 11;
      const op = (1 - t) * 0.85;
      parts.push(
        `<circle cx="50" cy="50" r="${rad.toFixed(1)}" fill="none" stroke="${
          p.gilded ? '#dda938' : '#f7f3e7'
        }" stroke-width="${(3.8 * (1 - t * 0.5)).toFixed(1)}" opacity="${op.toFixed(2)}"/>`
      );
    }

    if (p.state === 'deploying') {
      const pct = Math.min(1, p.stateTimer / p.stateDuration);
      const offset = circ * (1 - pct);
      parts.push(`
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(26,24,22,0.32)" stroke-width="4.5" stroke-dasharray="6 5"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="#f4f1e6" stroke-width="4.5"
          stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
          transform="rotate(-90 50 50)" stroke-linecap="round"/>
      `);
    } else if (p.state === 'promoting') {
      const pct = Math.min(1, p.stateTimer / p.stateDuration);
      const offset = circ * (1 - pct);
      parts.push(`
        <circle cx="50" cy="50" r="38" fill="#dda938" fill-opacity="${(0.12 + pct * 0.16).toFixed(2)}"/>
        <path d="M34 ${(66 - pct * 22).toFixed(1)} V${(52 - pct * 22).toFixed(1)} M50 ${(60 - pct * 26).toFixed(1)} V${(44 - pct * 26).toFixed(1)} M66 ${(66 - pct * 22).toFixed(1)} V${(52 - pct * 22).toFixed(1)}"
          stroke="#f6d884" stroke-width="2.4" stroke-linecap="round" opacity="0.75"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(221,169,56,0.35)" stroke-width="5"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="#dda938" stroke-width="5"
          stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
          transform="rotate(-90 50 50)" stroke-linecap="round"/>
      `);
    } else if (p.cooldown > 0 && p.state === 'idle') {
      const pct = 1 - p.cooldown / p.maxCooldown;
      const offset = circ * (1 - pct);
      const stroke = p.gilded ? '#dda938' : p.side === 'white' ? '#f4f1e6' : '#d2cec4';
      parts.push(`
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(20,19,17,0.38)" stroke-width="4.5"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="${stroke}" stroke-width="4.5"
          stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
          transform="rotate(-90 50 50)" stroke-linecap="round"/>
      `);
    }

    if (frozen) {
      parts.push(`
        <circle cx="50" cy="50" r="44" fill="rgba(92,184,228,0.22)" stroke="#7bd2fa" stroke-width="3.2" stroke-dasharray="9 5"/>
      `);
    }

    return parts.join('');
  }

  /** Zero-text first-visit ghost cue: subtle pulsing chalk arrow c2 -> c4 until first touch. */
  renderOnboardingHint(pieces, phase, elapsed, isReplay) {
    const g = this.layers.onboardingHint;
    if (
      !this.showFirstMoveHint ||
      isReplay ||
      this.readOnly ||
      this.perspective !== 'white' ||
      phase !== 'active' ||
      this.selectedPieceId ||
      this.selectedCardSlot !== null
    ) {
      g.innerHTML = '';
      return;
    }

    const c2Pawn = getPieceAt({ col: 2, row: 1 }, pieces);
    const c4Occ = getPieceAt({ col: 2, row: 3 }, pieces);
    if (!c2Pawn || c2Pawn.side !== 'white' || c2Pawn.type !== 'P' || c4Occ) {
      g.innerHTML = '';
      return;
    }

    const from = this.sqToSvg(2, 1);
    const to = this.sqToSvg(2, 3);
    const pulse = 0.52 + Math.sin(elapsed * 4.5) * 0.28;
    const ringR = 36 + Math.sin(elapsed * 4.5) * 5;
    const dashOff = -((elapsed * 42) % 24);

    g.innerHTML = `
      <g opacity="${pulse.toFixed(2)}">
        <circle cx="${from.x + 50}" cy="${from.y + 50}" r="${ringR.toFixed(1)}" fill="none" stroke="#f7f4eb" stroke-width="3.5"/>
        <line x1="${from.x + 50}" y1="${from.y + 18}" x2="${to.x + 50}" y2="${to.y + 56}"
          stroke="#1b1a18" stroke-width="11" stroke-linecap="round" opacity="0.32"/>
        <line x1="${from.x + 50}" y1="${from.y + 18}" x2="${to.x + 50}" y2="${to.y + 56}"
          stroke="#f7f4eb" stroke-width="6.5" stroke-dasharray="14 10" stroke-dashoffset="${dashOff.toFixed(1)}"
          stroke-linecap="round" marker-end="url(#hint-arrow-head)"/>
      </g>
    `;
  }

  renderDragGhost(eng, pieces, freezeZones, barricades, mySide, isReplay) {
    const g = this.layers.dragGhost;
    if (isReplay || this.readOnly || !this.dragMode || !this.dragMoved) {
      g.innerHTML = '';
      return;
    }

    const snapActive = performance.now() < this.snapPopUntil;
    const snapBoost = snapActive ? 1.07 : 1.0;

    if (this.dragMode === 'piece' && this.selectedPieceId) {
      const p = pieces.find((x) => x.id === this.selectedPieceId);
      if (p) {
        let halo = '';
        if (this.hoverSquare) {
          const hs = this.sqToSvg(this.hoverSquare.col, this.hoverSquare.row);
          // High-visibility magnetic square spotlight visible around fingertip with 0px offset!
          halo = `
            <rect x="${hs.x}" y="${hs.y}" width="${TILE}" height="${TILE}" fill="rgba(246,246,105,0.24)"/>
            <rect x="${hs.x + 2.5}" y="${hs.y + 2.5}" width="${TILE - 5}" height="${TILE - 5}" rx="4" fill="none" stroke="rgba(255,255,255,0.92)" stroke-width="5"/>
          `;
        }
        g.innerHTML = `${halo}<g transform="translate(${this.pointerSvg.x.toFixed(1)}, ${this.pointerSvg.y.toFixed(
          1
        )}) scale(${(1.12 * snapBoost).toFixed(3)}) translate(-50, -52)">${renderPieceInner(p.type, p.side, {
          gilded: p.gilded,
          hasCrownShield: p.hasCrownShield,
        })}</g>`;
        return;
      }
    }

    if (this.dragMode === 'card' && this.selectedCardSlot !== null) {
      const myState = eng.getSideState(mySide);
      const cardId = myState.hand[this.selectedCardSlot];
      const def = cardId ? CARD_DEFS[cardId] : null;
      if (def && def.kind === 'unit' && def.pieceType) {
        const drops = getLegalDropSquares(mySide, pieces, freezeZones, myState.breachUnlocked, barricades);
        const snap = this.hoverSquare && drops.some((sq) => sqEq(sq, this.hoverSquare));

        if (def.isPair) {
          if (snap) {
            const pairSqs = getPawnPairSquares(this.hoverSquare, drops);
            g.innerHTML = pairSqs
              .map((psq) => {
                const pos = this.sqToSvg(psq.col, psq.row);
                return `
                  <rect x="${pos.x + 2}" y="${pos.y + 2}" width="${TILE - 4}" height="${TILE - 4}" rx="5" fill="rgba(129,182,76,0.22)" stroke="#81b64c" stroke-width="4.5"/>
                  <g opacity="0.88" transform="translate(${(pos.x + 50).toFixed(1)}, ${(pos.y + 50).toFixed(1)}) scale(${snapBoost.toFixed(3)}) translate(-50, -50)">${renderPieceInner('P', mySide)}</g>
                `;
              })
              .join('');
          } else {
            g.innerHTML = `
              <g opacity="0.86" transform="translate(${(this.pointerSvg.x - 24).toFixed(1)}, ${this.pointerSvg.y.toFixed(1)}) scale(0.92) translate(-50, -50)">${renderPieceInner('P', mySide)}</g>
              <g opacity="0.86" transform="translate(${(this.pointerSvg.x + 24).toFixed(1)}, ${this.pointerSvg.y.toFixed(1)}) scale(0.92) translate(-50, -50)">${renderPieceInner('P', mySide)}</g>
            `;
          }
          return;
        }

        const targetPos = snap ? this.sqToSvg(this.hoverSquare.col, this.hoverSquare.row) : null;
        const cx = targetPos ? targetPos.x + 50 : this.pointerSvg.x;
        const cy = targetPos ? targetPos.y + 50 : this.pointerSvg.y;
        const halo = targetPos
          ? `<rect x="${targetPos.x + 2}" y="${targetPos.y + 2}" width="${TILE - 4}" height="${TILE - 4}" rx="5" fill="rgba(129,182,76,0.22)" stroke="#81b64c" stroke-width="4.5"/>`
          : '';
        g.innerHTML = `${halo}<g opacity="0.86" transform="translate(${cx.toFixed(1)}, ${cy.toFixed(
          1
        )}) scale(${((snap ? 1.0 : 1.06) * snapBoost).toFixed(3)}) translate(-50, -50)">${renderPieceInner(
          def.pieceType,
          mySide
        )}</g>`;
        return;
      }

      if (cardId === 'wall') {
        const hs = this.hoverSquare;
        const valid =
          hs &&
          !getPieceAt(hs, pieces) &&
          !getBarricadeAt(hs, barricades) &&
          !isFrozenForSide(hs, mySide, freezeZones);
        const pos = valid ? this.sqToSvg(hs.col, hs.row) : null;
        const cx = pos ? pos.x + 50 : this.pointerSvg.x;
        const cy = pos ? pos.y + 50 : this.pointerSvg.y;
        g.innerHTML = `
          <g opacity="0.82" transform="translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) scale(${snapBoost.toFixed(3)}) translate(-50, -50)">
            <rect x="14" y="22" width="72" height="56" rx="6" fill="#9b9589" stroke="#1b1a18" stroke-width="3"/>
            <path d="M16 40 H84 M16 58 H84" stroke="#1b1a18" stroke-width="2.2"/>
          </g>
        `;
        return;
      }
    }

    g.innerHTML = '';
  }

  renderBadges(floatingBadges, elapsed) {
    const parts = [];
    for (const b of floatingBadges) {
      const age = elapsed - b.createdAt;
      const t = Math.min(1, age / b.duration);
      const { x, y } = this.sqToSvg(b.col, b.row);
      const opacity = t < 0.72 ? 1 : (1 - t) / 0.28;
      const bx = x + TILE - 28;
      const by = y + 2 - t * 14;

      parts.push(`
        <g transform="translate(${bx.toFixed(1)}, ${by.toFixed(1)})" opacity="${opacity.toFixed(2)}">
          ${renderBadgeSvg(b.badge, 28)}
          ${
            b.label
              ? `<text x="14" y="40" text-anchor="middle" font-family="Inter, sans-serif" font-weight="800" font-size="12"
                  stroke="#181715" stroke-width="3.2" paint-order="stroke" fill="#f7f4eb">${b.label}</text>`
              : ''
          }
        </g>
      `);
    }
    this.layers.badges.innerHTML = parts.join('');
  }
}
