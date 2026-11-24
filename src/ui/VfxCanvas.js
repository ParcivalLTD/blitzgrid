import { COLS, ROWS } from '../engine/constants.js';

// High-FPS HTML5 Canvas 2D ink-splatter, crown shatter, Overtime embers & strike VFX.

export class VfxCanvas {
  constructor(canvasEl, frameEl) {
    this.canvas = canvasEl;
    this.frameEl = frameEl;
    this.ctx = canvasEl.getContext('2d');
    this.perspective = 'white';
    this.particles = [];
    this.shards = [];
    this.rings = [];
    this.popups = [];
    this.shakeTime = 0;
    this.shakeAmp = 0;
    this.emberAccum = 0;
    this.w = 1;
    this.h = 1;
    this.resize();
  }

  setPerspective(side) {
    this.perspective = side === 'black' ? 'black' : 'white';
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  sqCenter(sq) {
    const tileW = this.w / COLS;
    const tileH = this.h / ROWS;
    const drawCol = this.perspective === 'black' ? COLS - 1 - sq.col : sq.col;
    const drawRow = this.perspective === 'black' ? sq.row : ROWS - 1 - sq.row;
    return {
      x: (drawCol + 0.5) * tileW,
      y: (drawRow + 0.5) * tileH,
      tile: tileW,
    };
  }

  triggerShake(amp, duration = 0.16) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  handleEvent(ev) {
    switch (ev.type) {
      case 'MOVE': {
        const from = this.sqCenter(ev.from);
        const to = this.sqCenter(ev.to);
        if (ev.isJump) {
          this.spawnRing(from.x, from.y, from.tile * 0.42, 'rgba(244,241,230,0.45)', 0.25);
        } else {
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          for (let i = 1; i <= 4; i++) {
            const frac = i / 5;
            this.particles.push({
              x: from.x + dx * frac + (Math.random() - 0.5) * 6,
              y: from.y + dy * frac + (Math.random() - 0.5) * 6,
              vx: -dx * 0.08,
              vy: -dy * 0.08,
              r: 2.2 + Math.random() * 1.8,
              color: ev.side === 'white' ? 'rgba(247,243,231,0.55)' : 'rgba(34,32,29,0.5)',
              life: 0,
              maxLife: 0.22,
            });
          }
        }
        break;
      }

      case 'CAPTURE': {
        const c = this.sqCenter(ev.at);
        const ink = ev.side === 'white' ? '#1f1e1c' : '#f4f1e6';
        const accent = ev.tradeDelta >= 2 ? '#1bada6' : '#dda938';
        this.spawnBurst(c.x, c.y, 14, ink, accent, 155);
        this.spawnRing(c.x, c.y, c.tile * 0.62, ink, 0.26);
        // Captured piece knockback silhouette burst
        this.shards.push({
          x: c.x,
          y: c.y,
          vx: (Math.random() > 0.5 ? 1 : -1) * 75,
          vy: -110,
          rot: 0,
          vrot: (Math.random() > 0.5 ? 1 : -1) * 10,
          size: c.tile * 0.22,
          color: ev.side === 'white' ? '#2c2a27' : '#ede8d8',
          life: 0,
          maxLife: 0.24,
        });
        this.triggerShake(ev.tradeDelta >= 2 ? 4.8 : 3.0, 0.15);
        break;
      }

      case 'KING_STRIKE': {
        const c = this.sqCenter(ev.kingSq);
        this.spawnBurst(c.x, c.y, 18, '#cc3f3b', '#1d1c1a', 190);
        this.spawnRing(c.x, c.y, c.tile * 0.72, '#cc3f3b', 0.32);
        this.popups.push({
          x: c.x,
          y: c.y - c.tile * 0.18,
          text: `-${ev.damage}`,
          color: '#ffdedd',
          stroke: '#8a1e1b',
          life: 0,
          maxLife: 0.78,
          size: 24,
        });
        this.triggerShake(3.2 + ev.damage * 0.8, 0.2);
        break;
      }

      case 'KING_SHATTER': {
        const c = this.sqCenter(ev.at);
        this.spawnBurst(c.x, c.y, 26, '#1d1c1a', '#cc3f3b', 235);
        this.spawnRing(c.x, c.y, c.tile * 1.15, '#dda938', 0.55);
        this.spawnRing(c.x, c.y, c.tile * 0.78, '#cc3f3b', 0.4);
        // Hand-drawn golden crown shards spinning outward
        for (let i = 0; i < 12; i++) {
          const ang = (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.3;
          const spd = 90 + Math.random() * 145;
          this.shards.push({
            x: c.x,
            y: c.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 40,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 14,
            size: 5 + Math.random() * 5,
            color: i % 3 === 0 ? '#cc3f3b' : '#dda938',
            life: 0,
            maxLife: 0.72,
          });
        }
        this.popups.push({
          x: c.x,
          y: c.y - c.tile * 0.2,
          text: 'CHECKMATE',
          color: '#f7f3e7',
          stroke: '#1c1b19',
          life: 0,
          maxLife: 0.75,
          size: 22,
        });
        this.triggerShake(7.5, 0.36);
        break;
      }

      case 'CHECK': {
        const c = this.sqCenter(ev.kingSq);
        this.spawnRing(c.x, c.y, c.tile * 0.62, '#d65536', 0.34);
        this.popups.push({
          x: c.x,
          y: c.y - c.tile * 0.25,
          text: 'CHECK',
          color: '#ffe5dc',
          stroke: '#8c2914',
          life: 0,
          maxLife: 0.75,
          size: 16,
        });
        break;
      }

      case 'CROWN_BREAK': {
        const c = this.sqCenter(ev.at);
        this.spawnBurst(c.x, c.y, 14, '#dda938', '#f7f3e7', 165);
        this.spawnRing(c.x, c.y, c.tile * 0.6, '#dda938', 0.3);
        this.triggerShake(3.5, 0.15);
        break;
      }

      case 'DEPLOY': {
        const c = this.sqCenter(ev.at);
        this.spawnRing(c.x, c.y, c.tile * 0.45, 'rgba(30,29,27,0.45)', 0.24);
        break;
      }

      case 'FREEZE': {
        const tileW = this.w / COLS;
        const tileH = this.h / ROWS;
        const drawCol = this.perspective === 'black' ? COLS - 2 - ev.col : ev.col;
        const drawRow = this.perspective === 'black' ? ev.row : ROWS - 2 - ev.row;
        const cx = (drawCol + 1) * tileW;
        const cy = (drawRow + 1) * tileH;
        this.spawnBurst(cx, cy, 16, '#5cb8e4', '#e8f8ff', 150);
        this.spawnRing(cx, cy, tileW * 1.15, '#5cb8e4', 0.35);
        break;
      }

      case 'SWAP': {
        const a = this.sqCenter(ev.sqA);
        const b = this.sqCenter(ev.sqB);
        this.spawnRing(a.x, a.y, a.tile * 0.58, '#9378e6', 0.3);
        this.spawnRing(b.x, b.y, b.tile * 0.58, '#9378e6', 0.3);
        // Opposing curved spiral trails matching piece arcs
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (const dir of [1, -1]) {
          for (let i = 1; i <= 7; i++) {
            const t = i / 8;
            const bow = Math.sin(t * Math.PI) * a.tile * 0.45 * dir;
            this.particles.push({
              x: a.x + dx * t + nx * bow,
              y: a.y + dy * t + ny * bow,
              vx: nx * bow * 0.6,
              vy: ny * bow * 0.6,
              r: 2.4 + Math.random() * 1.8,
              color: dir === 1 ? '#9378e6' : '#e7e0ff',
              life: 0,
              maxLife: 0.32,
            });
          }
        }
        break;
      }

      case 'PROMOTE': {
        const c = this.sqCenter(ev.at);
        this.spawnBurst(c.x, c.y, 18, '#dda938', '#fff4cf', 170);
        this.spawnRing(c.x, c.y, c.tile * 0.72, '#dda938', 0.38);
        this.triggerShake(3.2, 0.14);
        break;
      }

      case 'HASTE': {
        const c = this.sqCenter(ev.at);
        this.spawnBurst(c.x, c.y, 14, '#4eb87a', '#d7ffe8', 150);
        this.spawnRing(c.x, c.y, c.tile * 0.68, '#4eb87a', 0.3);
        this.popups.push({
          x: c.x,
          y: c.y - c.tile * 0.22,
          text: 'READY!',
          color: '#d8ffe8',
          stroke: '#174f30',
          life: 0,
          maxLife: 0.65,
          size: 16,
        });
        break;
      }

      case 'BARRICADE': {
        const c = this.sqCenter(ev.at);
        this.spawnBurst(c.x, c.y, 12, '#9c968b', '#524e47', 110);
        this.spawnRing(c.x, c.y, c.tile * 0.56, '#8b867d', 0.26);
        break;
      }

      case 'BARRICADE_BREAK': {
        const c = this.sqCenter(ev.at);
        this.spawnBurst(c.x, c.y, 14, '#7d786f', '#c7c1b6', 160);
        this.spawnRing(c.x, c.y, c.tile * 0.62, '#9c968b', 0.28);
        for (let i = 0; i < 8; i++) {
          const ang = (Math.PI * 2 * i) / 8 + (Math.random() - 0.5) * 0.4;
          const spd = 75 + Math.random() * 110;
          this.shards.push({
            x: c.x,
            y: c.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 55,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 14,
            size: 4 + Math.random() * 4,
            color: i % 2 === 0 ? '#8b867d' : '#625e57',
            life: 0,
            maxLife: 0.45,
          });
        }
        this.triggerShake(2.8, 0.12);
        break;
      }

      case 'CASTLE': {
        const k = this.sqCenter(ev.kingSq);
        const r = this.sqCenter(ev.rookSq);
        this.spawnRing(k.x, k.y, k.tile * 0.62, '#dda938', 0.32);
        this.spawnRing(r.x, r.y, r.tile * 0.56, '#f4f1e6', 0.28);
        this.spawnBurst(k.x, k.y, 10, '#dda938', '#f4f1e6', 120);
        break;
      }

      case 'RUNE_TELEGRAPH': {
        const c = this.sqCenter(ev.at);
        this.spawnRing(c.x, c.y, c.tile * 0.62, 'rgba(185,110,232,0.75)', 0.45);
        break;
      }

      case 'RUNE_SPAWN': {
        const c = this.sqCenter(ev.at);
        this.spawnRing(c.x, c.y, c.tile * 0.78, '#9b4dca', 0.42);
        this.spawnBurst(c.x, c.y, 8, '#b96ee8', '#f0d4ff', 95);
        break;
      }

      case 'RUNE_CLAIM': {
        const c = this.sqCenter(ev.at);
        this.spawnBurst(c.x, c.y, 18, '#9b4dca', '#f0d4ff', 175);
        this.spawnRing(c.x, c.y, c.tile * 0.78, '#b96ee8', 0.36);
        this.popups.push({
          x: c.x,
          y: c.y - c.tile * 0.2,
          text: `+${ev.bonus} ELIXIR`,
          color: '#f2d9ff',
          stroke: '#4f1e70',
          life: 0,
          maxLife: 0.85,
          size: 17,
        });
        break;
      }

      case 'DODGE': {
        const c = this.sqCenter(ev.at);
        this.spawnRing(c.x, c.y, c.tile * 0.48, 'rgba(240,237,228,0.55)', 0.22);
        break;
      }

      case 'OVERTIME':
      case 'SUDDEN_DEATH':
        this.triggerShake(4.2, 0.22);
        break;

      default:
        break;
    }
  }

  spawnBurst(x, y, count, colorA, colorB, speed) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const spd = speed * (0.4 + Math.random() * 0.75);
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 2 + Math.random() * 3.2,
        color: i % 3 === 0 ? colorB : colorA,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.22,
      });
    }
  }

  spawnRing(x, y, maxR, color, maxLife) {
    this.rings.push({ x, y, maxR, color, life: 0, maxLife });
  }

  tick(dt, isOvertime = false) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);

    // Subtle sparse golden chalk sparks drifting along Center Line in Overtime
    if (isOvertime) {
      this.emberAccum += dt;
      if (this.emberAccum >= 0.11) {
        this.emberAccum = 0;
        this.particles.push({
          x: Math.random() * this.w,
          y: this.h * 0.5 + (Math.random() - 0.5) * 4,
          vx: (Math.random() - 0.5) * 14,
          vy: (Math.random() > 0.5 ? -1 : 1) * (16 + Math.random() * 20),
          r: 1.6 + Math.random() * 1.4,
          color: Math.random() > 0.35 ? '#dda938' : '#f4e4b5',
          life: 0,
          maxLife: 0.55 + Math.random() * 0.35,
        });
      }
    }

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      const frac = this.shakeTime / 0.24;
      const ox = (Math.random() * 2 - 1) * this.shakeAmp * Math.min(1, frac);
      const oy = (Math.random() * 2 - 1) * this.shakeAmp * Math.min(1, frac);
      this.frameEl.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
      if (this.shakeTime === 0) {
        this.shakeAmp = 0;
        this.frameEl.style.transform = '';
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      if (r.life >= r.maxLife) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = r.life / r.maxLife;
      const radius = r.maxR * (0.25 + 0.75 * (1 - (1 - t) * (1 - t)));
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.82;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1.2, 3.4 * (1 - t));
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.91;
      p.vy *= 0.91;
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 - t * 0.55), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Crown shatter polygon shards
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.shards.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 320 * dt;
      s.rot += s.vrot * dt;
      const t = s.life / s.maxLife;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      ctx.fillStyle = s.color;
      ctx.strokeStyle = '#1b1a18';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -s.size);
      ctx.lineTo(s.size * 0.8, s.size * 0.7);
      ctx.lineTo(-s.size * 0.7, s.size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life += dt;
      if (pop.life >= pop.maxLife) {
        this.popups.splice(i, 1);
        continue;
      }
      const t = pop.life / pop.maxLife;
      const y = pop.y - t * 28;
      ctx.save();
      ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;
      ctx.font = `700 ${pop.size}px "Patrick Hand", Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pop.stroke;
      ctx.strokeText(pop.text, pop.x, y);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, y);
      ctx.restore();
    }
  }
}
