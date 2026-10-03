/**
 * Game 20 - Mini Sudoku (3D). Tap a cell, then tap a number below to fill
 * it in. Every row, column, and box must contain each number exactly once.
 * 4x4 on easy, 6x6 on medium, full 9x9 on hard.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 4, boxW: 2, boxH: 2, clueFrac: 0.6 },
  medium: { size: 6, boxW: 3, boxH: 2, clueFrac: 0.5 },
  hard: { size: 9, boxW: 3, boxH: 3, clueFrac: 0.42 },
};
const GIVEN_COLOR = 0x3f2a7c;
const EMPTY_COLOR = 0x1a0c30;
const SELECTED_COLOR = 0x5c3ea8;
const ERROR_COLOR = 0x8a2a3a;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function makeSolvedGrid(size, boxW, boxH) {
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  const nums = Array.from({ length: size }, (_, i) => i + 1);

  function valid(r, c, v) {
    for (let i = 0; i < size; i++) if (grid[r][i] === v || grid[i][c] === v) return false;
    const br = Math.floor(r / boxH) * boxH, bc = Math.floor(c / boxW) * boxW;
    for (let rr = br; rr < br + boxH; rr++) for (let cc = bc; cc < bc + boxW; cc++) if (grid[rr][cc] === v) return false;
    return true;
  }

  function fill(pos) {
    if (pos === size * size) return true;
    const r = Math.floor(pos / size), c = pos % size;
    for (const v of shuffle(nums)) {
      if (valid(r, c, v)) {
        grid[r][c] = v;
        if (fill(pos + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }
  fill(0);
  return grid;
}

// Counts solutions of a partially filled grid (0 = empty), stopping at
// `limit`. Used to make sure every puzzle has exactly one answer, so a
// correct-by-the-rules entry is never marked as a mistake.
function countSolutions(grid, size, boxW, boxH, limit = 2) {
  const g = grid.map((row) => row.slice());
  let count = 0;
  function ok(r, c, v) {
    for (let i = 0; i < size; i++) if (g[r][i] === v || g[i][c] === v) return false;
    const br = Math.floor(r / boxH) * boxH, bc = Math.floor(c / boxW) * boxW;
    for (let rr = br; rr < br + boxH; rr++) for (let cc = bc; cc < bc + boxW; cc++) if (g[rr][cc] === v) return false;
    return true;
  }
  function solve() {
    // most-constrained empty cell first keeps this fast even on 9x9
    let bestR = -1, bestC = -1, bestOpts = null;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (g[r][c]) continue;
      const opts = [];
      for (let v = 1; v <= size; v++) if (ok(r, c, v)) opts.push(v);
      if (!bestOpts || opts.length < bestOpts.length) { bestR = r; bestC = c; bestOpts = opts; if (!opts.length) return; }
    }
    if (!bestOpts) { count++; return; }
    for (const v of bestOpts) {
      g[bestR][bestC] = v;
      solve();
      g[bestR][bestC] = 0;
      if (count >= limit) return;
    }
  }
  solve();
  return count;
}

// Box-aware layout: a small extra gap between boxes makes them read clearly.
const BOX_GAP = 0.1;
function cellXY(r, c, size, cell, boxW, boxH) {
  const half = (size - 1) / 2;
  const boxesX = size / boxW, boxesY = size / boxH;
  const gx = (Math.floor(c / boxW) - (boxesX - 1) / 2) * BOX_GAP;
  const gy = (Math.floor(r / boxH) - (boxesY - 1) / 2) * BOX_GAP;
  return { x: (c - half) * cell + gx, y: (half - r) * cell - gy };
}

/* ---------- lifecycle + framing helpers (kept local so this file stays self-contained) ---------- */

// World half-height per unit of stage distance (matches three-stage.js).
const VIEW_SCALE = 0.42;

// Pick a camera distance that fits a board of the given world half-extents
// into the canvas's real aspect ratio, with a safety margin so a later
// resize (address bar, rotated phone, wrapped status text) never crops it.
function fitDistance(host, halfW, halfH, margin = 1.08) {
  const w = host.clientWidth || 340, h = host.clientHeight || 520;
  const aspect = Math.max(0.35, Math.min(2.2, w / h));
  return (Math.max(halfH, halfW / aspect) * margin) / VIEW_SCALE;
}

