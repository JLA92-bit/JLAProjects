/**
 * Game 3 - Color Match-3 (3D). Gem meshes (octahedra) on a tilted board;
 * swap adjacent gems to make lines of 3+, cascades fall and refill.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 6, types: 5, moves: 18, target: 500 },
  medium: { size: 7, types: 6, moves: 20, target: 850 },
  hard: { size: 8, types: 6, moves: 22, target: 1250 },
};
const SPACING = 1.0;
const GEM_RADIUS = 0.4;

function idx(r, c, size) { return r * size + c; }
function randomGem(types) { return Math.floor(Math.random() * types); }

function makeBoard(size, types) {
  const board = new Array(size * size);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    let g;
    do { g = randomGem(types); } while (
      (c >= 2 && board[idx(r, c - 1, size)] === g && board[idx(r, c - 2, size)] === g) ||
      (r >= 2 && board[idx(r - 1, c, size)] === g && board[idx(r - 2, c, size)] === g)
    );
    board[idx(r, c, size)] = g;
  }
  return board;
}

function findMatches(board, size) {
  const matched = new Set();
  for (let r = 0; r < size; r++) {
    let run = [idx(r, 0, size)];
    for (let c = 1; c <= size; c++) {
      const cur = c < size ? board[idx(r, c, size)] : Symbol();
      const prev = board[run[run.length - 1]];
      if (c < size && cur === prev) run.push(idx(r, c, size));
      else { if (run.length >= 3) run.forEach((i) => matched.add(i)); run = [idx(r, c, size)]; }
    }
  }
  for (let c = 0; c < size; c++) {
    let run = [idx(0, c, size)];
    for (let r = 1; r <= size; r++) {
      const cur = r < size ? board[idx(r, c, size)] : Symbol();
      const prev = board[run[run.length - 1]];
      if (r < size && cur === prev) run.push(idx(r, c, size));
      else { if (run.length >= 3) run.forEach((i) => matched.add(i)); run = [idx(r, c, size)]; }
    }
  }
  return matched;
}

function isAdjacent(a, b, size) {
  const ar = Math.floor(a / size), ac = a % size, br = Math.floor(b / size), bc = b % size;
  return (Math.abs(ar - br) === 1 && ac === bc) || (Math.abs(ac - bc) === 1 && ar === br);
}

function hasAnyMove(board, size) {
  for (let i = 0; i < board.length; i++) {
    const r = Math.floor(i / size), c = i % size;
    const neighbors = [];
    if (c < size - 1) neighbors.push(i + 1);
    if (r < size - 1) neighbors.push(i + size);
    for (const n of neighbors) {
      const copy = board.slice();
      [copy[i], copy[n]] = [copy[n], copy[i]];
      if (findMatches(copy, size).size > 0) return true;
    }
  }
  return false;
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

// The round ends the moment the target is hit, so stars reward reaching it
// with moves to spare.
function starsForMovesLeft(movesLeft, total) {
  if (movesLeft >= total * 0.35) return 3;
  if (movesLeft >= total * 0.12) return 2;
  return 1;
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
  const size = cfg.size;
  const life = lifecycle();
  let board = makeBoard(size, cfg.types);
  let movesLeft = cfg.moves, score = 0, selected = null, busy = false, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="m3-meta">
      <span>Score: <span id="m3-score">0</span> / ${cfg.target}</span>
      <span>Moves: <span id="m3-moves">${movesLeft}</span></span>
    </div>
    <div class="pc-canvas3d" id="m3-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Swipe or tap two gems to swap</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#m3-canvas');
  const scoreEl = wrap.querySelector('#m3-score');
  const movesEl = wrap.querySelector('#m3-moves');

  const stage = createStage(canvasHost, { distance: size * 2.1 });
  fitBoard(stage, canvasHost, size * SPACING, size * SPACING, { bottom: 50 });
  const half = (size - 1) / 2;
  function cellXY(i) { const r = Math.floor(i / size), c = i % size; return { x: (c - half) * SPACING, y: (half - r) * SPACING }; }

  const gemGeo = new THREE.OctahedronGeometry(GEM_RADIUS, 0);
  function makeGem(type) {
    const mat = new THREE.MeshStandardMaterial({ color: PALETTE[type], metalness: 0.35, roughness: 0.2, emissive: PALETTE[type], emissiveIntensity: 0.12 });
    const mesh = new THREE.Mesh(gemGeo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.rotation.y = Math.random() * Math.PI;
    return mesh;
  }

  let meshAt = board.map((type, i) => {
    const { x, y } = cellXY(i);
    const mesh = makeGem(type);
    mesh.position.set(x, y, 0);
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 6, scale: 1 });
    return mesh;
  });

  stage.onTick(() => { meshAt.forEach((m) => { if (m) m.rotation.y += 0.006; }); });

  function meshList() { return meshAt.filter(Boolean); }

  function setSelected(i, on) {
    const m = meshAt[i];
    if (!m) return;
    tween(m.scale, on ? { x: 1.25, y: 1.25, z: 1.25 } : { x: 1, y: 1, z: 1 }, 120, Easing.outBack);
  }

  // Touch handling: tap two neighbours, or press a gem and swipe toward
  // the neighbour to swap with. Cells are found from the table plane so
  // a touch anywhere in a gem's square counts.
  function cellAt(clientX, clientY) {
    const pt = stage.pickPlane(clientX, clientY, 0);
    if (!pt) return null;
    const c = Math.round(pt.x / SPACING + half), r = Math.round(half - pt.y / SPACING);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return { r, c, i: idx(r, c, size), pt };
  }
  let press = null;
  const canvas = stage.renderer.domElement;
  function onPointerDown(e) {
    if (busy || finished) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    press = { ...cell, id: e.pointerId, swiped: false };
    onClick(cell.i);
  }
  function onPointerMove(e) {
    if (!press || press.swiped || busy || e.pointerId !== press.id) return;
    const pt = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!pt) return;
    const dx = pt.x - press.pt.x, dy = pt.y - press.pt.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SPACING * 0.45) return;
    press.swiped = true;
    let r = press.r, c = press.c;
    if (Math.abs(dx) > Math.abs(dy)) c += dx > 0 ? 1 : -1; else r += dy > 0 ? -1 : 1;
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    if (selected !== press.i) return;
    onClick(idx(r, c, size));
  }
  function onPointerUp(e) { if (press && e.pointerId === press.id) press = null; }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function onClick(i) {
    if (!meshAt[i]) return;
    api.sound.click();
    if (selected === null) { selected = i; setSelected(i, true); return; }
    if (selected === i) { setSelected(i, false); selected = null; return; }
    if (!isAdjacent(selected, i, size)) { setSelected(selected, false); selected = i; setSelected(i, true); return; }
    const a = selected, b = i;
    setSelected(a, false);
    selected = null;
    attemptSwap(a, b);
  }

  function attemptSwap(a, b) {
    const copy = board.slice();
    [copy[a], copy[b]] = [copy[b], copy[a]];
    const matches = findMatches(copy, size);
    busy = true;
    const posA = cellXY(a), posB = cellXY(b);
    const meshA = meshAt[a], meshB = meshAt[b];
    tween(meshA.position, { x: posB.x, y: posB.y }, 160, Easing.outCubic);
    tween(meshB.position, { x: posA.x, y: posA.y }, 160, Easing.outCubic, () => {
      if (life.dead) return;
      if (matches.size === 0) {
        api.sound.error();
        api.ui.shake(canvasHost);
        tween(meshA.position, { x: posA.x, y: posA.y }, 160, Easing.outCubic);
        tween(meshB.position, { x: posB.x, y: posB.y }, 160, Easing.outCubic, () => { busy = false; });
        return;
      }
      board = copy;
      [meshAt[a], meshAt[b]] = [meshAt[b], meshAt[a]];
      movesLeft--;
      movesEl.textContent = movesLeft;
      resolveCascades(1);
    });
  }

  function resolveCascades(multiplier) {
    const matches = findMatches(board, size);
    if (life.dead) return;
    if (matches.size === 0) { busy = false; checkEnd(); return; }
    score += matches.size * 10 * multiplier;
    scoreEl.textContent = score;
    api.sound.match();
    if (matches.size >= 4) api.ui.burstFromElement(canvasHost, { count: 16 });

    let pending = matches.size;
    matches.forEach((i) => {
      const m = meshAt[i];
      tween(m.scale, { x: 0.01, y: 0.01, z: 0.01 }, 200, Easing.inOutQuad, () => {
        stage.world.remove(m);
        board[i] = null;
        meshAt[i] = null;
        pending--;
        if (pending === 0) life.later(() => collapseAndRefill(multiplier), 60);
      });
    });
  }

  function collapseAndRefill(multiplier) {
    for (let c = 0; c < size; c++) {
      let write = size - 1;
      for (let r = size - 1; r >= 0; r--) {
        const i = idx(r, c, size);
        if (board[i] !== null) {
          const wi = idx(write, c, size);
          if (wi !== i) {
            board[wi] = board[i]; meshAt[wi] = meshAt[i];
            board[i] = null; meshAt[i] = null;
            const target = cellXY(wi);
            tween(meshAt[wi].position, { x: target.x, y: target.y }, 220, Easing.outCubic);
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        const i = idx(r, c, size);
        const type = randomGem(cfg.types);
        board[i] = type;
        const mesh = makeGem(type);
        const target = cellXY(i);
        mesh.position.set(target.x, target.y + 4, 0.6);
        stage.world.add(mesh);
        tween(mesh.position, { x: target.x, y: target.y, z: 0 }, 320 + r * 40, Easing.outCubic);
        meshAt[i] = mesh;
      }
    }
    life.later(() => resolveCascades(multiplier + 1), 380);
  }

  function checkEnd() {
    if (score >= cfg.target) {
      finished = true;
      const stars = starsForMovesLeft(movesLeft, cfg.moves);
      api.ui.burstFromElement(canvasHost);
      life.later(() => api.win(stars, { score, movesLeft }), 200);
      return;
    }
    if (movesLeft <= 0) {
      finished = true;
      api.lose(`out of moves - you scored ${score} of ${cfg.target}. Try again!`);
      showRetry(canvasHost, restart);
      return;
    }
    if (!hasAnyMove(board, size)) {
      meshAt.forEach((m) => m && stage.world.remove(m));
      board = makeBoard(size, cfg.types);
      meshAt = board.map((type, i) => {
        const { x, y } = cellXY(i);
        const mesh = makeGem(type);
        mesh.position.set(x, y, 0);
        stage.world.add(mesh);
        popIn(mesh, { delay: i * 6 });
        return mesh;
      });
      api.ui.toast('Reshuffled - no moves left!');
    }
  }

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, tap Try again for a fresh board!`); return; }
    if (busy) return;
    for (let i = 0; i < board.length; i++) {
      const r = Math.floor(i / size), c = i % size;
      const neighbors = [];
      if (c < size - 1) neighbors.push(i + 1);
      if (r < size - 1) neighbors.push(i + size);
      for (const n of neighbors) {
        const copy = board.slice();
        [copy[i], copy[n]] = [copy[n], copy[i]];
        if (findMatches(copy, size).size > 0) {
          [i, n].forEach((idx) => {
            const m = meshAt[idx];
            if (!m) return;
            m.material.emissiveIntensity = 0.9;
            tween(m.material, { emissiveIntensity: 0.12 }, 1200, Easing.inOutQuad);
            tween(m.scale, { x: 1.35, y: 1.35, z: 1.35 }, 180, Easing.outBack, () => tween(m.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
          });
          api.ui.toast(`${api.playerName}, swap those two glowing gems!`);
          return;
        }
      }
    }
    api.ui.toast(`${api.playerName}, look for three in a row!`);
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('match3', { mount });
