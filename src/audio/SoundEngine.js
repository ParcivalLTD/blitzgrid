// Procedural Web Audio API synthesizer — Chess.com wooden thock + sketchbook foley.

export class SoundEngine {
  constructor(initialMuted = false) {
    this.muted = initialMuted;
    this.ctx = null;
    this.noiseBuffer = null;
  }

  setMuted(muted) {
    this.muted = muted;
  }

  haptic(pattern) {
    if (this.muted) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore blocked vibrate calls
      }
    }
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  buildNoiseBuffer() {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.25);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
  }

  canPlay() {
    if (this.muted) return false;
    this.unlock();
    return Boolean(this.ctx && this.ctx.state === 'running');
  }

  handleEvent(ev) {
    switch (ev.type) {
      case 'MOVE':
        this.playMove(ev.isJump, ev.pieceType);
        break;
      case 'CAPTURE':
        this.playCapture(ev.streak || 1);
        this.haptic(15);
        break;
      case 'CHECK':
        this.playCheck();
        this.haptic(12);
        break;
      case 'KING_STRIKE':
        this.playKingStrike(ev.damage || 3);
        this.haptic(24);
        break;
      case 'CROWN_BREAK':
        this.playCrownBreak();
        this.haptic(18);
        break;
      case 'DEPLOY':
        this.playDeploy();
        this.haptic(10);
        break;
      case 'FREEZE':
        this.playFreeze();
        this.haptic(14);
        break;
      case 'SWAP':
        this.playSwap();
        this.haptic(14);
        break;
      case 'PROMOTE':
        this.playPromote(ev.toQueen);
        this.haptic(18);
        break;
      case 'HASTE':
        this.playHaste();
        this.haptic(10);
        break;
      case 'BARRICADE':
        this.playBarricade();
        this.haptic(12);
        break;
      case 'BARRICADE_BREAK':
        this.playBarricadeBreak();
        this.haptic(14);
        break;
      case 'CASTLE':
        this.playCastle();
        this.haptic([10, 40, 12]);
        break;
      case 'RUNE_TELEGRAPH':
        this.playRuneTelegraph();
        break;
      case 'RUNE_SPAWN':
        this.playRuneSpawn();
        break;
      case 'RUNE_CLAIM':
        this.playRuneClaim();
        this.haptic(16);
        break;
      case 'OVERTIME':
      case 'SUDDEN_DEATH':
        this.playOvertime();
        this.haptic([20, 40, 20]);
        break;
      case 'CLOCK_TICK':
        this.playClockTick(ev.overtime);
        break;
      case 'KING_SHATTER':
        this.playKingShatter();
        this.haptic([28, 30, 48]);
        break;
      case 'GAME_OVER':
        this.playGameOver(ev.winner);
        break;
      case 'DODGE':
        this.playDodge();
        break;
      default:
        break;
    }
  }

  playMove(isJump = false, pieceType = null) {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;

    // Distinct acoustic weight per piece type (Pawn light tap -> Rook stone thud -> Queen shimmer)
    const profiles = {
      P: { start: 225, end: 94, dur: 0.048, gain: 0.17, noiseFreq: 1380, noiseGain: 0.085 },
      N: { start: 192, end: 78, dur: 0.052, gain: 0.21, noiseFreq: 1450, noiseGain: 0.11, clipClop: true },
      B: { start: 182, end: 72, dur: 0.056, gain: 0.21, noiseFreq: 1260, noiseGain: 0.12 },
      R: { start: 118, end: 46, dur: 0.085, gain: 0.29, noiseFreq: 760, noiseGain: 0.14 },
      Q: { start: 164, end: 64, dur: 0.072, gain: 0.25, noiseFreq: 1180, noiseGain: 0.11, shimmer: true },
      K: { start: 136, end: 52, dur: 0.078, gain: 0.26, noiseFreq: 860, noiseGain: 0.12 },
    };
    const pr = profiles[pieceType] || {
      start: isJump ? 210 : 175,
      end: 68,
      dur: 0.055,
      gain: 0.22,
      noiseFreq: isJump ? 1400 : 1050,
      noiseGain: 0.11,
      clipClop: isJump,
    };

    const thock = (offset, freqMult = 1, volMult = 1) => {
      const st = t + offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pr.start * freqMult, st);
      osc.frequency.exponentialRampToValueAtTime(pr.end * freqMult, st + pr.dur);
      gain.gain.setValueAtTime(pr.gain * volMult, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + pr.dur + 0.012);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + pr.dur + 0.018);

      if (this.noiseBuffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(pr.noiseFreq * freqMult, st);
        bp.Q.value = 1.4;
        const ng = this.ctx.createGain();
        ng.gain.setValueAtTime(pr.noiseGain * volMult, st);
        ng.gain.exponentialRampToValueAtTime(0.001, st + 0.045);
        src.connect(bp).connect(ng).connect(this.ctx.destination);
        src.start(st);
        src.stop(st + 0.05);
      }
    };

    thock(0, 1, 1);

    // Knight twin wooden clip-clop
    if (pr.clipClop) {
      thock(0.048, 1.24, 0.72);
    }

    // Queen subtle high crystal resonance
    if (pr.shimmer) {
      const sh = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sh.type = 'sine';
      sh.frequency.setValueAtTime(660, t);
      sh.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      sg.gain.setValueAtTime(0.045, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      sh.connect(sg).connect(this.ctx.destination);
      sh.start(t);
      sh.stop(t + 0.11);
    }
  }

  playHaste() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.11);
    g.gain.setValueAtTime(0.13, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.16);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1200, t);
      bp.frequency.exponentialRampToValueAtTime(2800, t + 0.11);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.08, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(bp).connect(ng).connect(this.ctx.destination);
      src.start(t);
      src.stop(t + 0.13);
    }
  }

  playBarricade() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(112, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);

    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(680, t);
      bp.Q.value = 0.9;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.16, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
      src.connect(bp).connect(ng).connect(this.ctx.destination);
      src.start(t);
      src.stop(t + 0.09);
    }
  }

  playBarricadeBreak() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    [0, 0.042].forEach((off, idx) => {
      const st = t + off;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(idx === 0 ? 520 : 380, st);
      osc.frequency.setValueAtTime(idx === 0 ? 148 : 96, st);
      osc.frequency.exponentialRampToValueAtTime(46, st + 0.08);
      g.gain.setValueAtTime(idx === 0 ? 0.22 : 0.16, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.09);
      osc.connect(lp).connect(g).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.1);
    });
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1450, t);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.19, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(bp).connect(ng).connect(this.ctx.destination);
      src.start(t);
      src.stop(t + 0.13);
    }
  }

  playCapture(streak = 1) {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const mult = Math.pow(1.09, Math.min(streak - 1, 4));

    // Snappy wooden double-clack
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260 * mult, t);
    osc.frequency.exponentialRampToValueAtTime(76, t + 0.08);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.095);

    // Crisp click crack
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.setValueAtTime(2100 * mult, t);
      hp.Q.value = 1.1;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.22, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(hp).connect(ng).connect(this.ctx.destination);
      src.start(t);
      src.stop(t + 0.065);
    }
  }

  playCheck() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const freqs = [587.3, 880];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const start = t + idx * 0.045;
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.13, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.17);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  }

  playKingStrike(dmg = 3) {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 0.18);

    osc.frequency.setValueAtTime(128 + dmg * 6, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(lp).connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  playCrownBreak() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    [1180, 1620].forEach((f) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.72, t + 0.15);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  playDeploy() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.065);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.085);
  }

  playFreeze() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    [1046, 1318, 1568].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const st = t + i * 0.035;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.09, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.26);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.27);
    });
  }

  playSwap() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(740, t + 0.11);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.18);
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playPromote(toQueen = true) {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const notes = toQueen ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const st = t + i * 0.055;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.13, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.24);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.25);
    });
  }

  playOvertime() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    [130.8, 196].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const st = t + i * 0.14;
      osc.frequency.setValueAtTime(f, st);
      osc.frequency.exponentialRampToValueAtTime(f * 0.72, st + 0.22);
      g.gain.setValueAtTime(0.24, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.24);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.25);
    });
  }

  playClockTick(overtime = false) {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(overtime ? 1040 : 920, t);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.03);

    if (overtime) {
      // Subtle muffled heartbeat pulse in final 10s of Overtime
      const sub = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(72, t);
      sub.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      sg.gain.setValueAtTime(0.11, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      sub.connect(sg).connect(this.ctx.destination);
      sub.start(t);
      sub.stop(t + 0.12);
    }
  }

  playCardReady() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(740, t);
    osc.frequency.exponentialRampToValueAtTime(980, t + 0.06);
    g.gain.setValueAtTime(0.055, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  playCastle() {
    if (!this.canPlay()) return;
    // Crisp authentic Chess.com double-thock!
    this.playMove(false);
    setTimeout(() => this.playMove(true), 68);
  }

  playRuneTelegraph() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(640, t + 0.08);
    g.gain.setValueAtTime(0.055, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  playRuneSpawn() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    [493.88, 739.99].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const st = t + i * 0.06;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.07, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.24);
    });
  }

  playRuneClaim() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    [587.33, 739.99, 987.77].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const st = t + i * 0.045;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.11, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.2);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.21);
    });
  }

  playKingShatter() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    // Deep gong impact
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 0.48);
    osc.frequency.setValueAtTime(112, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.45);
    g.gain.setValueAtTime(0.36, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(lp).connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.52);

    // Crown shard clinks
    [1320, 1740, 1080, 1520].forEach((f, i) => {
      const sh = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sh.type = 'triangle';
      const st = t + 0.04 + i * 0.05;
      sh.frequency.setValueAtTime(f, st);
      sh.frequency.exponentialRampToValueAtTime(f * 0.68, st + 0.14);
      sg.gain.setValueAtTime(0.08, st);
      sg.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
      sh.connect(sg).connect(this.ctx.destination);
      sh.start(st);
      sh.stop(st + 0.16);
    });
  }

  playDodge() {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    if (!this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    src.connect(bp).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 0.12);
  }

  playGameOver(winner) {
    if (!this.canPlay()) return;
    const t = this.ctx.currentTime;
    const notes =
      winner === 'white'
        ? [392, 493.88, 587.33, 783.99]
        : winner === 'black'
          ? [392, 349.23, 311.13, 261.63]
          : [440, 440];
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const st = t + i * 0.095;
      osc.frequency.setValueAtTime(f, st);
      g.gain.setValueAtTime(0.15, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.35);
      osc.connect(g).connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.36);
    });
  }
}