// Wraps a raw mount so nothing can call api.win/api.lose after unmount,
// hint() never throws, and (optionally) a lost round offers an in-place
// "Try again" button instead of leaving a dead board on screen.
function guardMount(rawMount, { retry = false } = {}) {
  return function mount(container, difficulty, api) {
    let cur = null;
    function start() {
      const inst = { alive: true };
      const safeApi = Object.assign({}, api, {
        win: (...args) => { if (inst.alive) { inst.alive = false; api.win(...args); } },
        lose: (msg) => {
          if (!inst.alive) return;
          inst.alive = false;
          api.lose(msg);
          if (retry) showRetry(inst);
        },
      });
      const res = rawMount(container, difficulty, safeApi);
      cur = {
        inst,
        el: container.lastElementChild,
        unmount: typeof res === 'function' ? res : (res && res.unmount) || (() => {}),
        hint: res && typeof res === 'object' ? res.hint : null,
      };
    }
    function stop() {
      if (!cur) return;
      const c = cur;
      cur = null;
      c.inst.alive = false;
      try { c.unmount(); } catch (e) { console.warn(e); }
    }
    function showRetry(inst) {
      if (!cur || cur.inst !== inst || !cur.el) return;
      const host = cur.el.querySelector('.pc-canvas3d') || cur.el;
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;left:0;right:0;bottom:56px;display:flex;justify-content:center;z-index:6;pointer-events:none;';
      box.innerHTML = '<button type="button" class="pc-btn pc-btn--green" style="pointer-events:auto;min-height:48px;">\u{1F501} Try again</button>';
      box.querySelector('button').addEventListener('click', () => {
        if (!cur || cur.inst !== inst) return;
        api.sound.click();
        stop();
        start();
      });
      host.appendChild(box);
    }
    start();
    return {
      unmount: () => stop(),
      hint: () => {
        if (!cur || !cur.hint) return;
        try { cur.hint(); } catch (e) { console.warn(e); }
      },
    };
  };
}

