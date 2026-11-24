import { GameEngine, validateDeck } from './engine/GameEngine.js';
import { BotAI } from './engine/BotAI.js';
import { getBotById } from './engine/constants.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { VfxCanvas } from './ui/VfxCanvas.js';
import { BoardRenderer } from './ui/BoardRenderer.js';
import { HudController } from './ui/HudController.js';
import { MultiplayerClient } from './net/MultiplayerClient.js';
import { applyMatchOutcome, loadProfile, saveProfile } from './state/persistence.js';

let profile = loadProfile();
document.documentElement.setAttribute('data-board-theme', profile.theme);

const engine = new GameEngine(profile.selectedBot, profile.elo, profile.customDeck);
const botAI = new BotAI();
const sound = new SoundEngine(profile.muted);

const boardSvg = document.getElementById('board-svg');
const vfxCanvasEl = document.getElementById('vfx-canvas');
const boardFrameEl = document.getElementById('board-frame');

const vfx = new VfxCanvas(vfxCanvasEl, boardFrameEl);

let hud = null;
let matchRecorded = false;
let lastCardChimeAt = 0;
let netSyncAccum = 0;
let lastGuestDeck = null;

function setPerspective(side) {
  board.setPerspective(side);
  vfx.setPerspective(side);
}

const mp = new MultiplayerClient({
  onStatusChange: () => {
    if (hud) {
      hud.renderMultiplayerPanel();
      hud.syncPrimaryButton();
      if (engine.phase === 'ended') hud.renderReviewModal(engine);
    }
  },
  onMatchReady: ({ side, mode, guestDeck }) => {
    sound.unlock();
    matchRecorded = false;
    lastGuestDeck = guestDeck || null;
    setPerspective(side);
    board.clearSelection();
    if (hud) hud.exitReplay();

    if (side === 'white') {
      // Host runs authoritative simulation & immediately broadcasts initial state
      engine.setCustomDeck(profile.customDeck);
      engine.startMatch({
        mode,
        isMultiplayer: true,
        isRemoteGuest: false,
        blackDeck: guestDeck || undefined,
      });
      mp.sendState(engine.exportNetState());
    } else {
      // Guest flips to Black and awaits Host snapshots
      engine.startMatch({
        mode,
        isMultiplayer: true,
        isRemoteGuest: true,
      });
    }
    if (hud) {
      hud.syncRailView();
      hud.update();
    }
  },
  onRematchStart: () => {
    matchRecorded = false;
    board.clearSelection();
    if (hud) hud.exitReplay();
    if (mp.side === 'white') {
      engine.startMatch({
        mode: mp.mode,
        isMultiplayer: true,
        isRemoteGuest: false,
        blackDeck: lastGuestDeck || undefined,
      });
      mp.sendState(engine.exportNetState());
    } else {
      engine.startMatch({
        mode: mp.mode,
        isMultiplayer: true,
        isRemoteGuest: true,
      });
    }
    if (hud) hud.update();
  },
  onState: (netState) => {
    if (mp.side !== 'black') return;
    const prevPhase = engine.phase;
    engine.applyNetState(netState);
    if (prevPhase !== 'ended' && engine.phase === 'ended' && !matchRecorded && engine.result) {
      recordMatchOutcome();
    }
  },
  onRemoteEvent: (ev) => {
    if (mp.side !== 'black') return;
    sound.handleEvent(ev);
    vfx.handleEvent(ev);
  },
  onRemoteCmd: (cmd) => {
    // Host executes Guest (black) commands authoritatively
    if (mp.side !== 'white' || !engine.isMultiplayer) return;
    executeEngineCommand('black', cmd);
    mp.sendState(engine.exportNetState());
  },
  onOpponentLeft: () => {
    if (engine.isMultiplayer) {
      engine.resetToIdle();
      setPerspective('white');
      board.clearSelection();
      if (hud) {
        hud.setTab('multiplayer');
        hud.renderMultiplayerPanel();
        hud.update();
      }
    }
  },
});

