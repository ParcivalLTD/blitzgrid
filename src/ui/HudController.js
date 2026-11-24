import {
  BASE_DECK,
  BOARD_THEMES,
  BOTS,
  CARD_DEFS,
  getBotById,
  KING_MAX_HP,
  MAX_ELIXIR,
  PIECE_MATERIAL,
} from '../engine/constants.js';
import { formatClock } from '../engine/GameEngine.js';
import { PUZZLES, getAllPuzzles, getPuzzleById } from '../engine/puzzles.js';
import { Icons } from '../art/icons.js';
import { renderPieceSvg } from '../art/pieces.js';
import { renderAvatarSvg } from '../art/avatars.js';
import { renderBadgeSvg } from '../art/badges.js';

const ALL_CARD_IDS = ['pawn', 'knight', 'bishop', 'rook', 'freeze', 'swap', 'promote'];

export class HudController {
  constructor(engine, board, mp, profile, handlers) {
    this.engine = engine;
    this.board = board;
    this.mp = mp;
    this.profile = profile;
    this.handlers = handlers;

    this.activeTab = 'play'; // 'play' | 'multiplayer' | 'deck' | 'history'
    this.selectedMode = profile.selectedMode || 'blitz';
    this.selectedPuzzleId = getAllPuzzles()[0].id;
    this.rulesOpen = false;
    this.drawerOpen = false;

    // Post-match replay state
    this.replayActive = false;
    this.replayPlaying = false;
    this.replayIndex = 0;
    this.replaySpeed = 1;
    this.replayAccum = 0;

    // Diff keys for zero DOM thrash
    this.lastBannerId = 0;
    this.lastMoveLogKey = '';
    this.lastHandKey = '';
    this.lastPhase = null;
    this.lastPaused = false;
    this.lastCapturedKey = '';
    this.lastIdentityKey = '';
    this.prevCardAfford = [true, true, true, true];
    this.copiedCodeFlash = false;

    this.cacheElements();
    this.initStaticChrome();
    this.bindEvents();
    this.renderPlayList();
    this.renderMultiplayerPanel();
    this.renderDeckPanel();
    this.renderHistoryPanel();
    this.syncProfileHeader();
    this.syncRailView();
  }

  cacheElements() {
    const q = (id) => document.getElementById(id);
    this.el = {
      evalWhite: q('eval-white'),
      boardFrame: q('board-frame'),
      bannerHost: q('banner-host'),
      botQuip: q('bot-quip'),
      pauseBackdrop: q('pause-backdrop'),
      reviewBackdrop: q('review-backdrop'),

      oppAvatar: q('opp-avatar'),
      oppName: q('opp-name'),
      oppElo: q('opp-elo'),
      oppCaptured: q('opp-captured'),
      oppHpIcon: q('opp-hp-icon'),
      oppHpFill: q('opp-hp-fill'),
      oppHpVal: q('opp-hp-val'),
      clockBox: q('match-clock'),
      clockVal: q('clock-val'),

      youAvatar: q('you-avatar'),
      youName: q('you-name'),
      youElo: q('you-elo'),
      youCaptured: q('you-captured'),
      youHpIcon: q('you-hp-icon'),
      youHpFill: q('you-hp-fill'),
      youHpVal: q('you-hp-val'),

      elixirDropIcon: q('elixir-drop-icon'),
      elixirNum: q('elixir-num'),
      elixirFill: q('elixir-fill'),
      elixirRate: q('elixir-rate'),
      handRow: q('hand-row'),

      rightRail: q('right-rail'),
      drawerBackdrop: q('drawer-backdrop'),
      btnMobilePause: q('btn-mobile-pause'),
      btnDrawer: q('btn-drawer'),
      brandLogo: q('brand-logo'),
      btnHelp: q('btn-help'),
      btnTheme: q('btn-theme'),
      btnMute: q('btn-mute'),
      statElo: q('stat-elo'),
      statStreakIcon: q('stat-streak-icon'),
      statStreak: q('stat-streak'),

      railTabs: q('rail-tabs'),
      modeSegment: q('mode-segment'),
      tabPlay: q('tab-play'),
      tabMp: q('tab-multiplayer'),
      tabDeck: q('tab-deck'),
      tabHistory: q('tab-history'),
      moveLogWrap: q('move-log-wrap'),
      railSectionLabel: q('rail-section-label'),
      botList: q('bot-list'),
      moveLog: q('move-log'),

      normalFooter: q('normal-footer'),
      replayFooter: q('replay-footer'),
      btnPrimary: q('btn-primary'),
      btnPause: q('btn-pause'),
      btnResign: q('btn-resign'),

      rulesBackdrop: q('rules-backdrop'),
      btnCloseRules: q('btn-close-rules'),
      rulesList: q('rules-list'),
    };
  }

