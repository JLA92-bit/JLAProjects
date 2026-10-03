/**
 * Game 19 - Color Flood (3D). Tap a color swatch to flood-fill outward
 * from the top-left corner, capturing every touching same-or-new-colored
 * cell. Turn the whole board into one color within the move limit.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 8, colors: 4, moves: 20 },
  medium: { size: 12, colors: 5, moves: 26 },
  hard: { size: 14, colors: 6, moves: 30 },
};
const CELL = 0.72;

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function neighbors(r, c, size) {
  const out = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < size - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < size - 1) out.push([r, c + 1]);
  return out;
}

function floodRegion(grid, size, color) {
  const seen = Array.from({ length: size }, () => Array(size).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  const region = [[0, 0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(r, c, size)) {
      if (seen[nr][nc]) continue;
      if (grid[nr][nc] === grid[0][0]) { seen[nr][nc] = true; region.push([nr, nc]); stack.push([nr, nc]); }
    }
  }
  return region;
}

// Greedy solve (always take the color that grows the flood most) - used to
// guarantee the move limit is actually reachable for this exact board.
function greedySolveLength(grid, size, numColors) {
  const g = grid.map((row) => row.slice());
  for (let step = 0; step < 200; step++) {
    const region = floodRegion(g, size, g[0][0]);
    if (region.length === size * size) return step;
    let best = -1, bestGain = -1;
    for (let colorIdx = 0; colorIdx < numColors; colorIdx++) {
      if (colorIdx === g[0][0]) continue;
      const t = g.map((row) => row.slice());
      region.forEach(([r, c]) => { t[r][c] = colorIdx; });
      const gain = floodRegion(t, size, colorIdx).length;
      if (gain > bestGain) { bestGain = gain; best = colorIdx; }
    }
    region.forEach(([r, c]) => { g[r][c] = best; });
  }
  return 200;
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
  const size = cfg.size, numColors = cfg.colors;
  const colors = PALETTE.slice(0, numColors);
  let grid = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.floor(Math.random() * numColors)));
  let movesUsed = 0, finished = false;
  const timers = makeTimers();
  // Never hand out a board that can't be cleared within the limit: allow at
  // least the greedy solution plus a little slack for non-optimal play.
  const moveLimit = Math.max(cfg.moves, greedySolveLength(grid, size, numColors) + 3);

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="cf-meta">Moves left: <span id="cf-moves">${moveLimit}</span></div>
    <div class="pc-canvas3d" id="cf-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a color - the flood grows from the top-left corner</span></div>
    </div>
    <div class="cf-palette" id="cf-palette"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#cf-canvas');
  const movesEl = wrap.querySelector('#cf-moves');
  const paletteEl = wrap.querySelector('#cf-palette');

  colors.forEach((hex, i) => {
    const btn = document.createElement('button');
    btn.className = 'cf-swatch';
    btn.type = 'button';
    btn.setAttribute('aria-label', `Color ${i + 1}`);
    btn.style.background = '#' + hex.toString(16).padStart(6, '0');
    btn.addEventListener('click', () => applyColor(i));
    paletteEl.appendChild(btn);
  });

  const boardHalf = (size * CELL) / 2 + 0.15;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, boardHalf, boardHalf + 0.6) });

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size);
      const mesh = makeTile({ w: CELL * 0.94, h: CELL * 0.94, depth: 0.18, radius: 0.08, color: colors[grid[r][c]] });
      mesh.position.set(x, y, 0);
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 3 });
      row.push(mesh);
    }
    meshes.push(row);
  }

  // little white ring marking the corner the flood grows from
  const startRing = new THREE.Mesh(new THREE.TorusGeometry(CELL * 0.3, 0.05, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const corner = cellXY(0, 0, size);
  startRing.position.set(corner.x, corner.y, 0.16);
  stage.world.add(startRing);

  function markCurrentSwatch() {
    [...paletteEl.children].forEach((el, i) => el.classList.toggle('is-current', i === grid[0][0]));
  }
  markCurrentSwatch();

  function applyColor(colorIdx) {
    if (finished) return;
    if (colorIdx === grid[0][0]) { api.sound.error(); api.ui.toast(`${api.playerName}, that's already the corner color - pick a different one!`); return; }
    const region = floodRegion(grid, size, grid[0][0]);
    region.forEach(([r, c]) => { grid[r][c] = colorIdx; });
    movesUsed++;
    movesEl.textContent = Math.max(0, moveLimit - movesUsed);
    api.sound.click();
    markCurrentSwatch();
    region.forEach(([r, c], i) => {
      const mesh = meshes[r][c];
      timers.later(() => {
        mesh.material.color.set(colors[colorIdx]);
        tween(mesh.scale, { x: 1.1, y: 1.1 }, 100, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1 }, 120, Easing.outCubic));
      }, Math.min(i, 40) * 6);
    });
    timers.later(checkEnd, 260);
  }

  function isSolved() {
    const first = grid[0][0];
    return grid.every((row) => row.every((v) => v === first));
  }

  function checkEnd() {
    if (finished) return;
    if (isSolved()) {
      finished = true;
      const remaining = moveLimit - movesUsed;
      const stars = remaining >= moveLimit * 0.35 ? 3 : remaining >= moveLimit * 0.12 ? 2 : 1;
      api.ui.burstFromElement(canvasHost);
      timers.later(() => api.win(stars, { movesUsed }), 250);
    } else if (movesUsed >= moveLimit) {
      finished = true;
      api.sound.error();
      api.ui.shake(canvasHost);
      timers.later(() => api.lose('you ran out of moves! Try again.'), 250);
    }
  }

  function hint() {
    if (finished) return;
    // greedy: pick the color that captures the most new cells this move
    let best = -1, bestGain = -1;
    for (let colorIdx = 0; colorIdx < numColors; colorIdx++) {
      if (colorIdx === grid[0][0]) continue;
      const testGrid = grid.map((row) => row.slice());
      const region = floodRegion(testGrid, size, testGrid[0][0]);
      const before = region.length;
      region.forEach(([r, c]) => { testGrid[r][c] = colorIdx; });
      const after = floodRegion(testGrid, size, colorIdx).length;
      const gain = after - before;
      if (gain > bestGain) { bestGain = gain; best = colorIdx; }
    }
    if (best === -1) return;
    const swatch = paletteEl.children[best];
    swatch.classList.add('cf-swatch--hint');
    timers.later(() => swatch.classList.remove('cf-swatch--hint'), 1200);
    api.ui.toast(`${api.playerName}, try that glowing color!`);
  }

  return {
    unmount: () => {
      finished = true;
      timers.clear();
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('colorflood', { mount: guardMount(mount, { retry: true }) });