function executeEngineCommand(side, cmd) {
  switch (cmd.kind) {
    case 'MOVE':
      return engine.commandMove(side, cmd.pieceId, cmd.targetSquare);
    case 'CLEAR_PREMOVE':
      engine.clearPremove(side, cmd.pieceId);
      return true;
    case 'CLEAR_ALL_PREMOVES':
      engine.clearAllPremoves(side);
      return true;
    case 'UNIT':
      return engine.playUnitCard(side, cmd.slotIndex, cmd.targetSquare);
    case 'FREEZE':
      return engine.playFreezeCard(side, cmd.slotIndex, cmd.col, cmd.row);
    case 'SWAP':
      return engine.playSwapCard(side, cmd.slotIndex, cmd.pieceAId, cmd.pieceBId);
    case 'PROMOTE':
      return engine.playPromoteCard(side, cmd.slotIndex, cmd.pieceId);
    case 'RESIGN':
      engine.resign(side);
      return true;
    default:
      return false;
  }
}

const board = new BoardRenderer(boardSvg, engine, {
  onSelectionChange: () => {
    if (hud) hud.renderHand(engine);
  },
  onTileSnap: () => {
    sound.haptic(6);
  },
  onCommand: (cmd) => {
    if (engine.isMultiplayer && mp.side === 'black') {
      mp.sendCmd(cmd);
      return true;
    }
    const res = executeEngineCommand(board.perspective, cmd);
    if (engine.isMultiplayer && mp.side === 'white' && res && res !== 'invalid') {
      mp.sendState(engine.exportNetState());
    }
    return res;
  },
});

function recordMatchOutcome() {
  if (matchRecorded || !engine.result) return;
  matchRecorded = true;
  const oppName = engine.isMultiplayer
    ? mp.opponent?.name || '1v1 Opponent'
    : getBotById(engine.botId).name;
  profile = applyMatchOutcome(profile, {
    opponentName: oppName,
    botId: engine.isMultiplayer ? null : engine.botId,
    mySide: board.perspective,
    result: engine.result,
  });
  engine.setPlayerElo(profile.elo);
  if (hud) hud.setProfile(profile);
}

engine.onEvent((ev) => {
  sound.handleEvent(ev);
  vfx.handleEvent(ev);

  if (ev.type === 'RUNE_CLAIM' && ev.side === board.perspective && hud) {
    hud.pulseElixirBar();
  }

  if (engine.isMultiplayer && mp.side === 'white') {
    mp.sendEvent(ev);
  }

  if (ev.type === 'GAME_OVER' && !matchRecorded && engine.result) {
    recordMatchOutcome();
    if (engine.isMultiplayer && mp.side === 'white') {
      mp.sendState(engine.exportNetState());
    }
  }
});

function startSoloMatch(mode = 'blitz', puzzleId = null) {
  sound.unlock();
  if (mp.status !== 'disconnected') mp.leaveRoom();
  matchRecorded = false;
  setPerspective('white');
  board.clearSelection();
  botAI.reset();
  engine.setCustomDeck(profile.customDeck);
  engine.startMatch({
    botId: profile.selectedBot,
    mode,
    puzzleId,
    isMultiplayer: false,
    isRemoteGuest: false,
  });
  if (hud) hud.update();
}

