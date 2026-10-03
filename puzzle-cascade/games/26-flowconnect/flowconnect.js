/**
 * Game 26 - Flow Connect (3D). Drag from a colored dot to its matching
 * dot to lay a pipe; pipes can't cross each other. Connect every pair
 * to win - fill the whole board for full marks.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 5, colorsCount: 4 },
  medium: { size: 6, colorsCount: 5 },
  hard: { size: 7, colorsCount: 7 },
};
const CELL = 1.0;
const EMPTY_COLOR = 0x2a1f4d;

function key(r, c) { return r + ',' + c; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Builds a solvable puzzle: grow a random self-avoiding walk per color,
// then greedily extend every path outward to soak up leftover free cells
// so the finished board is (usually) fully covered by some valid solution.
function generatePuzzle(size, colorsCount) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const owner = Array.from({ length: size }, () => Array(size).fill(-1));
    const paths = [];
    let ok = true;
    for (let idx = 0; idx < colorsCount; idx++) {
      const free = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (owner[r][c] === -1) free.push([r, c]);
      if (!free.length) { ok = false; break; }
      const start = free[Math.floor(Math.random() * free.length)];
      const targetLen = 2 + Math.floor(Math.random() * Math.max(1, Math.floor((size * size) / colorsCount)));
      const path = [start];
      owner[start[0]][start[1]] = idx;
      while (path.length < targetLen) {
        const [r, c] = path[path.length - 1];
        const options = shuffle(DIRS4).map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && rr < size && cc >= 0 && cc < size && owner[rr][cc] === -1);
        if (!options.length) break;
        const next = options[0];
        owner[next[0]][next[1]] = idx;
        path.push(next);
      }
      if (path.length < 2) { ok = false; break; }
      paths.push(path);
    }
    if (!ok) continue;
    // greedily extend paths at either end into remaining free cells
    let progress = true;
    while (progress) {
      progress = false;
      for (let idx = 0; idx < paths.length; idx++) {
        const path = paths[idx];
        for (const end of [0, path.length - 1]) {
          const [r, c] = path[end];
          const options = shuffle(DIRS4).map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && rr < size && cc >= 0 && cc < size && owner[rr][cc] === -1);
          if (options.length) {
            const next = options[0];
            owner[next[0]][next[1]] = idx;
            if (end === 0) path.unshift(next); else path.push(next);
            progress = true;
          }
        }
      }
    }
    return { paths, size };
  }
  // fallback: minimal 2-cell paths
  const owner = Array.from({ length: size }, () => Array(size).fill(-1));
  const paths = [];
  const free = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) free.push([r, c]);
  const shuffled = shuffle(free);
  for (let idx = 0; idx < colorsCount && shuffled.length >= 2; idx++) {
    paths.push([shuffled.pop(), shuffled.pop()]);
  }
  return { paths, size };
}

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
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
  const size = cfg.size;
  const { paths: solutionPaths } = generatePuzzle(size, cfg.colorsCount);
  const numColors = solutionPaths.length;
  const endpoints = solutionPaths.map((p) => [p[0], p[p.length - 1]]);
  const colorOf = (idx) => PALETTE[idx % PALETTE.length];

  const cellOwner = Array.from({ length: size }, () => Array(size).fill(-1));
  const isEndpoint = Array.from({ length: size }, () => Array(size).fill(-1));
  endpoints.forEach((pair, idx) => { pair.forEach(([r, c]) => { isEndpoint[r][c] = idx; cellOwner[r][c] = idx; }); });
  // playerPaths[color] = ordered [[r,c],...] starting at one of its dots, or null
  const playerPaths = Array.from({ length: numColors }, () => null);
  let dragging = null; // { color, pointerId }
  let finished = false, resets = 0;
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="fc-meta"><span id="fc-status">Drag from a dot to the dot of the same color</span></div>
    <div class="pc-canvas3d" id="fc-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip" id="fc-chip">Connected: 0 / ${numColors}</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#fc-canvas');
  const statusEl = wrap.querySelector('#fc-status');
  const chipEl = wrap.querySelector('#fc-chip');

  const boardHalf = (size * CELL) / 2 + 0.1;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, boardHalf, boardHalf + 0.9) });

  const cellMeshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size);
      const mesh = makeTile({ w: CELL * 0.92, h: CELL * 0.92, depth: 0.14, radius: 0.14, color: EMPTY_COLOR, roughness: 0.7 });
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 8, duration: 180 });
      row.push(mesh);
    }
    cellMeshes.push(row);
  }

  endpoints.forEach((pair, idx) => {
    pair.forEach(([r, c]) => {
      const { x, y } = cellXY(r, c, size);
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 24), new THREE.MeshPhysicalMaterial({ color: colorOf(idx), emissive: colorOf(idx), emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.15, clearcoat: 0.6 }));
      dot.rotation.x = Math.PI / 2;
      dot.position.set(x, y, 0.16);
      dot.castShadow = true;
      stage.world.add(dot);
    });
  });

  function refreshCellVisual(r, c) {
    const owner = cellOwner[r][c];
    const mesh = cellMeshes[r][c];
    if (owner === -1) { mesh.material.color.set(EMPTY_COLOR); return; }
    // pipe cells are a lighter tint than the solid dots so the dots stay visible
    mesh.material.color.set(colorOf(owner)).lerp(new THREE.Color(0x2a1f4d), isEndpoint[r][c] === owner ? 0.55 : 0.25);
  }

  function isConnected(idx) {
    const p = playerPaths[idx];
    if (!p || p.length < 2) return false;
    const last = p[p.length - 1];
    return isEndpoint[last[0]][last[1]] === idx && (last[0] !== p[0][0] || last[1] !== p[0][1]);
  }

  // Remove cells from index `from` onward of a color's path.
  function truncate(idx, from) {
    const p = playerPaths[idx];
    if (!p) return;
    p.splice(from).forEach(([r, c]) => {
      if (isEndpoint[r][c] !== idx) { cellOwner[r][c] = -1; refreshCellVisual(r, c); }
    });
    if (p.length === 0) playerPaths[idx] = null;
  }

  function coverage() {
    let filled = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (cellOwner[r][c] !== -1) filled++;
    return filled / (size * size);
  }

  function updateChip() {
    const done = playerPaths.filter((_, i) => isConnected(i)).length;
    chipEl.textContent = `Connected: ${done} / ${numColors}`;
  }

  function checkWin() {
    updateChip();
    if (!playerPaths.every((_, i) => isConnected(i))) return;
    finished = true;
    dragging = null;
    statusEl.textContent = 'All connected!';
    api.ui.burstFromElement(canvasHost);
    const cov = coverage();
    const stars = cov >= 0.97 ? 3 : cov >= 0.75 ? 2 : 1;
    timers.later(() => api.win(stars, { coverage: Math.round(cov * 100), resets }), 300);
  }

  function cellAt(clientX, clientY) {
    const p = stage.pickPlane(clientX, clientY, 0);
    if (!p) return null;
    const half = (size - 1) / 2;
    const c = Math.round(p.x / CELL + half), r = Math.round(half - p.y / CELL);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return { r, c };
  }

  function startDrag(r, c, pointerId) {
    const dotColor = isEndpoint[r][c];
    if (dotColor !== -1) {
      // pressing a dot starts that color fresh from this dot
      truncate(dotColor, 0);
      playerPaths[dotColor] = [[r, c]];
      dragging = { color: dotColor, pointerId };
      resets++;
      api.sound.click();
      updateChip();
      return true;
    }
    const owner = cellOwner[r][c];
    if (owner !== -1 && playerPaths[owner]) {
      // pressing a pipe resumes drawing from that point
      const i = playerPaths[owner].findIndex(([pr, pc]) => pr === r && pc === c);
      if (i >= 0) {
        truncate(owner, i + 1);
        dragging = { color: owner, pointerId };
        api.sound.click();
        updateChip();
        return true;
      }
    }
    api.sound.error();
    api.ui.toast('Start from a colored dot (or the end of a pipe).');
    return false;
  }

  function stepTo(r, c) {
    const color = dragging.color;
    const path = playerPaths[color];
    const last = path[path.length - 1];
    if (last[0] === r && last[1] === c) return;
    // finished pipes don't grow past their second dot
    if (isConnected(color)) {
      const back = path.findIndex(([pr, pc]) => pr === r && pc === c);
      if (back >= 0) truncate(color, back + 1);
      return;
    }
    // stepping back onto your own pipe rewinds it to that point
    const back = path.findIndex(([pr, pc]) => pr === r && pc === c);
    if (back >= 0) { truncate(color, back + 1); return; }
    const dot = isEndpoint[r][c];
    if (dot !== -1 && dot !== color) return; // can't run through another color's dot
    const owner = cellOwner[r][c];
    if (owner !== -1 && owner !== color) {
      // crossing another pipe cuts it back to just before this cell
      const other = playerPaths[owner];
      const i = other ? other.findIndex(([pr, pc]) => pr === r && pc === c) : -1;
      if (i >= 0) truncate(owner, i);
    }
    path.push([r, c]);
    cellOwner[r][c] = color;
    refreshCellVisual(r, c);
    if (dot === color) { api.sound.move(); checkWin(); }
  }

  // Walk one cell at a time toward the finger so a fast swipe never skips
  // cells (which would otherwise break the pipe).
  function extendDrag(r, c) {
    if (!dragging || finished) return;
    let guard = 0;
    while (dragging && guard++ < size * 2) {
      const path = playerPaths[dragging.color];
      if (!path) return;
      const [lr, lc] = path[path.length - 1];
      if (lr === r && lc === c) return;
      const dr = r - lr, dc = c - lc;
      const next = Math.abs(dr) >= Math.abs(dc) ? [lr + Math.sign(dr), lc] : [lr, lc + Math.sign(dc)];
      const before = path.length;
      const beforeLast = path[path.length - 1];
      stepTo(next[0], next[1]);
      const after = playerPaths[dragging.color];
      if (!after || after.length === before && after[after.length - 1] === beforeLast) return; // blocked
      if (finished) return;
    }
  }

  const canvas = stage.renderer.domElement;
  function onPointerDown(e) {
    if (finished || dragging) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    if (startDrag(cell.r, cell.c, e.pointerId)) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }
  function onPointerMove(e) {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell) extendDrag(cell.r, cell.c);
  }
  function onPointerUp(e) {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const color = dragging.color;
    dragging = null;
    const p = playerPaths[color];
    if (p && p.length === 1) { truncate(color, 1); }
    updateChip();
    checkWin();
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function hint() {
    if (finished) return;
    for (let idx = 0; idx < numColors; idx++) {
      if (isConnected(idx)) continue;
      const sol = solutionPaths[idx];
      // first cell of the known solution route not yet painted this color
      const target = sol.find(([r, c]) => cellOwner[r][c] !== idx) || sol[sol.length - 1];
      const mesh = cellMeshes[target[0]][target[1]];
      mesh.material.emissive.set(colorOf(idx));
      mesh.material.emissiveIntensity = 0.6;
      tween(mesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
      timers.later(() => { mesh.material.emissiveIntensity = 0; }, 1400);
      api.ui.toast(`${api.playerName}, route that color through the glowing square!`);
      return;
    }
    api.ui.toast(`${api.playerName}, every pipe is connected!`);
  }

  return {
    unmount: () => {
      finished = true;
      dragging = null;
      timers.clear();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('flowconnect', { mount: guardMount(mount) });
