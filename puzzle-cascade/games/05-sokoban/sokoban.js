/**
 * Game 5 - Sokoban Block Push (3D). Hand-authored levels (1/2/3 crates),
 * rendered as a 3D room; push every crate onto a glowing target. Undo and
 * Restart mean a crate pushed into a corner is never a dead end.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const LEVELS = {
  easy: { moveStars: [14, 22], rows: ['#####', '#   #', '# $ #', '# . #', '# @ #', '#####'] },
  medium: { moveStars: [30, 48], rows: ['#######', '#     #', '# $ $ #', '#  #  #', '# . . #', '#  @  #', '#######'] },
  hard: { moveStars: [46, 70], rows: ['########', '#      #', '# $ $ $#', '#      #', '# . . .#', '#@     #', '########'] },
};
const CELL = 1.0;

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
const DIR_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
const ARROWS = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };

// D-pad buttons: move on press, keep moving while held.
function bindDpad(buttons, move, life) {
  let repeatId = null, delayId = null;
  const stop = () => { clearTimeout(delayId); clearInterval(repeatId); delayId = repeatId = null; };
  buttons.forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stop();
      const dir = btn.dataset.dir;
      move(dir);
      delayId = setTimeout(() => { repeatId = setInterval(() => { if (life.dead) stop(); else move(dir); }, 170); }, 320);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => btn.addEventListener(t, stop));
  });
  return stop;
}

// Swipe anywhere on the canvas to move one step.
function bindSwipe(el, move) {
  let start = null;
  const down = (e) => { start = { x: e.clientX, y: e.clientY, id: e.pointerId }; try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
  const up = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left'); else move(dy > 0 ? 'down' : 'up');
  };
  const cancel = () => { start = null; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel); };
}
function starsForMoves(moveStars, moves) {
  if (moves <= moveStars[0]) return 3;
  if (moves <= moveStars[1]) return 2;
  return 1;
}

function parseLevel(rows) {
  const walls = new Set(), targets = new Set(), boxes = new Set();
  let player = null;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c], key = r + ',' + c;
      if (ch === '#') walls.add(key);
      else if (ch === '.') targets.add(key);
      else if (ch === '$') boxes.add(key);
      else if (ch === '@') player = { r, c };
    }
  });
  return { walls, targets, boxes, player, height: rows.length, width: Math.max(...rows.map((r) => r.length)) };
}

function mount(container, difficulty, api) {
  const level = LEVELS[difficulty] || LEVELS.easy;
  const state = parseLevel(level.rows);
  const start = { player: { ...state.player }, boxes: new Set(state.boxes) };
  const life = lifecycle();
  let moves = 0, finished = false, moving = false, queued = null;
  const history = []; // snapshots for Undo

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sk-meta">Moves: <span id="sk-moves">0</span></div>
    <div class="pc-canvas3d" id="sk-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Push every crate onto a ring</span></div>
    </div>
    <div class="sk-controls">
      <button type="button" class="sk-side" id="sk-undo">↩️<span>Undo</span></button>
      <div class="sk-dpad" id="sk-dpad">
        <button type="button" class="sk-dbtn sk-dbtn--up" data-dir="up" aria-label="Up">⬆️</button>
        <button type="button" class="sk-dbtn sk-dbtn--left" data-dir="left" aria-label="Left">⬅️</button>
        <button type="button" class="sk-dbtn sk-dbtn--right" data-dir="right" aria-label="Right">➡️</button>
        <button type="button" class="sk-dbtn sk-dbtn--down" data-dir="down" aria-label="Down">⬇️</button>
      </div>
      <button type="button" class="sk-side" id="sk-restart">🔄<span>Restart</span></button>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#sk-canvas');
  const movesEl = wrap.querySelector('#sk-moves');

  const stage = createStage(canvasHost, { distance: Math.max(state.width, state.height) * 1.9 });
  fitBoard(stage, canvasHost, state.width * CELL, state.height * CELL, { bottom: 44 });
  const halfW = (state.width - 1) / 2, halfH = (state.height - 1) / 2;
  function cellXY(r, c) { return { x: (c - halfW) * CELL, y: (halfH - r) * CELL }; }

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b0f5c, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6a2dd6, roughness: 0.4 });
  const targetMat = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 0.35, roughness: 0.3 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xff9f43, roughness: 0.35 });
  const boxDoneMat = new THREE.MeshStandardMaterial({ color: 0x23d18b, roughness: 0.3, emissive: 0x23d18b, emissiveIntensity: 0.2 });

  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const key = r + ',' + c;
      const { x, y } = cellXY(r, c);
      if (state.walls.has(key)) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.96, CELL * 0.96, 0.5), wallMat);
        wall.position.set(x, y, 0.25);
        wall.castShadow = true; wall.receiveShadow = true;
        stage.world.add(wall);
      } else {
        const floor = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, CELL * 0.98, 0.08), floorMat);
        floor.position.set(x, y, -0.04);
        floor.receiveShadow = true;
        stage.world.add(floor);
        if (state.targets.has(key)) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 10, 20), targetMat);
          ring.position.set(x, y, 0.02);
          stage.world.add(ring);
        }
      }
    }
  }

  let boxMeshes = new Map(); // key -> mesh
  state.boxes.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    const { x, y } = cellXY(r, c);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), state.targets.has(key) ? boxDoneMat : boxMat);
    mesh.position.set(x, y, 0.3);
    mesh.castShadow = true; mesh.receiveShadow = true;
    stage.world.add(mesh);
    popIn(mesh, { duration: 240 });
    boxMeshes.set(key, mesh);
  });

  const playerMesh = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.22, 0.3, 4, 10) : new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff4d8d, roughness: 0.3, emissive: 0xff4d8d, emissiveIntensity: 0.1 }));
  const pStart = cellXY(state.player.r, state.player.c);
  playerMesh.position.set(pStart.x, pStart.y, 0.35);
  playerMesh.castShadow = true;
  stage.world.add(playerMesh);
  popIn(playerMesh, { duration: 240 });

  function setMoves(n) { moves = n; movesEl.textContent = moves; }

  function move(dir) {
    if (finished) return;
    if (moving) { queued = dir; return; }
    const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    const nr = state.player.r + d[0], nc = state.player.c + d[1];
    const nKey = nr + ',' + nc;
    const bump = () => { queued = null; api.sound.error(); api.ui.shake(canvasHost); };
    if (state.walls.has(nKey)) { bump(); return; }
    let boxTarget = null;
    if (state.boxes.has(nKey)) {
      const br = nr + d[0], bc = nc + d[1];
      const bKey = br + ',' + bc;
      if (state.walls.has(bKey) || state.boxes.has(bKey)) { bump(); return; }
      boxTarget = { from: nKey, to: bKey, r: br, c: bc };
    }
    history.push({ player: { ...state.player }, boxes: new Set(state.boxes), moves });
    moving = true;
    const playerXY = cellXY(nr, nc);
    api.sound.move();
    if (boxTarget) {
      state.boxes.delete(boxTarget.from);
      state.boxes.add(boxTarget.to);
      const mesh = boxMeshes.get(boxTarget.from);
      boxMeshes.delete(boxTarget.from);
      boxMeshes.set(boxTarget.to, mesh);
      const boxXY = cellXY(boxTarget.r, boxTarget.c);
      mesh.material = state.targets.has(boxTarget.to) ? boxDoneMat : boxMat;
      if (state.targets.has(boxTarget.to)) api.sound.match();
      tween(mesh.position, { x: boxXY.x, y: boxXY.y }, 140, Easing.outCubic);
    }
    state.player = { r: nr, c: nc };
    setMoves(moves + 1);
    tween(playerMesh.position, { x: playerXY.x, y: playerXY.y }, 140, Easing.outCubic, () => {
      if (life.dead) return;
      moving = false;
      if (checkWin()) return;
      if (queued) { const next = queued; queued = null; move(next); }
    });
  }

  // Snap every mesh to the current logical state (after Undo / Restart).
  function syncMeshes() {
    const old = boxMeshes;
    boxMeshes = new Map();
    const loose = [];
    old.forEach((mesh, key) => { if (state.boxes.has(key)) boxMeshes.set(key, mesh); else loose.push(mesh); });
    state.boxes.forEach((key) => {
      if (boxMeshes.has(key)) return;
      const [r, c] = key.split(',').map(Number);
      const { x, y } = cellXY(r, c);
      // the crate that moved is the closest loose one
      loose.sort((a, b) => Math.hypot(a.position.x - x, a.position.y - y) - Math.hypot(b.position.x - x, b.position.y - y));
      boxMeshes.set(key, loose.shift());
    });
    boxMeshes.forEach((mesh, key) => {
      const [r, c] = key.split(',').map(Number);
      const { x, y } = cellXY(r, c);
      mesh.material = state.targets.has(key) ? boxDoneMat : boxMat;
      tween(mesh.position, { x, y }, 140, Easing.outCubic);
    });
    const p = cellXY(state.player.r, state.player.c);
    tween(playerMesh.position, { x: p.x, y: p.y }, 140, Easing.outCubic);
  }

  function undo() {
    if (finished || moving) return;
    const snap = history.pop();
    if (!snap) { api.sound.error(); api.ui.toast('Nothing to undo yet!'); return; }
    api.sound.click();
    state.player = snap.player;
    state.boxes = snap.boxes;
    setMoves(snap.moves);
    syncMeshes();
  }

  function restart() {
    if (finished || moving) return;
    if (!history.length) return;
    api.sound.click();
    history.length = 0;
    state.player = { ...start.player };
    state.boxes = new Set(start.boxes);
    setMoves(0);
    syncMeshes();
  }

  function isWin(boxes) { return [...state.targets].every((t) => boxes.has(t)); }

  function checkWin() {
    if (!isWin(state.boxes)) return false;
    finished = true;
    queued = null;
    const stars = starsForMoves(level.moveStars, moves);
    api.ui.burstFromElement(canvasHost);
    life.later(() => api.win(stars, { moves }), 250);
    return true;
  }

  function onKey(e) {
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); undo(); return; }
    const dir = DIR_KEYS[e.key];
    if (dir) { e.preventDefault(); move(dir); }
  }
  window.addEventListener('keydown', onKey);
  const stopDpad = bindDpad(wrap.querySelectorAll('.sk-dbtn'), move, life);
  const unbindSwipe = bindSwipe(stage.renderer.domElement, move);
  wrap.querySelector('#sk-undo').addEventListener('click', undo);
  wrap.querySelector('#sk-restart').addEventListener('click', restart);

  // A crate in a corner that isn't a target can never move again.
  function deadCorner(key) {
    if (state.targets.has(key)) return false;
    const [r, c] = key.split(',').map(Number);
    const w = (rr, cc) => state.walls.has(rr + ',' + cc);
    return (w(r - 1, c) || w(r + 1, c)) && (w(r, c - 1) || w(r, c + 1));
  }

  // BFS over (player, crates) with parent links; returns the first step.
  function solveFromHere() {
    const DIRS = [['up', -1, 0], ['down', 1, 0], ['left', 0, -1], ['right', 0, 1]];
    const keyOf = (p, boxes) => p.r + ',' + p.c + '|' + [...boxes].sort().join(';');
    const startKey = keyOf(state.player, state.boxes);
    const parent = new Map([[startKey, null]]);
    const queue = [{ player: { ...state.player }, boxes: new Set(state.boxes), key: startKey }];
    for (let head = 0; head < queue.length && head < 300000; head++) {
      const cur = queue[head];
      if (isWin(cur.boxes)) {
        let k = cur.key, step = null;
        while (parent.get(k)) { step = parent.get(k); k = step.prev; }
        return step ? step.dir : null;
      }
      for (const [dir, dr, dc] of DIRS) {
        const nr = cur.player.r + dr, nc = cur.player.c + dc, nKey = nr + ',' + nc;
        if (state.walls.has(nKey)) continue;
        let boxes = cur.boxes;
        if (boxes.has(nKey)) {
          const bKey = (nr + dr) + ',' + (nc + dc);
          if (state.walls.has(bKey) || boxes.has(bKey) || deadCorner(bKey)) continue;
          boxes = new Set(boxes);
          boxes.delete(nKey);
          boxes.add(bKey);
        }
        const player = { r: nr, c: nc };
        const key = keyOf(player, boxes);
        if (parent.has(key)) continue;
        parent.set(key, { prev: cur.key, dir });
        queue.push({ player, boxes, key });
      }
    }
    return null;
  }

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, every crate is home!`); return; }
    if (moving) return;
    const dir = solveFromHere();
    if (!dir) {
      api.ui.toast(`${api.playerName}, a crate is stuck - tap Undo to take that push back!`);
      const undoBtn = wrap.querySelector('#sk-undo');
      api.ui.shake(undoBtn);
      return;
    }
    tween(playerMesh.scale, { x: 1.4, y: 1.4, z: 1.4 }, 160, Easing.outBack, () => tween(playerMesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try heading ${dir}! ${ARROWS[dir]}`);
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    window.removeEventListener('keydown', onKey);
    stopDpad();
    unbindSwipe();
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('sokoban', { mount });
