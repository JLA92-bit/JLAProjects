/**
 * Game 14 - Minesweeper (3D). Tap to reveal a cell; a number tells you how
 * many mines touch it. Press and hold a cell (or toggle Flag Mode) to mark
 * a suspected mine. Clear every safe cell to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 6, mines: 5 },
  medium: { size: 8, mines: 10 },
  hard: { size: 9, mines: 15 }, // 9 columns keeps cells finger-sized on a phone
};
const CELL = 0.98;
const HIDDEN_COLOR = 0x5b3fc0;
const LONG_PRESS_MS = 420;
const REVEALED_COLOR = 0x1a0c30;
const FLAG_COLOR = 0xffd93d;
const MINE_COLOR = 0xff5c5c;
const NUM_COLORS = ['#ffffff', '#3f8efc', '#23d18b', '#ffd93d', '#a259ff', '#ff9f43', '#17c3b2', '#ff4d8d', '#ffffff'];

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

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

function glow(mesh, color = 0xffffff) {
  if (!mesh || !mesh.material || !mesh.material.emissive) return;
  mesh.material.emissive.set(color);
  mesh.material.emissiveIntensity = 0.7;
  tween(mesh.material, { emissiveIntensity: 0 }, 900, Easing.inOutQuad);
  tween(mesh.scale, { x: 1.18, y: 1.18, z: 1.18 }, 160, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
}


function neighbors(r, c, size) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push([nr, nc]);
  }
  return out;
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
  let mines = null; // Set of "r,c" built after first tap so it's never lost immediately
  let counts = null;
  let revealed = Array.from({ length: size }, () => Array(size).fill(false));
  let flagged = Array.from({ length: size }, () => Array(size).fill(false));
  let finished = false, firstTap = true, flagMode = false;
  const totalSafe = size * size - cfg.mines;
  let revealedCount = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ms-meta">
      <span>Mines: ${cfg.mines}</span>
      <button type="button" class="pc-chip ms-flagtoggle" id="ms-flagtoggle">🚩 Flag Mode: Off</button>
    </div>
    <div class="pc-canvas3d" id="ms-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap to reveal - hold to flag a mine</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ms-canvas');
  const flagBtn = wrap.querySelector('#ms-flagtoggle');

  flagBtn.addEventListener('click', () => {
    flagMode = !flagMode;
    flagBtn.textContent = `🚩 Flag Mode: ${flagMode ? 'On' : 'Off'}`;
    flagBtn.classList.toggle('is-active', flagMode);
    api.sound.click();
  });

  const stage = createStage(canvasHost, { distance: size * 2.5 });
  fitBoard(stage, canvasHost, size * CELL, size * CELL, { pad: 8, bottom: 50 });

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size);
      const mesh = makeTile({ w: 0.88, h: 0.88, depth: 0.22, radius: 0.12, color: HIDDEN_COLOR });
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 10 });
      row.push(mesh);
    }
    meshes.push(row);
  }

  function placeMines(safeR, safeC) {
    mines = Array.from({ length: size }, () => Array(size).fill(false));
    let placed = 0;
    const forbidden = new Set(neighbors(safeR, safeC, size).map(([r, c]) => `${r},${c}`));
    forbidden.add(`${safeR},${safeC}`);
    while (placed < cfg.mines) {
      const r = Math.floor(Math.random() * size), c = Math.floor(Math.random() * size);
      if (mines[r][c] || forbidden.has(`${r},${c}`)) continue;
      mines[r][c] = true;
      placed++;
    }
    counts = Array.from({ length: size }, () => Array(size).fill(0));
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      counts[r][c] = neighbors(r, c, size).filter(([nr, nc]) => mines[nr][nc]).length;
    }
  }

  function revealCell(r, c) {
    if (revealed[r][c] || flagged[r][c]) return;
    revealed[r][c] = true;
    revealedCount++;
    const mesh = meshes[r][c];
    mesh.material.color.set(REVEALED_COLOR);
    tween(mesh.scale, { z: 0.5 }, 120, Easing.outCubic, () => tween(mesh.scale, { z: 1 }, 120, Easing.outCubic));
    clearFlagLabel(mesh);
    if (counts[r][c] > 0) {
      applyLabel(mesh, String(counts[r][c]), { size: 128, w: 0.66, h: 0.66, color: NUM_COLORS[counts[r][c]] });
    } else {
      neighbors(r, c, size).forEach(([nr, nc]) => revealCell(nr, nc));
    }
  }

  function checkWin() {
    if (revealedCount >= totalSafe) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const elapsed = api.elapsedMs();
      const stars = elapsed <= 30000 + size * 5000 ? 3 : elapsed <= 60000 + size * 10000 ? 2 : 1;
      life.later(() => api.win(stars, { elapsed }), 300);
    }
  }

  function loseGame(r, c) {
    finished = true;
    for (let rr = 0; rr < size; rr++) for (let cc = 0; cc < size; cc++) {
      if (mines[rr][cc]) {
        const m = meshes[rr][cc];
        m.material.color.set(MINE_COLOR);
        m.material.emissive.set(MINE_COLOR);
        m.material.emissiveIntensity = (rr === r && cc === c) ? 1 : 0.5;
        clearFlagLabel(m);
        applyLabel(m, '💣', { size: 128, w: 0.7, h: 0.7 });
      }
    }
    api.sound.error();
    api.ui.shake(canvasHost);
    life.later(() => {
      api.lose('you hit a mine! Try again.');
      showRetry(canvasHost, restart);
    }, 400);
  }

  function clearFlagLabel(mesh) {
    const lbl = mesh.userData.flagLabel;
    if (!lbl) return;
    mesh.remove(lbl);
    lbl.geometry.dispose();
    if (lbl.material.map) lbl.material.map.dispose();
    lbl.material.dispose();
    mesh.userData.flagLabel = null;
  }

  function toggleFlag(r, c) {
    if (revealed[r][c]) return;
    flagged[r][c] = !flagged[r][c];
    const mesh = meshes[r][c];
    mesh.material.color.set(flagged[r][c] ? FLAG_COLOR : HIDDEN_COLOR);
    if (flagged[r][c]) mesh.userData.flagLabel = applyLabel(mesh, '🚩', { size: 128, w: 0.7, h: 0.7 });
    else clearFlagLabel(mesh);
    tween(mesh.scale, { x: 1.1, y: 1.1 }, 100, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1 }, 120, Easing.outCubic));
    api.sound.select();
  }

  function revealAt(r, c) {
    if (revealed[r][c]) return;
    if (flagged[r][c]) {
      api.sound.error();
      api.ui.shake(canvasHost);
      api.ui.toast('That square is flagged - hold it to remove the flag.');
      return;
    }
    if (firstTap) { placeMines(r, c); firstTap = false; }
    if (mines[r][c]) { loseGame(r, c); return; }
    api.sound.click();
    revealCell(r, c);
    checkWin();
  }

  // Tap = reveal (or flag in Flag Mode); press and hold = flag.
  const canvas = stage.renderer.domElement;
  let press = null;
  function cellAt(clientX, clientY) {
    const pt = stage.pickPlane(clientX, clientY, 0);
    if (!pt) return null;
    const half = (size - 1) / 2;
    const c = Math.round(pt.x / CELL + half), r = Math.round(half - pt.y / CELL);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return { r, c };
  }
  function onPointerDown(e) {
    if (finished || press) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    press = { ...cell, id: e.pointerId, x: e.clientX, y: e.clientY, held: false };
    const p = press;
    p.timer = life.later(() => {
      if (press !== p || finished) return;
      p.held = true;
      toggleFlag(p.r, p.c);
    }, LONG_PRESS_MS);
  }
  function onPointerMove(e) {
    if (!press || e.pointerId !== press.id) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 18) { clearTimeout(press.timer); press = null; }
  }
  function onPointerUp(e) {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    clearTimeout(p.timer);
    if (p.held || finished) return;
    if (flagMode) toggleFlag(p.r, p.c); else revealAt(p.r, p.c);
  }
  function onPointerCancel() { if (press) { clearTimeout(press.timer); press = null; } }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);
  function onContextMenu(e) { e.preventDefault(); }

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, this board is done - ${revealedCount >= totalSafe ? 'great job!' : 'tap Try again!'}`); return; }
    if (firstTap) { api.ui.toast(`${api.playerName}, tap any cell to start!`); return; }
    // Basic constraint deduction: for a revealed numbered cell, if flagged
    // neighbors already satisfy its count, any other unrevealed neighbor is safe.
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!revealed[r][c] || counts[r][c] === 0) continue;
      const ns = neighbors(r, c, size);
      const flaggedCount = ns.filter(([nr, nc]) => flagged[nr][nc]).length;
      if (flaggedCount === counts[r][c]) {
        const safe = ns.find(([nr, nc]) => !revealed[nr][nc] && !flagged[nr][nc]);
        if (safe) {
          glow(meshes[safe[0]][safe[1]]);
          api.ui.toast(`${api.playerName}, that glowing square is safe!`);
          return;
        }
      }
    }
    // Fallback: any random safe unrevealed cell
    const safeCells = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!revealed[r][c] && !flagged[r][c] && !mines[r][c]) safeCells.push([r, c]);
    }
    if (safeCells.length) {
      const [r, c] = safeCells[Math.floor(Math.random() * safeCells.length)];
      glow(meshes[r][c]);
      api.ui.toast(`${api.playerName}, that glowing square is safe!`);
    }
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('minesweeper', { mount });
