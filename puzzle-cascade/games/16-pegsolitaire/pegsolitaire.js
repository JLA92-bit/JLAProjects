/**
 * Game 16 - Peg Solitaire (3D). Tap a peg, then tap an empty hole two
 * spaces away in a straight line to jump over and remove the peg between.
 * Get down to as few pegs as possible.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CELL = 0.92;
const PEG_COLOR = 0xff4d8d;
const HOLE_COLOR = 0x1a0c30;
const SELECT_COLOR = 0xffd93d;

function diamondBoard(radius) {
  const cells = [];
  for (let r = -radius; r <= radius; r++) {
    for (let c = -radius; c <= radius; c++) {
      if (Math.abs(r) + Math.abs(c) <= radius) cells.push([r + radius, c + radius]);
    }
  }
  const size = radius * 2 + 1;
  return { cells, size };
}

function englishBoard() {
  const rows = [
    '..OOO..',
    '..OOO..',
    'OOOOOOO',
    'OOOOOOO',
    'OOOOOOO',
    '..OOO..',
    '..OOO..',
  ];
  const cells = [];
  rows.forEach((row, r) => { [...row].forEach((ch, c) => { if (ch === 'O') cells.push([r, c]); }); });
  return { cells, size: 7 };
}

const CONFIG = {
  easy: { board: () => diamondBoard(2) },     // 13 holes
  medium: { board: () => diamondBoard(3) },   // 25 holes
  hard: { board: () => englishBoard() },      // 33 holes
};

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function keyOf(r, c) { return `${r},${c}`; }

function findMoves(pegSet, validSet) {
  const moves = [];
  const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
  pegSet.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    dirs.forEach(([dr, dc]) => {
      const mr = r + dr / 2, mc = c + dc / 2;
      const tr = r + dr, tc = c + dc;
      const midKey = keyOf(mr, mc), toKey = keyOf(tr, tc);
      if (validSet.has(toKey) && pegSet.has(midKey) && !pegSet.has(toKey)) {
        moves.push({ from: [r, c], mid: [mr, mc], to: [tr, tc] });
      }
    });
  });
  return moves;
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
  const { cells, size } = cfg.board();
  const validSet = new Set(cells.map(([r, c]) => keyOf(r, c)));
  // start with every hole filled except the center
  const centerIdx = Math.floor(cells.length / 2);
  const centerKey = keyOf(...cells[centerIdx]);
  let pegSet = new Set(cells.map(([r, c]) => keyOf(r, c)));
  pegSet.delete(centerKey);
  let selected = null;
  let moves = 0, finished = false, busy = false, stuck = false;
  const history = []; // [{ from, mid, to }] for undo
  const timers = makeTimers();
  const startPegs = pegSet.size;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ps-meta">Pegs left: <span id="ps-count">${startPegs}</span></div>
    <div class="pc-canvas3d" id="ps-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip" id="ps-chip">Tap a peg, then the glowing hole to jump</span></div>
    </div>
    <div class="ps-actions">
      <button type="button" class="pc-btn pc-btn--ghost ps-btn" id="ps-undo" disabled>\u21A9\uFE0F Undo</button>
      <button type="button" class="pc-btn pc-btn--green ps-btn" id="ps-finish" hidden>\u2705 Finish</button>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ps-canvas');
  const countEl = wrap.querySelector('#ps-count');
  const chipEl = wrap.querySelector('#ps-chip');
  const undoBtn = wrap.querySelector('#ps-undo');
  const finishBtn = wrap.querySelector('#ps-finish');

  const boardHalf = ((size - 1) / 2) * CELL + 0.5;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, boardHalf, boardHalf) });

  const holeMeshes = new Map();
  const pegMeshes = new Map();

  function makePeg(r, c) {
    const { x, y } = cellXY(r, c, size);
    const peg = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), new THREE.MeshStandardMaterial({ color: PEG_COLOR, roughness: 0.3, metalness: 0.15 }));
    peg.position.set(x, y, 0.32);
    peg.castShadow = true;
    stage.world.add(peg);
    pegMeshes.set(keyOf(r, c), peg);
    return peg;
  }

  cells.forEach(([r, c]) => {
    const { x, y } = cellXY(r, c, size);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 20), new THREE.MeshStandardMaterial({ color: HOLE_COLOR, roughness: 0.9 }));
    hole.rotation.x = Math.PI / 2;
    hole.position.set(x, y, -0.06);
    stage.world.add(hole);
    holeMeshes.set(keyOf(r, c), hole);
    popIn(hole, { delay: (r + c) * 8 });
    if (pegSet.has(keyOf(r, c))) popIn(makePeg(r, c), { delay: (r + c) * 12 });
  });

  function disposeMesh(mesh) {
    stage.world.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  function removePeg(key) {
    const mesh = pegMeshes.get(key);
    if (!mesh) return;
    pegMeshes.delete(key);
    tween(mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 180, Easing.outCubic, () => disposeMesh(mesh));
  }

  function movePeg(fromKey, toKey) {
    const mesh = pegMeshes.get(fromKey);
    if (!mesh) return;
    pegMeshes.delete(fromKey);
    pegMeshes.set(toKey, mesh);
    const [r, c] = toKey.split(',').map(Number);
    const { x, y } = cellXY(r, c, size);
    tween(mesh.position, { x, y, z: 0.5 }, 200, Easing.outCubic, () => tween(mesh.position, { z: 0.32 }, 100, Easing.outCubic));
  }

  function jumpsFrom(key) {
    return findMoves(pegSet, validSet).filter((m) => keyOf(...m.from) === key);
  }

  function clearHoleGlow() {
    holeMeshes.forEach((h) => { h.material.emissive.set(0x000000); h.material.emissiveIntensity = 0; });
  }

  function setSelected(key) {
    if (selected) {
      const prevMesh = pegMeshes.get(selected);
      if (prevMesh) { prevMesh.material.emissive.set(0x000000); prevMesh.material.emissiveIntensity = 0; }
    }
    clearHoleGlow();
    selected = key;
    if (selected) {
      const mesh = pegMeshes.get(selected);
      if (mesh) { mesh.material.emissive.set(SELECT_COLOR); mesh.material.emissiveIntensity = 0.7; }
      // show where this peg can land
      jumpsFrom(selected).forEach((m) => {
        const hole = holeMeshes.get(keyOf(...m.to));
        hole.material.emissive.set(SELECT_COLOR);
        hole.material.emissiveIntensity = 0.55;
      });
    }
  }

  // Nearest board hole to a tap (generous: anywhere within ~0.65 of a cell).
  function cellAt(clientX, clientY) {
    const p = stage.pickPlane(clientX, clientY, 0);
    if (!p) return null;
    const half = (size - 1) / 2;
    const c = Math.round(p.x / CELL + half), r = Math.round(half - p.y / CELL);
    if (!validSet.has(keyOf(r, c))) return null;
    const { x, y } = cellXY(r, c, size);
    if (Math.hypot(p.x - x, p.y - y) > CELL * 0.68) return null;
    return { r, c };
  }

  function invalid(msg) {
    api.sound.error();
    api.ui.shake(canvasHost);
    if (msg) api.ui.toast(msg);
  }

  function onPointerDown(e) {
    if (finished || busy || stuck) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const { r, c } = cell;
    const key = keyOf(r, c);
    if (pegSet.has(key)) {
      if (selected === key) { setSelected(null); api.sound.click(); return; }
      setSelected(key);
      if (!jumpsFrom(key).length) { api.sound.click(); api.ui.toast('That peg has no jumps right now - try another one.'); return; }
      api.sound.click();
      return;
    }
    if (!selected) { invalid('Tap a peg first, then an empty hole.'); return; }
    // attempt jump from selected to this empty hole
    const [sr, sc] = selected.split(',').map(Number);
    const dr = r - sr, dc = c - sc;
    if (Math.abs(dr) + Math.abs(dc) !== 2 || (dr !== 0 && dc !== 0)) { invalid('Jump exactly two holes in a straight line.'); return; }
    const midKey = keyOf(sr + dr / 2, sc + dc / 2);
    if (!pegSet.has(midKey)) { invalid('You can only jump over another peg.'); return; }
    // legal jump
    const fromKey = selected;
    setSelected(null);
    pegSet.delete(fromKey);
    pegSet.delete(midKey);
    pegSet.add(key);
    history.push({ from: fromKey, mid: midKey, to: key });
    movePeg(fromKey, key);
    removePeg(midKey);
    moves++;
    countEl.textContent = pegSet.size;
    undoBtn.disabled = false;
    api.sound.move();
    busy = true;
    timers.later(() => { busy = false; checkEnd(); }, 320);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function undo() {
    if (finished || busy || !history.length) { if (!finished && !busy) api.sound.error(); return; }
    const last = history.pop();
    setSelected(null);
    pegSet.delete(last.to);
    pegSet.add(last.from);
    pegSet.add(last.mid);
    movePeg(last.to, last.from);
    const [mr, mc] = last.mid.split(',').map(Number);
    popIn(makePeg(mr, mc), { duration: 200 });
    moves = Math.max(0, moves - 1);
    countEl.textContent = pegSet.size;
    undoBtn.disabled = history.length === 0;
    setStuck(false);
    api.sound.click();
  }
  undoBtn.addEventListener('click', undo);
  finishBtn.addEventListener('click', () => { if (stuck && !finished) { api.sound.click(); finish(); } });

  function starsFor(left) { return left <= 1 ? 3 : left <= 3 ? 2 : 1; }

  function setStuck(on) {
    stuck = on;
    finishBtn.hidden = !on;
    if (on) {
      const left = pegSet.size;
      finishBtn.textContent = `\u2705 Finish (${'\u2605'.repeat(starsFor(left))})`;
      chipEl.textContent = `No jumps left - ${left} pegs. Undo to try for fewer, or finish.`;
    } else {
      chipEl.textContent = 'Tap a peg, then the glowing hole to jump';
    }
  }

  function finish() {
    finished = true;
    finishBtn.hidden = true;
    undoBtn.disabled = true;
    const left = pegSet.size;
    api.ui.burstFromElement(canvasHost);
    timers.later(() => api.win(starsFor(left), { pegsLeft: left, moves }), 300);
  }

  function checkEnd() {
    if (findMoves(pegSet, validSet).length) return;
    if (pegSet.size <= 1) { finish(); return; }
    api.sound.error();
    setStuck(true);
  }

  function hint() {
    if (finished || busy) return;
    if (stuck) { api.ui.toast(`${api.playerName}, no jumps left - tap Undo to try a different path, or Finish.`); return; }
    const options = findMoves(pegSet, validSet);
    if (!options.length) return;
    // prefer a move that keeps the most follow-up jumps open
    let best = options[0], bestScore = -1;
    options.forEach((m) => {
      const next = new Set(pegSet);
      next.delete(keyOf(...m.from)); next.delete(keyOf(...m.mid)); next.add(keyOf(...m.to));
      const score = findMoves(next, validSet).length + Math.random() * 0.5;
      if (score > bestScore) { bestScore = score; best = m; }
    });
    setSelected(keyOf(...best.from));
    const fromMesh = pegMeshes.get(keyOf(...best.from));
    const toHole = holeMeshes.get(keyOf(...best.to));
    [fromMesh, toHole].forEach((m) => {
      if (!m) return;
      tween(m.scale, { x: 1.4, y: 1.4, z: 1.4 }, 180, Easing.outBack, () => tween(m.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    });
    api.ui.toast(`${api.playerName}, jump the glowing peg into the glowing hole!`);
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

PC.Games.register('pegsolitaire', { mount: guardMount(mount) });