  initStaticChrome() {
    this.el.brandLogo.innerHTML = Icons.logo(22);
    this.el.btnMobilePause.innerHTML = Icons.pause(15);
    this.el.btnDrawer.innerHTML = Icons.menu(16);
    this.el.btnHelp.innerHTML = Icons.help(16);
    this.el.btnTheme.innerHTML = Icons.boardTheme(16);
    this.el.oppHpIcon.innerHTML = Icons.crown(13, '#dda938');
    this.el.youHpIcon.innerHTML = Icons.crown(13, '#dda938');
    this.el.elixirDropIcon.innerHTML = Icons.elixirDrop(14, '#9b4dca');
    this.el.statStreakIcon.innerHTML = Icons.streak(13, '#dda938');
    this.el.youAvatar.innerHTML = renderAvatarSvg('you', 30);
    this.el.btnCloseRules.innerHTML = Icons.close(16);

    this.el.btnPause.innerHTML = `${Icons.pause(13)}<span>Pause</span>`;
    this.el.btnResign.innerHTML = `${Icons.flag(13)}<span>Resign</span>`;

    // Populate minimalist 4-tab labels with custom icons
    const tabConfig = {
      play: `${Icons.botSwitch(13)}<span>Play</span>`,
      multiplayer: `${Icons.users(13)}<span>1v1</span>`,
      deck: `${Icons.deck(13)}<span>Deck</span>`,
      history: `${Icons.history(13)}<span>Stats</span>`,
    };
    this.el.railTabs.querySelectorAll('.rail-tab').forEach((btn) => {
      btn.innerHTML = tabConfig[btn.dataset.tab] || '';
    });

    this.el.rulesList.innerHTML = `
      <div class="rules-item">
        <div class="rules-icon-slot">${Icons.crown(14, '#dda938')}</div>
        <div><strong>20 HP Kings & Castling:</strong> Checks deal <strong>-1 HP</strong>; drag onto the enemy King to strike for <strong>2–5 HP</strong>. Drag your unmoved King toward a back-rank Rook for a free real-time <strong>Castle</strong>.</div>
      </div>
      <div class="rules-item">
        <div class="rules-icon-slot">${Icons.clock(14)}</div>
        <div><strong>2.5s Rings, Premoves & Arrows:</strong> Drag cooling pieces to queue crimson <strong>Premoves</strong> (right-click empty square clears all). Right-click drag draws planning arrows; hover enemies to peek threats.</div>
      </div>
      <div class="rules-item">
        <div class="rules-icon-slot">${Icons.elixirDrop(14, '#9b4dca')}</div>
        <div><strong>Spells & Center Rune (1–4):</strong> Step on the purple <strong>+2 Elixir Rune</strong> on the center line. <strong>Freeze</strong> (2x2 ice), <strong>Swap</strong> (drag A to B, incl. King), <strong>Promote</strong> (home Pawn -> Rook, Rank 4+ -> Queen, others Gilded).</div>
      </div>
      <div class="rules-item">
        <div class="rules-icon-slot">${Icons.streak(14, '#dda938')}</div>
        <div><strong>Overtime:</strong> Final 45s (or Instant OT mode) doubles Elixir and auto-promotes Pawns crossing the <strong>Center Line</strong> into Queens.</div>
      </div>
    `;

    this.syncMuteIcon();
    this.syncModePills();
  }

