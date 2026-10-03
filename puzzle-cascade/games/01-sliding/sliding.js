/**
 * Game 1 - Sliding Tile Puzzle (3D). Tap a tile in line with the gap to
 * slide it (and any tiles between) into the gap. 3x3 / 4x4 / 5x5 tiers.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const SIZE_BY_DIFFICULTY = { easy: 3, medium: 4, hard: 5 };
// Generous thresholds - an optimal 3x3 solve is ~20-30 moves, but most
// people need two to three times that.
const MOVE_STAR_THRESHOLDS = { 3: [60, 120], 4: [150, 300], 5: [300, 550] };
const SPACING = 1.12;
const TILE_SIZE = 1;
const TILE_DEPTH = 0.3;

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

function glow(mesh, color = 0xffffff) {
  if (!mesh || !mesh.material || !mesh.material.emissive) return;
  mesh.material.emissive.set(color);
  mesh.material.emissiveIntensity = 0.7;
  tween(mesh.material, { emissiveIntensity: 0 }, 900, Easing.inOutQuad);
  tween(mesh.scale, { x: 1.18, y: 1.18, z: 1.18 }, 160, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
}

function starsForMoves(size, moves) {
  const [three, two] = MOVE_STAR_THRESHOLDS[size];
  if (moves <= three) return 3;
  if (moves <= two) return 2;
  return 1;
}

function buildSolved(size) {
  const arr = [];
  for (let i = 1; i < size * size; i++) arr.push(i);
  arr.push(0);
  return arr;
}

function neighborIndices(i, size) {
  const row = Math.floor(i / size), col = i % size;
  const out = [];
  if (row > 0) out.push(i - size);
  if (row < size - 1) out.push(i + size);
  if (col > 0) out.push(i - 1);
  if (col < size - 1) out.push(i + 1);
  return out;
}

function goalIndex(v, size) { return v === 0 ? size * size - 1 : v - 1; }
function totalDistance(arr, size) {
  let s = 0;
  arr.forEach((v, i) => {
    if (v === 0) return;
    const g = goalIndex(v, size);
    s += Math.abs(Math.floor(i / size) - Math.floor(g / size)) + Math.abs((i % size) - (g % size));
  });
  return s;
}

// Random walk of the gap from the solved state - always solvable.
function shuffledBoard(size) {
  let arr;
  do {
    arr = buildSolved(size);
    let blank = arr.indexOf(0);
    let lastBlank = -1;
    for (let i = 0; i < size * size * 30; i++) {
      const neighbors = neighborIndices(blank, size).filter((n) => n !== lastBlank);
      const next = neighbors[Math.floor(Math.random() * neighbors.length)];
      [arr[blank], arr[next]] = [arr[next], arr[blank]];
      lastBlank = blank; blank = next;
    }
  } while (totalDistance(arr, size) < size * 2);
  return arr;
}

function cellXY(idx, size) {
  const row = Math.floor(idx / size), col = idx % size;
  const half = (size - 1) / 2;
  return { x: (col - half) * SPACING, y: (half - row) * SPACING };
}

function mount(container, difficulty, api) {
  const size = SIZE_BY_DIFFICULTY[difficulty] || 3;
  const life = lifecycle();
  let board = shuffledBoard(size);
  let moves = 0;
  let solved = false;
  let busy = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sl-meta"><span>Moves: <span id="sl-moves">0</span></span></div>
    <div class="pc-canvas3d" id="sl-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a tile next to the gap</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#sl-canvas');
  const movesEl = wrap.querySelector('#sl-moves');

  const stage = createStage(canvasHost, { distance: size * 2.6 });
  const span = (size - 1) * SPACING + TILE_SIZE;
  fitBoard(stage, canvasHost, span, span, { bottom: 50 });

  const meshByValue = new Map();
  for (let idx = 0; idx < board.length; idx++) {
    const val = board[idx];
    if (val === 0) continue;
    const { x, y } = cellXY(idx, size);
    const mesh = makeTile({ w: TILE_SIZE, h: TILE_SIZE, depth: TILE_DEPTH, radius: 0.16, color: PALETTE[val % PALETTE.length] });
    mesh.position.set(x, y, 0);
    mesh.userData.value = val;
    mesh.material.envMapIntensity = 0.35; // tame reflections so big tiles don't bloom out
    applyLabel(mesh, String(val), { size: 128, w: 0.62, h: 0.62 });
    stage.world.add(mesh);
    popIn(mesh, { delay: idx * 18 });
    meshByValue.set(val, mesh);
  }

  // Map a touch to a cell from the table plane (gaps between tiles count as
  // the nearest cell) - far more forgiving than raycasting the tile meshes.
  function cellFromPoint(clientX, clientY) {
    const pt = stage.pickPlane(clientX, clientY, 0);
    if (!pt) return -1;
    const half = (size - 1) / 2;
    const col = Math.round(pt.x / SPACING + half), row = Math.round(half - pt.y / SPACING);
    if (row < 0 || row >= size || col < 0 || col >= size) return -1;
    return row * size + col;
  }

  function onPointerDown(e) {
    if (busy || solved) return;
    const idx = cellFromPoint(e.clientX, e.clientY);
    if (idx < 0) return;
    tryMove(idx);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function tryMove(idx) {
    const blank = board.indexOf(0);
    if (idx === blank) return;
    const br = Math.floor(blank / size), bc = blank % size, r = Math.floor(idx / size), c = idx % size;
    if (br !== r && bc !== c) {
      api.sound.error();
      api.ui.shake(canvasHost);
      return;
    }
    // Slide every tile between the tapped one and the gap, one step each.
    const step = br === r ? (c > bc ? 1 : -1) : (r > br ? size : -size);
    let gap = blank;
    const moved = [];
    while (gap !== idx) {
      const next = gap + step;
      const val = board[next];
      board[gap] = val; board[next] = 0;
      moved.push({ val, to: gap });
      gap = next;
    }
    moves += moved.length;
    movesEl.textContent = moves;
    api.sound.move();
    busy = true;
    let pending = moved.length;
    moved.forEach(({ val, to }) => {
      const target = cellXY(to, size);
      tween(meshByValue.get(val).position, { x: target.x, y: target.y }, 160, Easing.outCubic, () => {
        if (--pending > 0 || life.dead) return;
        busy = false;
        checkWin();
      });
    });
  }

  function checkWin() {
    const target = buildSolved(size);
    if (board.every((v, i) => v === target[i])) {
      solved = true;
      api.ui.burstFromElement(canvasHost);
      const stars = starsForMoves(size, moves);
      life.later(() => api.win(stars, { moves }), 250);
    }
  }

  function hint() {
    if (solved) { api.ui.toast(`${api.playerName}, you already solved it!`); return; }
    if (busy) return;
    const blank = board.indexOf(0);
    let best = null, bestScore = Infinity;
    neighborIndices(blank, size).forEach((n) => {
      const copy = board.slice();
      [copy[blank], copy[n]] = [copy[n], copy[blank]];
      const score = totalDistance(copy, size) + Math.random() * 0.5;
      if (score < bestScore) { bestScore = score; best = n; }
    });
    if (best === null) return;
    glow(meshByValue.get(board[best]));
    api.ui.toast(`${api.playerName}, try that glowing tile!`);
  }

  // If the app clears the stage without calling unmount, clean up anyway.
  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('sliding', { mount });
