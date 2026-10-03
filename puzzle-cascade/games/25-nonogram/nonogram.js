/**
 * Game 25 - Nonogram / Picross (3D). Row and column clues tell you how
 * many filled cells appear in each run. Tap to fill, tap again to mark
 * an X, tap a third time to clear (drag to paint several cells at once).
 * Any grid that matches every clue wins.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 5, fillChance: 0.55, timeStars: [50000, 100000] },
  medium: { size: 8, fillChance: 0.5, timeStars: [110000, 200000] },
  hard: { size: 10, fillChance: 0.48, timeStars: [170000, 300000] },
};
const CELL = 0.82;
const FILL_COLOR = 0x241436;
const EMPTY_COLOR = 0xc9bfe0;
const MARK_COLOR = 0xe7b8d0;

function lineClues(bools) {
  const groups = [];
  let run = 0;
  bools.forEach((v) => { if (v) run++; else if (run > 0) { groups.push(run); run = 0; } });
  if (run > 0) groups.push(run);
  return groups.length ? groups : [0];
}

function generateSolution(size, fillChance) {
  let grid;
  for (let attempt = 0; attempt < 30; attempt++) {
    grid = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.random() < fillChance));
    const total = grid.flat().filter(Boolean).length;
    if (total > size && total < size * size - size) break;
  }
  return grid;
}

function computeLeft(groups, length) {
  if (groups.length === 1 && groups[0] === 0) return [];
  let pos = 0; const starts = [];
  groups.forEach((g) => { starts.push(pos); pos += g + 1; });
  return starts;
}
function computeRight(groups, length) {
  if (groups.length === 1 && groups[0] === 0) return [];
  let pos = length; const starts = new Array(groups.length);
  for (let i = groups.length - 1; i >= 0; i--) { pos -= groups[i]; starts[i] = pos; pos -= 1; }
  return starts;
}
function overlapCells(groups, length) {
  if (groups.length === 1 && groups[0] === 0) return [];
  const left = computeLeft(groups, length), right = computeRight(groups, length);
  const filled = [];
  groups.forEach((g, i) => {
    const start = right[i], end = left[i] + g - 1;
    for (let x = start; x <= end; x++) if (x >= 0 && x < length) filled.push(x);
  });
  return filled;
}

function makeClueTexture(lines, { vertical = false, aspect = 1, color = '#ffffff' } = {}) {
  // Canvas pixel dimensions mirror the target plane's aspect ratio so text
  // never gets stretched or squashed when mapped onto a non-square plane.
  const base = 128;
  const w = vertical ? base : Math.round(base * aspect);
  const h = vertical ? Math.round(base / aspect) : base;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    const lineH = h / Math.max(lines.length, 1);
    ctx.font = `800 ${Math.round(Math.min(w * 0.62, lineH * 0.82))}px 'Baloo 2', sans-serif`;
    lines.forEach((t, i) => ctx.fillText(t, w / 2, lineH * (i + 0.5) + lineH * 0.04));
  } else {
    // right-aligned so the numbers sit next to the grid
    const step = Math.min(h * 0.62, w / Math.max(lines.length, 1));
    ctx.font = `800 ${Math.round(h * 0.6)}px 'Baloo 2', sans-serif`;
    lines.forEach((t, i) => ctx.fillText(t, w - step * (lines.length - i - 0.5) - h * 0.08, h / 2 + h * 0.04));
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function sameClues(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }

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
  const solution = generateSolution(size, cfg.fillChance);
  const rowClues = solution.map((row) => lineClues(row));
  const colClues = Array.from({ length: size }, (_, c) => lineClues(solution.map((row) => row[c])));
  const state = Array.from({ length: size }, () => Array(size).fill(0)); // 0 empty,1 fill,2 mark
  let finished = false, moves = 0;
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ng-meta"><span id="ng-status">Tap to fill, again for X, again to clear - drag to paint</span></div>
    <div class="pc-canvas3d" id="ng-canvas"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ng-canvas');
  const statusEl = wrap.querySelector('#ng-status');

  const maxRowGroups = Math.max(...rowClues.map((g) => g.length));
  const maxColGroups = Math.max(...colClues.map((g) => g.length));
  const rowClueW = CELL * (0.42 * maxRowGroups + 0.2);
  const colClueH = CELL * (0.56 * maxColGroups + 0.15);
  const gridSpan = size * CELL;
  const totalW = gridSpan + rowClueW;
  const totalH = gridSpan + colClueH;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, totalW / 2 + 0.1, totalH / 2 + 0.1) });

  // The grid plus its clue strips are centered as one block.
  const gridLeft = -totalW / 2 + rowClueW;
  const gridTop = totalH / 2 - colClueH;
  function cellPos(r, c) {
    return { x: gridLeft + c * CELL + CELL / 2, y: gridTop - r * CELL - CELL / 2 };
  }

  const cellMeshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellPos(r, c);
      const mesh = makeTile({ w: CELL * 0.92, h: CELL * 0.92, depth: 0.16, radius: 0.08, color: EMPTY_COLOR, roughness: 0.6 });
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 6, duration: 200 });
      // the X mark, shown only while a cell is marked
      const x2 = applyLabel(mesh, '\u2715', { size: 96, w: CELL * 0.6, h: CELL * 0.6, color: '#8a2a5a' });
      x2.visible = false;
      row.push(mesh);
    }
    cellMeshes.push(row);
  }
  // thin guide lines every 5 cells on bigger boards make counting easier
  if (size > 5) {
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd93d, toneMapped: false });
    for (let k = 5; k < size; k += 5) {
      const v = new THREE.Mesh(new THREE.PlaneGeometry(0.05, gridSpan), lineMat);
      v.position.set(gridLeft + k * CELL, gridTop - gridSpan / 2, 0.02);
      stage.world.add(v);
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(gridSpan, 0.05), lineMat);
      hz.position.set(gridLeft + gridSpan / 2, gridTop - k * CELL, 0.02);
      stage.world.add(hz);
    }
  }

  // row clue labels (left of grid) and column clue labels (above grid)
  const rowLabels = [], colLabels = [];
  for (let r = 0; r < size; r++) {
    const { y } = cellPos(r, 0);
    const planeW = rowClueW, planeH = CELL * 0.9;
    const tex = makeClueTexture(rowClues[r].map(String), { aspect: planeW / planeH });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    plane.position.set(gridLeft - rowClueW / 2, y, 0.05);
    stage.world.add(plane);
    rowLabels.push(plane);
  }
  for (let c = 0; c < size; c++) {
    const { x } = cellPos(0, c);
    const planeW = CELL * 0.9, planeH = colClueH;
    const tex = makeClueTexture(colClues[c].map(String), { vertical: true, aspect: planeW / planeH });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    plane.position.set(x, gridTop + colClueH / 2, 0.05);
    stage.world.add(plane);
    colLabels.push(plane);
  }

  function rowFilled(r) { return state[r].map((v) => v === 1); }
  function colFilled(c) { return state.map((row) => row[c] === 1); }

  // Clues whose line already matches fade out, so you can see what's left.
  function refreshClueDone(r, c) {
    rowLabels[r].material.opacity = sameClues(lineClues(rowFilled(r)), rowClues[r]) ? 0.35 : 1;
    colLabels[c].material.opacity = sameClues(lineClues(colFilled(c)), colClues[c]) ? 0.35 : 1;
  }

  function setCellVisual(r, c) {
    const mesh = cellMeshes[r][c];
    const v = state[r][c];
    mesh.material.color.set(v === 1 ? FILL_COLOR : v === 2 ? MARK_COLOR : EMPTY_COLOR);
    mesh.material.emissiveIntensity = 0;
    mesh.children[0].visible = v === 2;
  }

  // Win on any grid that satisfies every clue (random pictures are not
  // always unique, so comparing against one stored answer could miss a win).
  function checkWin() {
    for (let r = 0; r < size; r++) if (!sameClues(lineClues(rowFilled(r)), rowClues[r])) return false;
    for (let c = 0; c < size; c++) if (!sameClues(lineClues(colFilled(c)), colClues[c])) return false;
    return true;
  }

  function cellAt(clientX, clientY) {
    const p = stage.pickPlane(clientX, clientY, 0);
    if (!p) return null;
    const c = Math.floor((p.x - gridLeft) / CELL), r = Math.floor((gridTop - p.y) / CELL);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return { r, c };
  }

  function setCell(r, c, v) {
    if (state[r][c] === v) return false;
    state[r][c] = v;
    setCellVisual(r, c);
    refreshClueDone(r, c);
    tween(cellMeshes[r][c].scale, { x: 1.12, y: 1.12, z: 1.12 }, 100, Easing.outBack, () => tween(cellMeshes[r][c].scale, { x: 1, y: 1, z: 1 }, 140, Easing.outCubic));
    moves++;
    return true;
  }

  // Tap cycles empty -> filled -> X -> empty; dragging paints the same new
  // state onto every cell the finger passes over.
  const canvas = stage.renderer.domElement;
  let paint = null; // { id, value }
  function onPointerDown(e) {
    if (finished) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const value = (state[cell.r][cell.c] + 1) % 3;
    paint = { id: e.pointerId, value };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setCell(cell.r, cell.c, value);
    api.sound.click();
    afterChange();
  }
  function onPointerMove(e) {
    if (!paint || e.pointerId !== paint.id || finished) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    if (setCell(cell.r, cell.c, paint.value)) { api.sound.move(); afterChange(); }
  }
  function onPointerUp(e) { if (paint && e.pointerId === paint.id) paint = null; }

  function afterChange() {
    if (finished || !checkWin()) return;
    finished = true;
    paint = null;
    statusEl.textContent = 'Solved!';
    api.ui.burstFromElement(canvasHost);
    const elapsed = api.elapsedMs();
    const stars = elapsed <= cfg.timeStars[0] ? 3 : elapsed <= cfg.timeStars[1] ? 2 : 1;
    timers.later(() => api.win(stars, { moves }), 300);
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function hint() {
    if (finished) return;
    // 1) a filled square that doesn't belong in the picture
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!solution[r][c] && state[r][c] === 1) { glow(r, c, `${api.playerName}, that glowing square should be empty!`); return; }
    }
    // 2) a square the clues alone prove must be filled
    for (let r = 0; r < size; r++) {
      for (const c of overlapCells(rowClues[r], size)) { if (state[r][c] !== 1) { glow(r, c); return; } }
    }
    for (let c = 0; c < size; c++) {
      for (const r of overlapCells(colClues[c], size)) { if (state[r][c] !== 1) { glow(r, c); return; } }
    }
    // 3) any square of the picture still missing
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (solution[r][c] && state[r][c] !== 1) { glow(r, c); return; }
    }
    api.ui.toast(`${api.playerName}, your board already matches every clue!`);
  }
  function glow(r, c, msg) {
    const mesh = cellMeshes[r][c];
    mesh.material.emissive.set(0xffd93d);
    mesh.material.emissiveIntensity = 0.7;
    tween(mesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
    timers.later(() => { mesh.material.emissiveIntensity = 0; }, 1400);
    api.ui.toast(msg || `${api.playerName}, that glowing square must be filled!`);
  }

  return {
    unmount: () => {
      finished = true;
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

PC.Games.register('nonogram', { mount: guardMount(mount) });
