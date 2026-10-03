/**
 * Game 12 - Whack-a-Mole (3D). Moles pop up out of holes; tap them
 * before they duck back down. Beat the clock to reach the target score.
 * Hard difficulty adds bomb moles (red) that cost points if hit.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 3, timeMs: 30000, target: 12, spawnMs: [900, 1400], upMs: 1100, bombChance: 0 },
  medium: { size: 4, timeMs: 30000, target: 22, spawnMs: [650, 1000], upMs: 850, bombChance: 0.12 },
  hard: { size: 5, timeMs: 30000, target: 32, spawnMs: [450, 750], upMs: 620, bombChance: 0.22 },
};
const CELL = 1.05;
const HOLE_COLOR = 0x1a0c30;
const MOLE_COLOR = 0x8a5a2b;
const BOMB_COLOR = 0xff5c5c;

/* ---- per-game helpers (kept local so the module stands alone) ---- */

// Zoom/pan the ortho camera so a w x h world box centered on (cx, cy) fits
// the canvas with pixel padding (more at the bottom for the overlay chip).
// Re-checked every frame so it follows resizes and rotation.
function fitBoard(stage, host, w, h, { cx = 0, cy = 0, pad = 12, top = 12, bottom = 12 } = {}) {
  const cam = stage.camera;
  let lastW = 0, lastH = 0;
  function apply() {
    const cw = host.clientWidth, ch = host.clientHeight;
    if (!cw || !ch || (cw === lastW && ch === lastH)) return;
    lastW = cw; lastH = ch;
    const unitPx = ch / (cam.top - cam.bottom);
    const fit = Math.max(1, Math.min((cw - 2 * pad) / w, (ch - top - bottom) / h));
    cam.zoom = fit / unitPx;
    cam.position.x = cx;
    cam.position.y = cy - (bottom - top) / 2 / fit;
    cam.updateProjectionMatrix();
  }
  apply();
  return stage.onTick(apply);
}

// Timers that can never fire after unmount.
function lifecycle() {
  const timers = new Set();
  const life = {
    dead: false,
    later(fn, ms) { const id = setTimeout(() => { timers.delete(id); if (!life.dead) fn(); }, ms); timers.add(id); return id; },
    kill() { life.dead = true; timers.forEach(clearTimeout); timers.clear(); },
  };
  return life;
}

// In-canvas "Try again" button shown after a loss.
function showRetry(host, onRetry) {
  host.querySelectorAll('.pc-overlay-bottom').forEach((el) => { el.hidden = true; });
  const bar = document.createElement('div');
  bar.className = 'pc-overlay-bottom';
  bar.innerHTML = '<button class="pc-btn pc-btn--blue" type="button">🔁 Try again</button>';
  bar.querySelector('button').addEventListener('click', onRetry, { once: true });
  host.appendChild(bar);
}

// The round ends as soon as the target is hit, so stars reward speed.
function starsForTimeLeft(remainingMs, totalMs) {
  if (remainingMs >= totalMs * 0.3) return 3;
  if (remainingMs >= totalMs * 0.12) return 2;
  return 1;
}

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function mount(container, difficulty, api) {
  let round = null;
  const start = () => { round = mountRound(container, difficulty, api, restart); };
  const restart = () => { api.sound.click(); if (round) round.unmount(); start(); };
  start();
  return { unmount: () => round && round.unmount(), hint: () => round && round.hint() };
}