  bindEvents() {
    this.el.btnHelp.addEventListener('click', () => this.setRulesOpen(!this.rulesOpen));
    this.el.btnCloseRules.addEventListener('click', () => this.setRulesOpen(false));
    this.el.rulesBackdrop.addEventListener('click', (e) => {
      if (e.target === this.el.rulesBackdrop) this.setRulesOpen(false);
    });

    this.el.btnMobilePause.addEventListener('click', () => this.handlers.onTogglePause());
    this.el.btnDrawer.addEventListener('click', () => this.setDrawerOpen(!this.drawerOpen));
    this.el.drawerBackdrop.addEventListener('click', () => this.setDrawerOpen(false));

    this.el.btnTheme.addEventListener('click', () => {
      const idx = BOARD_THEMES.indexOf(this.profile.theme);
      const next = BOARD_THEMES[(idx + 1) % BOARD_THEMES.length];
      this.handlers.onThemeChange(next);
    });

    this.el.btnMute.addEventListener('click', () => this.handlers.onToggleMute());

    this.el.railTabs.querySelectorAll('.rail-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        this.syncRailView();
      });
    });

    this.el.modeSegment.querySelectorAll('.mode-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedMode = btn.dataset.mode;
        this.handlers.onModeChange(this.selectedMode);
        this.syncModePills();
        this.renderPlayList();
        this.syncPrimaryButton();
      });
    });

    this.el.btnPrimary.addEventListener('click', () => {
      this.setDrawerOpen(false);
      if (this.engine.isMultiplayer && this.engine.phase === 'ended') {
        this.mp.requestRematch();
        return;
      }
      if (this.engine.isMultiplayer && this.engine.phase !== 'idle') {
        this.handlers.onLeaveMultiplayer();
        return;
      }
      this.exitReplay();
      this.handlers.onStartSolo(this.selectedMode, this.selectedPuzzleId);
    });

    this.el.btnPause.addEventListener('click', () => {
      this.handlers.onTogglePause();
    });

    this.el.btnResign.addEventListener('click', () => {
      if (this.engine.phase !== 'idle' && this.engine.phase !== 'ended') {
        this.handlers.onResign();
      }
    });
  }

  setDrawerOpen(open) {
    this.drawerOpen = open;
    this.el.rightRail.classList.toggle('drawer-open', open);
    this.el.drawerBackdrop.classList.toggle('open', open);
  }

  setTab(tab) {
    this.activeTab = tab;
    this.syncRailView();
  }

  setProfile(profile) {
    this.profile = profile;
    this.syncProfileHeader();
    this.syncMuteIcon();
    this.renderPlayList();
    this.renderDeckPanel();
    this.renderHistoryPanel();
  }

  syncProfileHeader() {
    this.el.statElo.textContent = String(this.profile.elo);
    this.el.statStreak.textContent = String(this.profile.streak);
    this.el.youElo.textContent = `(${this.profile.elo})`;
  }

  syncMuteIcon() {
    this.el.btnMute.innerHTML = this.profile.muted ? Icons.soundOff(16) : Icons.soundOn(16);
    this.el.btnMute.title = this.profile.muted ? 'Unmute (M)' : 'Mute (M)';
  }

  syncModePills() {
    this.el.modeSegment.querySelectorAll('.mode-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === this.selectedMode);
    });
  }

  setRulesOpen(open) {
    this.rulesOpen = open;
    this.el.rulesBackdrop.style.display = open ? 'flex' : 'none';
    this.el.btnHelp.classList.toggle('active', open);
  }

  // =========================================================================
  // Rail Panels (Bots/Puzzles, 1v1 Multiplayer, Custom Deck, Career History)
  // =========================================================================

  renderPlayList() {
    if (this.selectedMode === 'puzzle') {
      const allPuzzles = getAllPuzzles();
      this.el.botList.innerHTML = allPuzzles.map((p) => {
        const selected = p.id === this.selectedPuzzleId;
        const solved = this.profile.puzzlesSolved.includes(p.id);
        const iconHtml = p.isDaily ? Icons.streak(16, '#dda938') : Icons.puzzle(16);
        return `
          <button class="bot-item ${selected ? 'selected' : ''}" data-puzzle-id="${p.id}" type="button">
            <div class="avatar-box">${iconHtml}</div>
            <div class="bot-item-meta">
              <div class="bot-item-top">
                <span class="bot-item-name">${p.name}</span>
                <span class="bot-item-elo tabular">${p.durationSec}s</span>
              </div>
              <div class="bot-item-tag">${p.difficulty} · ${p.goalText}</div>
            </div>
            ${solved ? Icons.check(14, '#81b64c') : ''}
          </button>
        `;
      }).join('');

      this.el.botList.querySelectorAll('.bot-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedPuzzleId = btn.dataset.puzzleId;
          this.renderPlayList();
        });
      });
      return;
    }

    const selectedId = this.engine.botId;
    this.el.botList.innerHTML = BOTS.map((b) => {
      const selected = b.id === selectedId;
      const beaten = this.profile.beatenBots.includes(b.id);
      return `
        <button class="bot-item ${selected ? 'selected' : ''}" data-bot-id="${b.id}" type="button">
          <div class="avatar-box">${renderAvatarSvg(b.id, 30)}</div>
          <div class="bot-item-meta">
            <div class="bot-item-top">
              <span class="bot-item-name">${b.name}</span>
              <span class="bot-item-elo tabular">${b.elo}</span>
            </div>
            <div class="bot-item-tag">${b.tagline}</div>
          </div>
          ${beaten ? Icons.check(14, '#81b64c') : ''}
        </button>
      `;
    }).join('');

    this.el.botList.querySelectorAll('.bot-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.handlers.onSelectBot(btn.dataset.botId);
      });
    });
  }

  renderMultiplayerPanel() {
    const mp = this.mp;
    const errHtml = mp.error ? `<div class="mp-error">${mp.error}</div>` : '';

    if (mp.status === 'waiting' && mp.roomCode) {
      const link = `${location.origin}${location.pathname}?room=${mp.roomCode}`;
      this.el.tabMp.innerHTML = `
        <div class="mp-card">
          <div class="mp-label">Room Created (${mp.mode === 'overtime' ? 'Overtime 1:00' : 'Blitz 2:00'})</div>
          <div class="mp-code-row">
            <span class="mp-code-val tabular">${mp.roomCode}</span>
            <button class="btn-secondary" id="mp-copy-link" style="flex:0;padding:0 10px" type="button" title="Copy Invite Link">
              ${Icons.copy(13)}<span>${this.copiedCodeFlash ? 'Copied' : 'Link'}</span>
            </button>
          </div>
          <div class="mp-status">Share the code or open the invite link in another tab or device to start 1v1.</div>
          <button class="btn-secondary" id="mp-cancel-room" type="button">Cancel Room</button>
        </div>
        ${errHtml}
      `;

      document.getElementById('mp-copy-link').addEventListener('click', () => {
        navigator.clipboard?.writeText(link).catch(() => {});
        this.copiedCodeFlash = true;
        this.renderMultiplayerPanel();
        setTimeout(() => {
          this.copiedCodeFlash = false;
          this.renderMultiplayerPanel();
        }, 1600);
      });
      document.getElementById('mp-cancel-room').addEventListener('click', () => {
        this.handlers.onLeaveMultiplayer();
      });
      return;
    }

    if (mp.status === 'connected') {
      this.el.tabMp.innerHTML = `
        <div class="mp-card">
          <div class="mp-label">Connected Room ${mp.roomCode}</div>
          <div class="mp-status">Playing as <strong>${mp.side === 'white' ? 'White' : 'Black'}</strong> vs ${mp.opponent?.name || 'Opponent'}.</div>
          <button class="btn-secondary" id="mp-leave-room" type="button">Leave Room</button>
        </div>
      `;
      document.getElementById('mp-leave-room').addEventListener('click', () => {
        this.handlers.onLeaveMultiplayer();
      });
      return;
    }

    const modeForHost = this.selectedMode === 'overtime' ? 'overtime' : 'blitz';
    this.el.tabMp.innerHTML = `
      <div class="mp-card">
        <div class="mp-label">Host Private 1v1</div>
        <div class="mp-status">Creates a 4-letter room code (${modeForHost === 'overtime' ? 'Overtime 1:00' : 'Blitz 2:00'}). You play White; guest plays flipped Black.</div>
        <button class="btn-primary" id="mp-create-btn" type="button">
          ${Icons.users(14)}<span>Create Room</span>
        </button>
      </div>
      <div class="mp-card">
        <div class="mp-label">Join by Code</div>
        <div class="mp-join-row">
          <input class="mp-input" id="mp-code-input" maxlength="6" placeholder="CODE" autocomplete="off" />
          <button class="btn-secondary" id="mp-join-btn" style="flex:0;padding:0 12px" type="button">Join</button>
        </div>
      </div>
      ${errHtml}
    `;

    document.getElementById('mp-create-btn').addEventListener('click', () => {
      this.handlers.onCreateRoom(modeForHost);
    });
    const input = document.getElementById('mp-code-input');
    const doJoin = () => this.handlers.onJoinRoom(input.value);
    document.getElementById('mp-join-btn').addEventListener('click', doJoin);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doJoin();
    });
  }

  renderDeckPanel() {
    const deck = this.profile.customDeck || BASE_DECK;
    const counts = {};
    for (const id of ALL_CARD_IDS) counts[id] = 0;
    for (const id of deck) counts[id] = (counts[id] || 0) + 1;

    const total = deck.length;
    const avgCost = (deck.reduce((sum, id) => sum + CARD_DEFS[id].cost, 0) / Math.max(1, total)).toFixed(1);
    const unitCount = deck.filter((id) => CARD_DEFS[id].kind === 'unit').length;

    const rowsHtml = ALL_CARD_IDS.map((id) => {
      const def = CARD_DEFS[id];
      const c = counts[id];
      const canDec = c > 0 && (def.kind !== 'unit' || unitCount > 2);
      const canInc = c < 3 && total < 8;
      return `
        <div class="deck-row">
          <div class="deck-row-info">
            <div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center">${this.renderCardArt(id, 22)}</div>
            <div>
              <div class="deck-row-name">${def.name}</div>
              <div class="deck-row-cost tabular">${def.cost} Elixir</div>
            </div>
          </div>
          <div class="deck-stepper">
            <button class="step-btn" data-deck-dec="${id}" type="button" ${!canDec ? 'disabled' : ''}>${Icons.minus(11)}</button>
            <span class="deck-count tabular">${c}</span>
            <button class="step-btn" data-deck-inc="${id}" type="button" ${!canInc ? 'disabled' : ''}>${Icons.plus(11)}</button>
          </div>
        </div>
      `;
    }).join('');

    this.el.tabDeck.innerHTML = `
      <div class="deck-head-row">
        <span class="tabular">Deck ${total}/8 · Avg ${avgCost}</span>
        <button class="icon-btn" id="deck-reset" type="button" title="Reset Default Deck">${Icons.reset(14)}</button>
      </div>
      ${rowsHtml}
      <div class="mp-status">${total < 8 ? `Add ${8 - total} more card${8 - total > 1 ? 's' : ''} to complete your 8-card cycle.` : 'Deck active for Solo, Overtime, and 1v1.'}</div>
    `;

    this.el.tabDeck.querySelectorAll('[data-deck-dec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deckDec;
        const idx = deck.indexOf(id);
        if (idx >= 0) {
          const next = [...deck];
          next.splice(idx, 1);
          this.handlers.onDeckDraftChange(next);
        }
      });
    });

    this.el.tabDeck.querySelectorAll('[data-deck-inc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.deckInc;
        if (deck.length < 8) {
          this.handlers.onDeckDraftChange([...deck, id]);
        }
      });
    });

    document.getElementById('deck-reset').addEventListener('click', () => {
      this.handlers.onDeckDraftChange([...BASE_DECK]);
    });
  }

  renderHistoryPanel() {
    const p = this.profile;
    const losses = Math.max(0, p.games - p.wins);
    const list = p.recentMatches || [];

    const matchesHtml =
      list.length === 0
        ? `<div class="mp-status">No completed matches yet.</div>`
        : list
            .map((m) => {
              const sign = m.eloDelta >= 0 ? '+' : '';
              return `
                <div class="history-item">
                  <div style="display:flex;align-items:center;gap:6px;min-width:0">
                    <span class="outcome-tag ${m.outcome}">${m.outcome}</span>
                    <span style="font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.opponent}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                    ${m.brilliant > 0 ? `<span style="display:inline-flex;align-items:center;gap:2px;font-size:11px;color:#1bada6;font-weight:700">${renderBadgeSvg('brilliant', 13)}${m.brilliant}</span>` : ''}
                    <span class="tabular" style="font-weight:700;color:${m.eloDelta >= 0 ? 'var(--cta-green)' : 'var(--text-muted)'}">${sign}${m.eloDelta}</span>
                  </div>
                </div>
              `;
            })
            .join('');

    this.el.tabHistory.innerHTML = `
      <div class="career-grid">
        <div class="career-box"><span>Record</span><strong class="tabular">${p.wins}-${losses}</strong></div>
        <div class="career-box"><span>Best Streak</span><strong class="tabular">${p.bestStreak}</strong></div>
        <div class="career-box"><span style="display:inline-flex;align-items:center;gap:4px">${renderBadgeSvg('brilliant', 13)} Brilliant</span><strong class="tabular">${p.career.brilliant}</strong></div>
        <div class="career-box"><span>Puzzles</span><strong class="tabular">${p.puzzlesSolved.length}/${PUZZLES.length}</strong></div>
      </div>
      <div class="mp-label" style="margin-top:2px">Recent Matches</div>
      ${matchesHtml}
    `;
  }

  syncRailView() {
    const inGame =
      this.engine.phase === 'active' ||
      this.engine.phase === 'overtime' ||
      this.engine.phase === 'sudden_death' ||
      this.engine.phase === 'shattering';

    const showMoves = inGame || this.replayActive;
    this.el.railTabs.style.display = showMoves ? 'none' : 'grid';
    this.el.moveLogWrap.style.display = showMoves ? 'flex' : 'none';
    this.el.railSectionLabel.textContent = this.replayActive ? 'Replay' : 'Moves';

    this.el.tabPlay.style.display = !showMoves && this.activeTab === 'play' ? 'flex' : 'none';
    this.el.tabMp.style.display = !showMoves && this.activeTab === 'multiplayer' ? 'flex' : 'none';
    this.el.tabDeck.style.display = !showMoves && this.activeTab === 'deck' ? 'flex' : 'none';
    this.el.tabHistory.style.display = !showMoves && this.activeTab === 'history' ? 'flex' : 'none';

    this.el.railTabs.querySelectorAll('.rail-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === this.activeTab);
    });

    this.el.normalFooter.style.display = this.replayActive ? 'none' : 'flex';
    this.el.replayFooter.style.display = this.replayActive ? 'flex' : 'none';

    this.el.btnResign.disabled = !inGame || this.engine.phase === 'shattering';
    const canPause = inGame && !this.engine.isMultiplayer && this.engine.phase !== 'shattering';
    this.el.btnPause.disabled = !canPause;
    this.el.btnMobilePause.style.display = canPause ? '' : 'none';

    this.syncPrimaryButton();
  }

  syncPrimaryButton() {
    const eng = this.engine;
    if (eng.isMultiplayer) {
      if (eng.phase === 'ended') {
        const label = this.mp.rematchSent
          ? 'Waiting...'
          : this.mp.rematchOffered
            ? 'Accept Rematch'
            : 'Rematch';
        this.el.btnPrimary.innerHTML = `${Icons.rematch(15)}<span>${label}</span>`;
      } else {
        this.el.btnPrimary.innerHTML = `${Icons.close(14)}<span>Leave 1v1</span>`;
      }
      return;
    }

    if (eng.phase === 'idle') {
      const lbl =
        this.selectedMode === 'overtime'
          ? 'Play Overtime'
          : this.selectedMode === 'puzzle'
            ? 'Start Puzzle'
            : 'Play Blitz';
      this.el.btnPrimary.innerHTML = `${Icons.play(15)}<span>${lbl}</span>`;
    } else if (eng.phase === 'ended') {
      this.el.btnPrimary.innerHTML = `${Icons.rematch(15)}<span>Rematch</span>`;
    } else {
      this.el.btnPrimary.innerHTML = `${Icons.rematch(14)}<span>Restart</span>`;
    }
  }

  // =========================================================================
  // Post-Match Replay Controller
  // =========================================================================

  enterReplay() {
    const frames = this.engine.replayFrames;
    if (!frames || frames.length < 2) return;
    this.replayActive = true;
    this.replayPlaying = true;
    this.replayIndex = 0;
    this.replaySpeed = 1;
    this.replayAccum = 0;
    this.el.reviewBackdrop.style.display = 'none';
    this.board.setReplayFrame(frames[0]);
    this.syncRailView();
    this.renderReplayBar();
  }

  exitReplay() {
    if (!this.replayActive) return;
    this.replayActive = false;
    this.replayPlaying = false;
    this.board.setReplayFrame(null);
    this.syncRailView();
    if (this.engine.phase === 'ended') {
      this.renderReviewModal(this.engine);
    }
  }

  renderReplayBar() {
    const frames = this.engine.replayFrames;
    const maxIdx = Math.max(0, frames.length - 1);
    const cur = frames[this.replayIndex] || frames[0];
    this.el.replayFooter.innerHTML = `
      <div class="replay-controls">
        <button class="icon-btn" id="rep-toggle" type="button" title="Play/Pause">
          ${this.replayPlaying ? Icons.pause(15) : Icons.play(15)}
        </button>
        <input class="replay-slider" id="rep-slider" type="range" min="0" max="${maxIdx}" value="${this.replayIndex}" />
        <button class="btn-secondary" id="rep-speed" style="flex:0;padding:0 8px;height:26px" type="button">${this.replaySpeed}x</button>
      </div>
      <div class="footer-secondary-row">
        <span class="tabular" style="font-size:11px;color:var(--text-muted);flex:1">Time ${formatClock(cur ? cur.timeRemaining : 0)}</span>
        <button class="btn-secondary" id="rep-exit" type="button">Exit Replay</button>
      </div>
    `;

    document.getElementById('rep-toggle').addEventListener('click', () => {
      if (this.replayIndex >= maxIdx) this.replayIndex = 0;
      this.replayPlaying = !this.replayPlaying;
      this.renderReplayBar();
    });
    document.getElementById('rep-slider').addEventListener('input', (e) => {
      this.replayPlaying = false;
      this.replayIndex = Number(e.target.value);
      this.board.setReplayFrame(frames[this.replayIndex]);
      this.renderReplayBar();
    });
    document.getElementById('rep-speed').addEventListener('click', () => {
      this.replaySpeed = this.replaySpeed === 1 ? 2 : this.replaySpeed === 2 ? 0.5 : 1;
      this.renderReplayBar();
    });
    document.getElementById('rep-exit').addEventListener('click', () => this.exitReplay());
  }

  tickReplay(dt) {
    if (!this.replayActive || !this.replayPlaying) return;
    const frames = this.engine.replayFrames;
    if (!frames || frames.length < 2) return;

    this.replayAccum += dt * this.replaySpeed;
    const stepTime = 0.22;
    if (this.replayAccum >= stepTime) {
      this.replayAccum -= stepTime;
      if (this.replayIndex < frames.length - 1) {
        this.replayIndex++;
        this.board.setReplayFrame(frames[this.replayIndex]);
        const slider = document.getElementById('rep-slider');
        if (slider) slider.value = String(this.replayIndex);
      } else {
        this.replayPlaying = false;
        this.renderReplayBar();
      }
    }
  }

  // =========================================================================
  // Card Hand, Captured Trays & Modals
  // =========================================================================

  renderCardArt(cardId, size = 32) {
    const def = CARD_DEFS[cardId];
    if (def.kind === 'unit' && def.pieceType) {
      return renderPieceSvg(def.pieceType, this.board.perspective, size);
    }
    if (cardId === 'freeze') return Icons.freeze(size - 6, '#237199');
    if (cardId === 'swap') return Icons.swap(size - 6, '#563fa3');
    return Icons.promote(size - 6, '#966810');
  }

  renderHand(eng) {
    const mySide = this.board.perspective;
    const myState = eng.getSideState(mySide);
    const hand = myState.hand;
    const nextCard = myState.queue[0];
    const inactive =
      this.replayActive ||
      eng.phase === 'idle' ||
      eng.phase === 'ended' ||
      eng.phase === 'shattering' ||
      eng.paused;
    const handKey = `${mySide}|${hand.join(',')}|${nextCard}|${this.board.selectedCardSlot}|${inactive}`;

    if (handKey !== this.lastHandKey) {
      this.lastHandKey = handKey;

      const cardHtml = hand
        .map((cid, idx) => {
          const def = CARD_DEFS[cid];
          const isSelected = this.board.selectedCardSlot === idx;
          return `
            <button
              class="card-tile ${def.kind === 'spell' ? 'spell-card' : ''} ${isSelected ? 'selected' : ''}"
              data-slot="${idx}"
              type="button"
              ${inactive ? 'disabled' : ''}
              title="${def.name} (${def.cost}) — ${def.shortDesc}"
            >
              <div class="card-charge-mask" data-mask="${idx}" style="height:0%"></div>
              <span class="card-cost-pill tabular">${Icons.elixirDrop(10, '#8c41ba')}${def.cost}</span>
              <span class="card-hotkey tabular">${idx + 1}</span>
              <div class="card-art">${this.renderCardArt(cid, 32)}</div>
              <span class="card-label">${def.name}</span>
            </button>
          `;
        })
        .join('');

      const nextDef = CARD_DEFS[nextCard];
      const nextHtml = `
        <div class="next-card-slot" title="Next: ${nextDef.name} (${nextDef.cost})">
          <span class="next-tag">Next</span>
          <div class="next-art">${this.renderCardArt(nextCard, 22)}</div>
          <span class="next-cost tabular">${nextDef.cost}</span>
        </div>
      `;

      this.el.handRow.innerHTML = cardHtml + nextHtml;

      this.el.handRow.querySelectorAll('.card-tile').forEach((btn) => {
        btn.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || btn.disabled) return;
          const slot = Number(btn.dataset.slot);
          this.board.selectCardSlot(slot, e);
        });
      });
    }

    const elixir = myState.elixir;
    hand.forEach((cid, idx) => {
      const cost = CARD_DEFS[cid].cost;
      const btn = this.el.handRow.querySelector(`[data-slot="${idx}"]`);
      const mask = this.el.handRow.querySelector(`[data-mask="${idx}"]`);
      if (!btn || !mask) return;
      if (inactive) {
        btn.classList.add('unaffordable');
        mask.style.height = '0%';
        this.prevCardAfford[idx] = false;
        return;
      }
      const affordable = elixir >= cost;
      if (affordable && !this.prevCardAfford[idx] && eng.elapsed > 0.4) {
        this.handlers.onCardReadyChime?.();
      }
      this.prevCardAfford[idx] = affordable;
      btn.classList.toggle('unaffordable', !affordable);
      const missingFrac = affordable ? 0 : Math.max(0, Math.min(1, (cost - elixir) / cost));
      mask.style.height = `${(missingFrac * 100).toFixed(1)}%`;
    });
  }

  renderCaptured(container, list, pieceSide, adv) {
    const order = { Q: 5, R: 4, B: 3, N: 2, P: 1 };
    const sorted = [...list].sort((a, b) => (order[b] || 0) - (order[a] || 0));
    const imgs = sorted
      .slice(0, 10)
      .map((t) => `<span class="captured-mini">${renderPieceSvg(t, pieceSide, 12)}</span>`)
      .join('');
    const advHtml = adv > 0 ? `<span class="material-adv tabular">+${adv}</span>` : '';
    container.innerHTML = imgs + advHtml;
  }

  renderPauseModal(eng) {
    if (!eng.paused) {
      this.el.pauseBackdrop.style.display = 'none';
      return;
    }
    this.el.pauseBackdrop.style.display = 'flex';
    this.el.pauseBackdrop.innerHTML = `
      <div class="pause-box">
        <div class="pause-title">Paused</div>
        <button class="btn-primary" id="modal-resume" type="button">
          ${Icons.play(14)}<span>Resume (P)</span>
        </button>
      </div>
    `;
    document.getElementById('modal-resume').addEventListener('click', () => {
      this.handlers.onTogglePause();
    });
  }

  renderReviewModal(eng) {
    if (eng.phase !== 'ended' || !eng.result || this.replayActive) {
      this.el.reviewBackdrop.style.display = 'none';
      return;
    }

    const r = eng.result;
    const mySide = this.board.perspective;
    const iWon = r.winner === mySide;
    const isDraw = r.winner === 'draw';
    const titleClass = iWon ? 'win' : isDraw ? 'draw' : 'loss';
    const titleText =
      r.mode === 'puzzle'
        ? iWon
          ? 'Puzzle Solved'
          : 'Puzzle Failed'
        : iWon
          ? 'Victory'
          : isDraw
            ? 'Draw'
            : 'Defeat';

    const reasonMap = {
      checkmate: 'King Shattered',
      time: 'Time Expired',
      sudden_death: 'Sudden Death',
      resign: 'Resigned',
    };

    const myDelta = mySide === 'white' ? r.eloDelta : -r.eloDelta;
    const sign = myDelta >= 0 ? '+' : '';
    const deltaCls = myDelta >= 0 ? 'pos' : 'neg';
    const hasReplay = eng.replayFrames && eng.replayFrames.length >= 2;

    const rematchLabel = eng.isMultiplayer
      ? this.mp.rematchSent
        ? 'Waiting for Opponent...'
        : this.mp.rematchOffered
          ? 'Accept Rematch'
          : 'Rematch'
      : 'Rematch (R)';

    const myStats = (r.statsBySide && r.statsBySide[mySide]) || r.stats;

    this.el.reviewBackdrop.style.display = 'flex';
    this.el.reviewBackdrop.innerHTML = `
      <div class="board-modal">
        <div class="modal-head">
          <div>
            <div class="modal-result-title ${titleClass}">${titleText}</div>
            <div class="modal-subtitle">${reasonMap[r.reason] || ''}</div>
          </div>
          ${
            r.mode === 'puzzle'
              ? `<div class="elo-delta-pill pos">${getPuzzleById(r.puzzleId).difficulty}</div>`
              : `<div class="elo-delta-pill tabular ${deltaCls}">${sign}${myDelta} ELO</div>`
          }
        </div>

        <div class="review-grid">
          <div class="review-cell">
            <span class="review-cell-label">${renderBadgeSvg('brilliant', 16)} Brilliant</span>
            <span class="review-cell-val tabular">${myStats.brilliant}</span>
          </div>
          <div class="review-cell">
            <span class="review-cell-label">${renderBadgeSvg('great', 16)} Great</span>
            <span class="review-cell-val tabular">${myStats.great}</span>
          </div>
          <div class="review-cell">
            <span class="review-cell-label">${Icons.crown(14, '#dda938')} King Dmg</span>
            <span class="review-cell-val tabular">${myStats.damageDealt}</span>
          </div>
          <div class="review-cell">
            <span class="review-cell-label">${Icons.elixirDrop(13, '#9b4dca')} Best Trade</span>
            <span class="review-cell-val tabular">${myStats.bestTrade > 0 ? `+${myStats.bestTrade}` : '0'}</span>
          </div>
        </div>

        <button class="btn-primary" id="modal-rematch" type="button">
          ${Icons.rematch(15)}<span>${rematchLabel}</span>
        </button>
        <div class="footer-secondary-row">
          ${
            hasReplay
              ? `<button class="btn-secondary" id="modal-replay" type="button">${Icons.replay(14)}<span>Replay</span></button>`
              : ''
          }
          <button class="btn-secondary" id="modal-back" type="button">
            ${Icons.botSwitch(14)}<span>${eng.isMultiplayer ? 'Leave' : 'Menu'}</span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('modal-rematch').addEventListener('click', () => {
      if (eng.isMultiplayer) {
        this.mp.requestRematch();
        this.renderReviewModal(eng);
      } else {
        this.handlers.onStartSolo(this.selectedMode, this.selectedPuzzleId);
      }
    });

    const repBtn = document.getElementById('modal-replay');
    if (repBtn) {
      repBtn.addEventListener('click', () => this.enterReplay());
    }

    document.getElementById('modal-back').addEventListener('click', () => {
      if (eng.isMultiplayer) {
        this.handlers.onLeaveMultiplayer();
      } else {
        this.handlers.onReturnToMenu();
      }
    });
  }

  // =========================================================================
  // Per-Frame Sync
  // =========================================================================

  update() {
    const eng = this.engine;
    const mySide = this.board.perspective;
    const oppSide = mySide === 'white' ? 'black' : 'white';
    const rf = this.replayActive ? eng.replayFrames[this.replayIndex] : null;

    // Identity headers (handles Bots, Puzzles, and 1v1 Guest flip!)
    const bot = getBotById(eng.botId);
    const oppDisplayName = eng.isMultiplayer ? (this.mp.opponent?.name || 'Opponent') : bot.name;
    const oppDisplayElo = eng.isMultiplayer ? (this.mp.opponent?.elo || 800) : bot.elo;
    const idKey = `${mySide}|${eng.isMultiplayer}|${oppDisplayName}|${oppDisplayElo}|${bot.id}`;
    if (idKey !== this.lastIdentityKey) {
      this.lastIdentityKey = idKey;
      this.el.oppAvatar.innerHTML = renderAvatarSvg(eng.isMultiplayer ? 'you' : bot.id, 30);
      this.el.oppName.textContent = oppDisplayName;
      this.el.oppElo.textContent = `(${oppDisplayElo})`;
      this.el.youName.textContent = eng.isMultiplayer ? `You (${mySide === 'white' ? 'W' : 'B'})` : 'You';
      this.renderPlayList();
    }

    if (this.lastPhase !== eng.phase) {
      this.lastPhase = eng.phase;
      if (eng.phase === 'active' || eng.phase === 'overtime') {
        this.replayActive = false;
      }
      this.syncRailView();
      this.renderReviewModal(eng);
    }

    if (this.lastPaused !== eng.paused) {
      this.lastPaused = eng.paused;
      this.el.btnPause.innerHTML = eng.paused
        ? `${Icons.play(13)}<span>Resume</span>`
        : `${Icons.pause(13)}<span>Pause</span>`;
      this.el.btnMobilePause.innerHTML = eng.paused ? Icons.play(15) : Icons.pause(15);
      this.renderPauseModal(eng);
    }

    const phase = rf ? rf.phase : eng.phase;
    const isOT = phase === 'overtime' || phase === 'sudden_death';
    this.el.boardFrame.classList.toggle('overtime-border', isOT);

    if (eng.bannerId !== this.lastBannerId && eng.bannerText) {
      this.lastBannerId = eng.bannerId;
      this.el.bannerHost.innerHTML = `<div class="board-banner">${eng.bannerText}</div>`;
    } else if (eng.phase === 'idle') {
      this.el.bannerHost.innerHTML = '';
    }

    if (eng.botQuip && !this.replayActive) {
      this.el.botQuip.style.display = 'block';
      this.el.botQuip.textContent = eng.mode === 'puzzle' ? eng.botQuip : `${bot.name}: ${eng.botQuip}`;
    } else {
      this.el.botQuip.style.display = 'none';
    }

    // Eval Bar (flips cleanly if you're playing Black in 1v1!)
    const rawEval = rf ? rf.evalNorm : eng.getEvalNormalized();
    const myEval = mySide === 'white' ? rawEval : -rawEval;
    const bottomPct = Math.max(4, Math.min(96, 50 + myEval * 46));
    this.el.evalWhite.style.height = `${bottomPct.toFixed(1)}%`;

    // King HP Bars
    const myHp = rf ? (mySide === 'white' ? rf.whiteHp : rf.blackHp) : eng.getSideState(mySide).kingHp;
    const oppHp = rf ? (oppSide === 'white' ? rf.whiteHp : rf.blackHp) : eng.getSideState(oppSide).kingHp;
    this.syncHpBar(this.el.oppHpFill, this.el.oppHpVal, oppHp);
    this.syncHpBar(this.el.youHpFill, this.el.youHpVal, myHp);

    // Match Clock
    const rem = rf ? rf.timeRemaining : eng.timeRemaining;
    this.el.clockVal.textContent = formatClock(rem);
    this.el.clockBox.classList.toggle('overtime', phase === 'overtime');
    this.el.clockBox.classList.toggle('sudden-death', phase === 'sudden_death');
    this.el.clockBox.classList.toggle('low-time', phase !== 'idle' && phase !== 'ended' && rem <= 15);

    // Captured pieces trays
    const mySideObj = eng.getSideState(mySide);
    const oppSideObj = eng.getSideState(oppSide);
    const capKey = `${mySide}|${mySideObj.captured.join('')}|${oppSideObj.captured.join('')}`;
    if (capKey !== this.lastCapturedKey) {
      this.lastCapturedKey = capKey;
      let myMat = 0;
      let oppMat = 0;
      for (const p of eng.pieces) {
        if (p.side === mySide) myMat += PIECE_MATERIAL[p.type];
        else oppMat += PIECE_MATERIAL[p.type];
      }
      this.renderCaptured(this.el.youCaptured, mySideObj.captured, oppSide, myMat - oppMat);
      this.renderCaptured(this.el.oppCaptured, oppSideObj.captured, mySide, oppMat - myMat);
    }

    // Elixir bar
    const myElixir = rf ? (mySide === 'white' ? rf.whiteElixir : rf.blackElixir) : mySideObj.elixir;
    this.el.elixirNum.textContent = String(Math.floor(myElixir));
    this.el.elixirFill.style.width = `${((myElixir / MAX_ELIXIR) * 100).toFixed(2)}%`;
    this.el.elixirFill.classList.toggle('overtime', isOT);

    const mult = phase === 'sudden_death' ? 3 : phase === 'overtime' ? 2 : 1;
    this.el.elixirRate.textContent = `${mult}x`;
    this.el.elixirRate.classList.toggle('boosted', mult > 1);

    this.renderHand(eng);

    const logKey = `${eng.moveLog.length}:${eng.moveLog[0]?.id || ''}`;
    if (logKey !== this.lastMoveLogKey) {
      this.lastMoveLogKey = logKey;
      if (eng.moveLog.length === 0) {
        this.el.moveLog.innerHTML = `<div class="move-log-empty">Drag pieces or press 1–4 to drop cards. Moves appear here.</div>`;
      } else {
        this.el.moveLog.innerHTML = eng.moveLog
          .map((m) => {
            const spellMini =
              m.spellIcon === 'freeze'
                ? Icons.freeze(13, '#5cb8e4')
                : m.spellIcon === 'swap'
                  ? Icons.swap(13, '#9378e6')
                  : m.spellIcon === 'promote'
                    ? Icons.crown(13, '#dda938')
                    : '';
            const badgeHtml = m.badge ? renderBadgeSvg(m.badge, 17) : '';
            return `
              <div class="move-row">
                <span class="move-time tabular">${m.timeStr}</span>
                <span class="move-desc">
                  <span class="side-dot ${m.side}"></span>
                  ${spellMini}
                  <span>${m.text}</span>
                </span>
                <span>${badgeHtml}</span>
              </div>
            `;
          })
          .join('');
      }
    }
  }

  syncHpBar(fillEl, valEl, hp) {
    const pct = Math.max(0, Math.min(100, (hp / KING_MAX_HP) * 100));
    fillEl.style.width = `${pct.toFixed(1)}%`;
    fillEl.className = `hp-bar-fill ${pct <= 30 ? 'critical' : pct <= 50 ? 'cracked' : 'healthy'}`;
    valEl.textContent = `${hp}/${KING_MAX_HP}`;
  }
}
