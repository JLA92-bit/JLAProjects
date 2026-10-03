/**
 * Game 7 - Number Merge (3D, 2048-style). Swipe/arrow keys slide every
 * tile; equal tiles merge. Reach the target value to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  // Reaching N takes at least ~N/2.3 moves (each move spawns a 2 or a 4),
  // so star thresholds sit comfortably above that floor.
  easy: { size: 4, target: 128, moveStars: [85, 130] },
  medium: { size: 4, target: 512, moveStars: [300, 420] },
  hard: { size: 5, target: 1024, moveStars: [600, 850] },
};
const SPACING = 1.08;
const TILE_COLORS = {
  2: 0xfff3d6, 4: 0xffe6a8, 8: 0xffd93d, 16: 0xff9f43, 32: 0xff7043, 64: 0xff4d8d,
  128: 0xd6216b, 256: 0xa259ff, 512: 0x6a2dd6, 1024: 0x3f8efc, 2048: 0x23d18b, 4096: 0x17c3b2,
};
function colorFor(v) { return TILE_COLORS[v] || 0x241436; }

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

function starsForMoves(moveStars, moves) { if (moves <= moveStars[0]) return 3; if (moves <= moveStars[1]) return 2; return 1; }

let uid = 1;

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const size = cfg.size;
  const life = lifecycle();
  let board = Array.from({ length: size }, () => Array(size).fill(null));
  let moves = 0, busy = false, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="n2-meta"><span>Moves: <span id="n2-moves">0</span></span><span>Target: ${cfg.target}</span></div>
    <div class="pc-canvas3d" id="n2-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Swipe to slide every tile</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#n2-canvas');
  const movesEl = wrap.querySelector('#n2-moves');

  const stage = createStage(canvasHost, { distance: size * 2.5 });
  fitBoard(stage, canvasHost, (size - 1) * SPACING + 1, (size - 1) * SPACING + 1, { bottom: 50 });
  const half = (size - 1) / 2;
  function cellXY(r, c) { return { x: (c - half) * SPACING, y: (half - r) * SPACING }; }

  // faint background cells
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const { x, y } = cellXY(r, c);
    const bg = makeTile({ w: 1, h: 1, depth: 0.06, radius: 0.14, color: 0x000000, opacity: 0.18 });
    bg.position.set(x, y, -0.05);
    bg.castShadow = false;
    stage.world.add(bg);
  }

  function spawnTile(r, c, value) {
    const { x, y } = cellXY(r, c);
    const mesh = makeTile({ w: 0.94, h: 0.94, depth: 0.3, radius: 0.16, color: colorFor(value) });
    mesh.material.envMapIntensity = 0.35; // pale low-value tiles otherwise bloom out
    mesh.position.set(x, y, 0);
    applyLabel(mesh, String(value), { size: 110, w: 0.6, h: 0.6, color: value <= 4 ? '#5b4636' : '#ffffff' });
    stage.world.add(mesh);
    popIn(mesh, { duration: 220 });
    const tile = { id: uid++, value, mesh, r, c };
    board[r][c] = tile;
    return tile;
  }

  function disposeMesh(mesh) {
    mesh.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); } });
  }

  function relabel(tile) {
    const old = tile.mesh.children[0];
    if (old) { tile.mesh.remove(old); disposeMesh(old); }
    applyLabel(tile.mesh, String(tile.value), { size: 110, w: 0.6, h: 0.6, color: tile.value <= 4 ? '#5b4636' : '#ffffff' });
    tile.mesh.material.color.set(colorFor(tile.value));
  }

  function randomEmptyCell() {
    const empties = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!board[r][c]) empties.push([r, c]);
    if (!empties.length) return null;
    return empties[Math.floor(Math.random() * empties.length)];
  }

  spawnTile(...randomEmptyCell(), 2);
  spawnTile(...randomEmptyCell(), 2);

  function getLine(dir, k) {
    const coords = [];
    for (let i = 0; i < size; i++) {
      if (dir === 'left') coords.push([k, i]);
      else if (dir === 'right') coords.push([k, size - 1 - i]);
      else if (dir === 'up') coords.push([i, k]);
      else coords.push([size - 1 - i, k]);
    }
    return coords;
  }

  function move(dir) {
    if (busy || finished) return;
    let moved = false;
    const arrivals = []; // {tile, r, c}
    const removals = []; // meshes to remove after tween
    const winners = []; // tiles whose value doubled (need relabel + pop after)

    for (let k = 0; k < size; k++) {
      const coords = getLine(dir, k);
      const tiles = coords.map(([r, c]) => board[r][c]).filter(Boolean);
      const merged = [];
      let i = 0;
      while (i < tiles.length) {
        if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
          merged.push({ value: tiles[i].value * 2, sources: [tiles[i], tiles[i + 1]], mergedFlag: true });
          i += 2;
        } else {
          merged.push({ value: tiles[i].value, sources: [tiles[i]], mergedFlag: false });
          i += 1;
        }
      }
      merged.forEach((entry, idx) => {
        const [r, c] = coords[idx];
        entry.sources.forEach((src) => {
          if (src.r !== r || src.c !== c) moved = true;
          arrivals.push({ tile: src, r, c });
        });
        if (entry.mergedFlag) {
          winners.push({ keep: entry.sources[0], drop: entry.sources[1], value: entry.value, r, c });
          moved = true;
        }
      });
    }

    if (!moved) { api.sound.error(); api.ui.shake(canvasHost); return; }
    api.sound.move();
    busy = true;
    board = Array.from({ length: size }, () => Array(size).fill(null));

    let pending = arrivals.length;
    arrivals.forEach(({ tile, r, c }) => {
      const target = cellXY(r, c);
      tween(tile.mesh.position, { x: target.x, y: target.y }, 130, Easing.outCubic, () => {
        if (life.dead) return;
        pending--;
        if (pending === 0) finishMove(winners, arrivals, moves + 1);
      });
    });
  }

  function finishMove(winners, arrivals, moveCount) {
    const droppedIds = new Set(winners.map((w) => w.drop.id));
    winners.forEach(({ keep, drop, value, r, c }) => {
      stage.world.remove(drop.mesh);
      disposeMesh(drop.mesh);
      keep.value = value; keep.r = r; keep.c = c;
      relabel(keep);
      tween(keep.mesh.scale, { x: 1.25, y: 1.25, z: 1.25 }, 100, Easing.outCubic, () => tween(keep.mesh.scale, { x: 1, y: 1, z: 1 }, 120, Easing.outBack));
      api.sound.match();
    });
    arrivals.forEach(({ tile, r, c }) => {
      if (droppedIds.has(tile.id)) return;
      tile.r = r; tile.c = c;
      board[r][c] = tile;
    });

    moves = moveCount;
    movesEl.textContent = moves;

    const empty = randomEmptyCell();
    if (empty) {
      const value = Math.random() < 0.85 ? 2 : 4;
      spawnTile(empty[0], empty[1], value);
    }

    busy = false;
    checkEnd();
  }

  function checkEnd() {
    let maxVal = 0;
    const tiles = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c]) { tiles.push(board[r][c]); maxVal = Math.max(maxVal, board[r][c].value); }
    if (maxVal >= cfg.target) {
      finished = true;
      const stars = starsForMoves(cfg.moveStars, moves);
      api.ui.burstFromElement(canvasHost);
      life.later(() => api.win(stars, { moves }), 250);
      return;
    }
    const full = tiles.length === size * size;
    if (full) {
      let canMerge = false;
      for (let r = 0; r < size && !canMerge; r++) for (let c = 0; c < size && !canMerge; c++) {
        const t = board[r][c];
        if (!t) continue;
        if (c + 1 < size && board[r][c + 1] && board[r][c + 1].value === t.value) canMerge = true;
        if (r + 1 < size && board[r + 1][c] && board[r + 1][c].value === t.value) canMerge = true;
      }
      if (!canMerge) clearSmallTiles();
    }
  }

  // Forgiving "game over": instead of ending the run, sweep away the
  // smallest tiles so there is room to keep going.
  function clearSmallTiles() {
    busy = true;
    api.sound.error();
    api.ui.toast(`${api.playerName}, the board filled up - clearing the small tiles so you can keep going!`);
    const values = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) values.push(board[r][c].value);
    values.sort((a, b) => a - b);
    const cutoff = values[Math.min(values.length - 1, Math.floor(values.length / 3))];
    life.later(() => {
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        const t = board[r][c];
        if (t && t.value <= cutoff && t.value < values[values.length - 1]) {
          board[r][c] = null;
          tween(t.mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 200, Easing.inOutQuad, () => { stage.world.remove(t.mesh); disposeMesh(t.mesh); });
        }
      }
      busy = false;
    }, 700);
  }

  function onKey(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  }
  window.addEventListener('keydown', onKey);

  // Swipe: the move fires as soon as the finger has travelled far enough,
  // no need to lift first.
  let touchStart = null;
  const canvas = stage.renderer.domElement;
  function onPointerDown(e) {
    touchStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onPointerMove(e) {
    if (!touchStart || e.pointerId !== touchStart.id) return;
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    if (Math.abs(dx) < 28 && Math.abs(dy) < 28) return;
    touchStart = null;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }
  function onPointerUp() { touchStart = null; }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function wouldMove(dir) {
    let moved = false;
    for (let k = 0; k < size; k++) {
      const coords = getLine(dir, k);
      const tiles = coords.map(([r, c]) => board[r][c]).filter(Boolean);
      let i = 0, idx = 0;
      while (i < tiles.length) {
        const mergedHere = i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value;
        const [tr, tc] = coords[idx];
        if (tiles[i].r !== tr || tiles[i].c !== tc) moved = true;
        if (mergedHere) { moved = true; i += 2; } else { i += 1; }
        idx++;
      }
    }
    return moved;
  }

  function causesMerge(dir) {
    for (let k = 0; k < size; k++) {
      const coords = getLine(dir, k);
      const tiles = coords.map(([r, c]) => board[r][c]).filter(Boolean);
      for (let i = 0; i < tiles.length - 1; i++) if (tiles[i].value === tiles[i + 1].value) return true;
    }
    return false;
  }

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, you reached ${cfg.target}!`); return; }
    if (busy) return;
    const candidates = ['up', 'down', 'left', 'right'].filter(wouldMove);
    if (!candidates.length) { api.ui.toast(`${api.playerName}, hang on - making room!`); return; }
    const best = candidates.find(causesMerge) || candidates[0];
    const arrow = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' }[best];
    api.ui.toast(`${api.playerName}, swipe ${best}! ${arrow}`);
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('merge2048', { mount });