function mountRound(container, difficulty, api, restart) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const life = lifecycle();
  const size = cfg.size;
  let score = 0, remainingMs = cfg.timeMs, finished = false;
  const active = new Map(); // idx -> { mesh, isBomb, timeoutId }

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="wm-meta">
      <span>Score: <span id="wm-score">0</span> / ${cfg.target}</span>
      <span id="wm-time">${Math.ceil(remainingMs / 1000)}s</span>
    </div>
    <div class="pc-canvas3d" id="wm-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">${cfg.bombChance ? 'Tap the moles - avoid red bombs!' : 'Tap the moles as they pop up!'}</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#wm-canvas');
  const scoreEl = wrap.querySelector('#wm-score');
  const timeEl = wrap.querySelector('#wm-time');

  const stage = createStage(canvasHost, { distance: size * 2.5 });
  fitBoard(stage, canvasHost, size * CELL, size * CELL, { pad: 16, bottom: 50 });

  const holes = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size);
      const hole = makeTile({ w: 0.86, h: 0.86, depth: 0.16, radius: 0.4, color: HOLE_COLOR, roughness: 0.9 });
      hole.position.set(x, y, -0.05);
      stage.world.add(hole);
      popIn(hole, { delay: (r * size + c) * 20 });
      holes.push({ r, c, x, y, mesh: hole });
    }
  }

  function spawnMole() {
    if (finished) return;
    const free = holes.filter((h) => !active.has(h.r * size + h.c));
    if (free.length) {
      const hole = free[Math.floor(Math.random() * free.length)];
      const idx = hole.r * size + hole.c;
      const isBomb = Math.random() < cfg.bombChance;
      const mesh = makeTile({ w: 0.7, h: 0.7, depth: 0.5, radius: 0.32, color: isBomb ? BOMB_COLOR : MOLE_COLOR, emissive: isBomb ? BOMB_COLOR : 0x000000, emissiveIntensity: isBomb ? 0.4 : 0 });
      mesh.position.set(hole.x, hole.y, -0.5);
      mesh.userData = { idx };
      stage.world.add(mesh);
      tween(mesh.position, { z: 0.15 }, 160, Easing.outBack);
      const timeoutId = life.later(() => duckMole(idx, false), cfg.upMs);
      active.set(idx, { mesh, isBomb, timeoutId });
    }
    const [lo, hi] = cfg.spawnMs;
    life.later(spawnMole, lo + Math.random() * (hi - lo));
  }

  function duckMole(idx, hit) {
    const entry = active.get(idx);
    if (!entry) return;
    clearTimeout(entry.timeoutId);
    active.delete(idx);
    tween(entry.mesh.position, { z: -0.5 }, hit ? 90 : 160, Easing.outCubic, () => {
      stage.world.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    });
  }

  function onPointerDown(e) {
    if (finished) return;
    // Generous: any touch within the hole's square counts.
    const pt = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!pt) return;
    const half = (size - 1) / 2;
    const c = Math.round(pt.x / CELL + half), r = Math.round(half - pt.y / CELL);
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    const idx = r * size + c;
    const entry = active.get(idx);
    if (!entry) return;
    if (entry.isBomb) {
      score = Math.max(0, score - 3);
      api.sound.error();
      api.ui.shake(canvasHost);
    } else {
      score += 1;
      api.sound.click();
      api.ui.burstFromElement(canvasHost, { count: 10 });
    }
    scoreEl.textContent = score;
    duckMole(idx, true);
    if (score >= cfg.target) endGame(true);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  const timerId = setInterval(() => {
    if (finished || life.dead) return;
    remainingMs -= 200;
    if (remainingMs <= 0) {
      remainingMs = 0;
      timeEl.textContent = '0s';
      endGame(score >= cfg.target);
      return;
    }
    timeEl.textContent = Math.ceil(remainingMs / 1000) + 's';
  }, 200);

  function endGame(won) {
    if (finished) return;
    finished = true;
    clearInterval(timerId);
    active.forEach((entry, idx) => duckMole(idx, false));
    if (won) {
      const stars = starsForTimeLeft(remainingMs, cfg.timeMs);
      api.ui.burstFromElement(canvasHost);
      life.later(() => api.win(stars, { score }), 300);
    } else {
      life.later(() => {
        api.lose(`you scored ${score}, but needed ${cfg.target}. Try again!`);
        showRetry(canvasHost, restart);
      }, 200);
    }
  }

  life.later(spawnMole, 600);

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, this round is over!`); return; }
    const goodMole = [...active.entries()].find(([, e]) => !e.isBomb);
    if (!goodMole) { api.ui.toast(`${api.playerName}, wait for a mole to pop up!`); return; }
    const [, entry] = goodMole;
    tween(entry.mesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 150, Easing.outBack, () => tween(entry.mesh.scale, { x: 1, y: 1, z: 1 }, 150, Easing.outCubic));
    api.ui.toast(`${api.playerName}, whack that one!`);
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    finished = true;
    clearInterval(timerId);
    stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('whackmole', { mount });
