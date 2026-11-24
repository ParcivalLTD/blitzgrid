import { BASE_DECK } from '../engine/constants.js';
import { validateDeck } from '../engine/GameEngine.js';

const STORAGE_KEY = 'blitz_grid_profile_v2';

const DEFAULT_PROFILE = {
  handle: 'You',
  seenHint: false,
  elo: 800,
  streak: 0,
  bestStreak: 0,
  wins: 0,
  games: 0,
  beatenBots: [],
  puzzlesSolved: [],
  dailyStreak: 0,
  dailyCompletedDate: null,
  customDeck: [...BASE_DECK],
  career: {
    brilliant: 0,
    great: 0,
    captures: 0,
    queens: 0,
    damage: 0,
  },
  recentMatches: [],
  theme: 'green',
  muted: false,
  selectedBot: 'petra',
  selectedMode: 'blitz',
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('blitz_grid_profile_v1');
    if (!raw) return { ...DEFAULT_PROFILE, customDeck: [...BASE_DECK], career: { ...DEFAULT_PROFILE.career } };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      beatenBots: Array.isArray(parsed.beatenBots) ? parsed.beatenBots : [],
      puzzlesSolved: Array.isArray(parsed.puzzlesSolved) ? parsed.puzzlesSolved : [],
      customDeck: validateDeck(parsed.customDeck || BASE_DECK),
      career: { ...DEFAULT_PROFILE.career, ...(parsed.career || {}) },
      recentMatches: Array.isArray(parsed.recentMatches) ? parsed.recentMatches.slice(0, 15) : [],
    };
  } catch {
    return { ...DEFAULT_PROFILE, customDeck: [...BASE_DECK], career: { ...DEFAULT_PROFILE.career } };
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyMatchOutcome(profile, { opponentName, botId, mySide = 'white', result }) {
  const iWon = result.winner === mySide;
  const isDraw = result.winner === 'draw';
  const myDelta = mySide === 'white' ? result.eloDelta : -result.eloDelta;
  const myStats = (result.statsBySide && result.statsBySide[mySide]) || result.stats || {};

  const next = {
    ...profile,
    beatenBots: [...profile.beatenBots],
    puzzlesSolved: [...profile.puzzlesSolved],
    career: {
      brilliant: profile.career.brilliant + (myStats.brilliant || 0),
      great: profile.career.great + (myStats.great || 0),
      captures: profile.career.captures + (myStats.captures || 0),
      queens: profile.career.queens + (myStats.queensPromoted || 0),
      damage: profile.career.damage + (myStats.damageDealt || 0),
    },
    recentMatches: [...profile.recentMatches],
  };

  if (result.mode === 'puzzle') {
    if (iWon && result.puzzleId) {
      if (!next.puzzlesSolved.includes(result.puzzleId)) {
        next.puzzlesSolved.push(result.puzzleId);
      }
      if (result.puzzleId.startsWith('daily_')) {
        const dateKey = result.puzzleId.slice(6);
        if (next.dailyCompletedDate !== dateKey) {
          next.dailyStreak = (profile.dailyStreak || 0) + 1;
          next.dailyCompletedDate = dateKey;
        }
      }
    }
  } else {
    next.elo = Math.max(400, profile.elo + myDelta);
    next.games = profile.games + 1;

    if (iWon) {
      next.wins += 1;
      next.streak += 1;
      next.bestStreak = Math.max(next.bestStreak, next.streak);
      if (botId && !next.beatenBots.includes(botId)) {
        next.beatenBots.push(botId);
      }
    } else if (!isDraw) {
      next.streak = 0;
    }

    next.recentMatches.unshift({
      ts: Date.now(),
      opponent: opponentName,
      mode: result.mode || 'blitz',
      outcome: iWon ? 'W' : isDraw ? 'D' : 'L',
      eloDelta: myDelta,
      brilliant: myStats.brilliant || 0,
      bestTrade: myStats.bestTrade || 0,
    });
    if (next.recentMatches.length > 15) next.recentMatches.pop();
  }

  saveProfile(next);
  return next;
}

export async function fetchLeaderboard(dateKey) {
  try {
    const q = dateKey ? `?date=${encodeURIComponent(dateKey)}` : '';
    const res = await fetch(`./api/leaderboard${q}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function submitScore(payload) {
  try {
    const res = await fetch('./api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}