hud = new HudController(engine, board, mp, profile, {
  onStartSolo: startSoloMatch,
  onResign: () => {
    if (engine.isMultiplayer && mp.side === 'black') {
      mp.sendCmd({ kind: 'RESIGN' });
    } else {
      engine.resign(board.perspective);
      if (engine.isMultiplayer && mp.side === 'white') {
        mp.sendState(engine.exportNetState());
      }
    }
  },
  onTogglePause: () => {
    engine.togglePause();
    hud.update();
  },
  onSelectBot: (botId) => {
    profile = { ...profile, selectedBot: botId };
    saveProfile(profile);
    engine.setBot(botId);
    board.clearSelection();
    hud.setProfile(profile);
    hud.update();
  },
  onModeChange: (mode) => {
    profile = { ...profile, selectedMode: mode };
    saveProfile(profile);
  },
  onReturnToMenu: () => {
    engine.resetToIdle();
    setPerspective('white');
    board.clearSelection();
    hud.exitReplay();
    hud.setTab('play');
    hud.update();
  },
  onCreateRoom: (mode) => {
    sound.unlock();
    mp.createRoom({ mode, elo: profile.elo, name: 'Host' });
  },
  onJoinRoom: (code) => {
    sound.unlock();
    mp.joinRoom({ code, elo: profile.elo, name: 'Guest', deck: profile.customDeck });
  },
  onLeaveMultiplayer: () => {
    mp.leaveRoom();
    engine.resetToIdle();
    setPerspective('white');
    board.clearSelection();
    hud.exitReplay();
    hud.setTab('multiplayer');
    hud.renderMultiplayerPanel();
    hud.update();
  },
  onDeckDraftChange: (draftDeck) => {
    profile = { ...profile, customDeck: draftDeck };
    if (draftDeck.length === 8) {
      const clean = validateDeck(draftDeck);
      profile = { ...profile, customDeck: clean };
      saveProfile(profile);
      engine.setCustomDeck(clean);
    }
    hud.setProfile(profile);
  },
  onThemeChange: (theme) => {
    profile = { ...profile, theme };
    saveProfile(profile);
    document.documentElement.setAttribute('data-board-theme', theme);
    hud.setProfile(profile);
  },
  onToggleMute: () => {
    profile = { ...profile, muted: !profile.muted };
    saveProfile(profile);
    sound.setMuted(profile.muted);
    hud.setProfile(profile);
  },
  onCardReadyChime: () => {
    const now = performance.now();
    if (now - lastCardChimeAt > 1200) {
      lastCardChimeAt = now;
      sound.playCardReady();
    }
  },
});

// Auto-join room from shareable invite link (?room=XXXX)
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) {
  hud.setTab('multiplayer');
  mp.joinRoom({ code: urlRoom, elo: profile.elo, name: 'Guest', deck: profile.customDeck });
}

// Keyboard shortcuts: 1-4 select cards, Esc cancels, P pauses, R rematches, M mutes
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();

  if (key === 'escape') {
    board.clearSelection();
    hud.setRulesOpen(false);
    hud.setDrawerOpen(false);
    return;
  }
  if (key === 'm') {
    profile = { ...profile, muted: !profile.muted };
    saveProfile(profile);
    sound.setMuted(profile.muted);
    hud.setProfile(profile);
    return;
  }
  if (key === 'p' && !engine.isMultiplayer) {
    engine.togglePause();
    hud.update();
    return;
  }
  if (key === 'r' && !engine.isMultiplayer && (engine.phase === 'ended' || engine.phase === 'idle')) {
    hud.exitReplay();
    startSoloMatch(hud.selectedMode, hud.selectedPuzzleId);
    return;
  }
  if (key >= '1' && key <= '4') {
    board.selectCardSlot(Number(key) - 1);
  }
});

window.addEventListener('resize', () => vfx.resize());
window.addEventListener('pointerdown', () => sound.unlock(), { once: true });

// 60 FPS Main Loop
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (hud.replayActive) {
    hud.tickReplay(dt);
  } else if (engine.isRemoteGuest) {
    engine.tickGuestInterpolation(dt);
  } else {
    engine.tick(dt);
    botAI.tick(engine, dt);

    if (engine.isMultiplayer && mp.side === 'white' && engine.phase !== 'idle') {
      netSyncAccum += dt;
      if (netSyncAccum >= 0.05) {
        netSyncAccum = 0;
        mp.sendState(engine.exportNetState());
      }
    }
  }

  board.render();
  const isOT = engine.phase === 'overtime' || engine.phase === 'sudden_death';
  vfx.tick(dt, isOT && !engine.paused && !hud.replayActive);
  hud.update();

  requestAnimationFrame(frame);
}

hud.update();
board.render();
requestAnimationFrame(frame);

window.__BLITZ_GRID__ = { engine, board, botAI, mp, hud };