// setTimeout that is cancelled in bulk on unmount.
function makeTimers() {
  const ids = new Set();
  return {
    later(fn, ms) {
      const id = setTimeout(() => { ids.delete(id); fn(); }, ms);
      ids.add(id);
      return id;
    },
    clear() { ids.forEach(clearTimeout); ids.clear(); },
  };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size, boxW = cfg.boxW, boxH = cfg.boxH;
  const CELL = size <= 4 ? 1.0 : size <= 6 ? 0.85 : 0.62;

  const solution = makeSolvedGrid(size, boxW, boxH);
  const given = solution.map((row) => row.slice());
  const clueCount = Math.round(size * size * cfg.clueFrac);
  // Dig holes one at a time, only keeping a removal if the puzzle still has
  // a single solution.
  const puzzle = solution.map((row) => row.slice());
  let filled = size * size;
  for (const idx of shuffle(Array.from({ length: size * size }, (_, i) => i))) {
    if (filled <= clueCount) break;
    const r = Math.floor(idx / size), c = idx % size;
    const keep = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle, size, boxW, boxH, 2) !== 1) puzzle[r][c] = keep;
    else filled--;
  }
  const isGiven = puzzle.map((row) => row.map((v) => v !== 0));
  const board = puzzle.map((row) => row.slice());

  let selected = null;
  let mistakes = 0, finished = false;
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="su-meta">Mistakes: <span id="su-mistakes">0</span></div>
    <div class="pc-canvas3d" id="su-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a cell, then tap a number</span></div>
    </div>
    <div class="su-numpad" id="su-numpad"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#su-canvas');
  const mistakesEl = wrap.querySelector('#su-mistakes');
  const numpadEl = wrap.querySelector('#su-numpad');

  for (let n = 1; n <= size; n++) {
    const btn = document.createElement('button');
    btn.className = 'su-numbtn';
    btn.type = 'button';
    btn.textContent = n;
    btn.addEventListener('click', () => placeNumber(n));
    numpadEl.appendChild(btn);
  }
  const eraseBtn = document.createElement('button');
  eraseBtn.className = 'su-numbtn su-numbtn--erase';
  eraseBtn.type = 'button';
  eraseBtn.setAttribute('aria-label', 'Erase');
  eraseBtn.textContent = '\u2715';
  // one row for small boards, two even rows for 6x6 / 9x9
  const padCount = size + 1;
  numpadEl.style.gridTemplateColumns = `repeat(${padCount <= 5 ? padCount : Math.ceil(padCount / 2)}, minmax(44px, 60px))`;
  eraseBtn.addEventListener('click', () => placeNumber(0));
  numpadEl.appendChild(eraseBtn);

  const halfW = (size * CELL + (size / boxW - 1) * BOX_GAP) / 2 + 0.15;
  const halfH = (size * CELL + (size / boxH - 1) * BOX_GAP) / 2 + 0.15;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, halfW, halfH + 0.5) });

  // one soft backing plate per box so the boxes read as groups
  for (let br = 0; br < size; br += boxH) {
    for (let bc = 0; bc < size; bc += boxW) {
      const a = cellXY(br, bc, size, CELL, boxW, boxH), b = cellXY(br + boxH - 1, bc + boxW - 1, size, CELL, boxW, boxH);
      const plate = makeTile({ w: boxW * CELL + 0.04, h: boxH * CELL + 0.04, depth: 0.06, radius: 0.1, color: 0x6a4bc4, roughness: 0.8 });
      plate.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, -0.12);
      stage.world.add(plate);
    }
  }

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size, CELL, boxW, boxH);
      const mesh = makeTile({ w: CELL * 0.92, h: CELL * 0.92, depth: 0.16, radius: 0.08, color: isGiven[r][c] ? GIVEN_COLOR : EMPTY_COLOR });
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 4 });
      if (isGiven[r][c]) applyLabel(mesh, String(board[r][c]), { size: 96, w: CELL * 0.55, h: CELL * 0.55, color: '#ffd93d' });
      row.push(mesh);
    }
    meshes.push(row);
  }

  function refreshCell(r, c) {
    const mesh = meshes[r][c];
    const plane = mesh.children[0];
    if (plane) { plane.geometry.dispose(); plane.material.map && plane.material.map.dispose(); plane.material.dispose(); mesh.remove(plane); }
    if (board[r][c] !== 0) applyLabel(mesh, String(board[r][c]), { size: 96, w: CELL * 0.55, h: CELL * 0.55, color: isGiven[r][c] ? '#ffd93d' : '#ffffff' });
  }

  function setSelected(r, c) {
    if (selected) meshes[selected.r][selected.c].material.color.set(isGiven[selected.r][selected.c] ? GIVEN_COLOR : EMPTY_COLOR);
    selected = { r, c };
    meshes[r][c].material.color.set(SELECTED_COLOR);
  }

  // Nearest cell to the tap, so the thin gaps between tiles still count.
  function cellAt(clientX, clientY) {
    const p = stage.pickPlane(clientX, clientY, 0);
    if (!p) return null;
    let best = null, bestD = Infinity;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const q = cellXY(r, c, size, CELL, boxW, boxH);
      const d = Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));
      if (d < bestD) { bestD = d; best = { r, c }; }
    }
    return bestD <= CELL * 0.62 ? best : null;
  }

  function onPointerDown(e) {
    if (finished) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    setSelected(cell.r, cell.c);
    api.sound.click();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function placeNumber(n) {
    if (finished) return;
    if (!selected) { api.sound.error(); api.ui.toast('Tap a square on the board first.'); return; }
    const { r, c } = selected;
    if (isGiven[r][c]) { api.sound.error(); api.ui.shake(canvasHost); api.ui.toast('That number is part of the puzzle - pick an empty square.'); return; }
    if (n === 0) { board[r][c] = 0; refreshCell(r, c); api.sound.click(); return; }
    const correct = n === solution[r][c];
    board[r][c] = n;
    refreshCell(r, c);
    if (!correct) {
      mistakes++;
      mistakesEl.textContent = mistakes;
      api.sound.error();
      const mesh = meshes[r][c];
      mesh.material.color.set(ERROR_COLOR);
      api.ui.shake(canvasHost);
      timers.later(() => {
        if (board[r][c] !== n) return; // already replaced by another entry
        board[r][c] = 0;
        refreshCell(r, c);
        const isSel = selected && selected.r === r && selected.c === c;
        mesh.material.color.set(isSel ? SELECTED_COLOR : EMPTY_COLOR);
      }, 450);
      return;
    }
    api.sound.click();
    tween(meshes[r][c].scale, { x: 1.08, y: 1.08 }, 120, Easing.outBack, () => tween(meshes[r][c].scale, { x: 1, y: 1 }, 130, Easing.outCubic));
    checkWin();
  }

  function checkWin() {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c] !== solution[r][c]) return;
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    timers.later(() => api.win(stars, { mistakes }), 300);
  }

  function hint() {
    if (finished) return;
    const empties = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c] === 0) empties.push([r, c]);
    if (!empties.length) return;
    const [r, c] = selected && board[selected.r][selected.c] === 0 ? [selected.r, selected.c] : empties[Math.floor(Math.random() * empties.length)];
    setSelected(r, c);
    board[r][c] = solution[r][c];
    refreshCell(r, c);
    meshes[r][c].material.color.set(SELECTED_COLOR);
    tween(meshes[r][c].scale, { x: 1.25, y: 1.25 }, 180, Easing.outBack, () => tween(meshes[r][c].scale, { x: 1, y: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, here's one filled in for you!`);
    checkWin();
  }

  return {
    unmount: () => {
      finished = true;
      timers.clear();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('sudoku', { mount: guardMount(mount) });
