/**
 * Game 10 - Logic Grid / Lights Out (3D). The final boss: toggling a
 * cell flips it and its orthogonal neighbors. Turn every light off.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 4, scramble: 5 },
  medium: { size: 5, scramble: 8 },
  hard: { size: 6, scramble: 12 },
};
const CELL = 0.98;
const ON_COLOR = 0xffd93d;
const OFF_COLOR = 0x2b0f5c;
const ON_GLOW = 0.2;

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


function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const size = cfg.size;
  const life = lifecycle();
  let lights = Array.from({ length: size }, () => Array(size).fill(false));
  let moves = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="lo-meta">Moves: <span id="lo-moves">0</span></div>
    <div class="pc-canvas3d" id="lo-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap to flip a light and its neighbors</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#lo-canvas');
  const movesEl = wrap.querySelector('#lo-moves');

  const stage = createStage(canvasHost, { distance: size * 1.9 });
  fitBoard(stage, canvasHost, size * CELL, size * CELL, { bottom: 50 });
  const half = (size - 1) / 2;
  function cellXY(r, c) { return { x: (c - half) * CELL, y: (half - r) * CELL }; }

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c);
      const mesh = makeTile({ w: 0.86, h: 0.86, depth: 0.22, radius: 0.16, color: OFF_COLOR, emissive: OFF_COLOR, emissiveIntensity: 0 });
      mesh.material.envMapIntensity = 0.35;
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 12 });
      row.push(mesh);
    }
    meshes.push(row);
  }

  function toggleCell(r, c, animate) {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    lights[r][c] = !lights[r][c];
    const mesh = meshes[r][c];
    const on = lights[r][c];
    mesh.material.color.set(on ? ON_COLOR : OFF_COLOR);
    mesh.material.emissive.set(on ? ON_COLOR : OFF_COLOR);
    if (animate) {
      tween(mesh.material, { emissiveIntensity: on ? ON_GLOW : 0 }, 160, Easing.outCubic);
      tween(mesh.scale, { x: on ? 1.06 : 1, y: on ? 1.06 : 1, z: on ? 1.06 : 1 }, 160, Easing.outBack);
    } else {
      mesh.material.emissiveIntensity = on ? ON_GLOW : 0;
    }
  }

  function press(r, c, isPlayer) {
    toggleCell(r, c, true);
    toggleCell(r - 1, c, true);
    toggleCell(r + 1, c, true);
    toggleCell(r, c - 1, true);
    toggleCell(r, c + 1, true);
    if (isPlayer) {
      api.sound.click();
      moves++;
      movesEl.textContent = moves;
      checkWin();
    }
  }

  // Scramble from an all-off board using real presses on distinct cells, so
  // it's always solvable in at most cfg.scramble taps.
  do {
    lights = Array.from({ length: size }, () => Array(size).fill(false));
    const cells = Array.from({ length: size * size }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, cfg.scramble);
    cells.forEach((i) => {
      const r = Math.floor(i / size), c = i % size;
      [[r, c], [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([rr, cc]) => {
        if (rr >= 0 && rr < size && cc >= 0 && cc < size) lights[rr][cc] = !lights[rr][cc];
      });
    });
  } while (lights.every((row) => row.every((v) => !v)));
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const on = lights[r][c];
    meshes[r][c].material.color.set(on ? ON_COLOR : OFF_COLOR);
    meshes[r][c].material.emissive.set(on ? ON_COLOR : OFF_COLOR);
    meshes[r][c].material.emissiveIntensity = on ? ON_GLOW : 0;
  }

  function checkWin() {
    const allOff = lights.every((row) => row.every((v) => !v));
    if (allOff) {
      finished = true;
      const threshold3 = Math.ceil(cfg.scramble * 1.5), threshold2 = cfg.scramble * 3;
      const stars = moves <= threshold3 ? 3 : moves <= threshold2 ? 2 : 1;
      api.ui.burstFromElement(canvasHost);
      life.later(() => api.win(stars, { moves }), 250);
    }
  }

  function onPointerDown(e) {
    if (finished) return;
    const pt = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!pt) return;
    const c = Math.round(pt.x / CELL + half), r = Math.round(half - pt.y / CELL);
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    press(r, c, true);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // Gaussian elimination over GF(2): solves "which cells to press" for the
  // current board. The scramble was built from real presses so a solution
  // always exists.
  function solve() {
    const N = size * size;
    const A = [];
    for (let i = 0; i < N; i++) {
      const row = new Array(N + 1).fill(0);
      const r = Math.floor(i / size), c = i % size;
      row[i] = 1;
      if (r > 0) row[i - size] = 1;
      if (r < size - 1) row[i + size] = 1;
      if (c > 0) row[i - 1] = 1;
      if (c < size - 1) row[i + 1] = 1;
      row[N] = lights[r][c] ? 1 : 0;
      A.push(row);
    }
    let pivotRow = 0;
    const pivotCols = [];
    for (let col = 0; col < N && pivotRow < N; col++) {
      let sel = -1;
      for (let r = pivotRow; r < N; r++) { if (A[r][col] === 1) { sel = r; break; } }
      if (sel === -1) continue;
      [A[pivotRow], A[sel]] = [A[sel], A[pivotRow]];
      for (let r = 0; r < N; r++) {
        if (r !== pivotRow && A[r][col] === 1) {
          for (let k = col; k <= N; k++) A[r][k] ^= A[pivotRow][k];
        }
      }
      pivotCols.push(col);
      pivotRow++;
    }
    const x = new Array(N).fill(0);
    for (let i = 0; i < pivotCols.length; i++) x[pivotCols[i]] = A[i][N];
    return x;
  }

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, every light is off!`); return; }
    const x = solve();
    const idx = x.findIndex((v) => v === 1);
    if (idx === -1) return;
    const r = Math.floor(idx / size), c = idx % size;
    const mesh = meshes[r][c];
    const restScale = lights[r][c] ? 1.06 : 1;
    tween(mesh.scale, { x: 1.4, y: 1.4, z: 1.4 }, 180, Easing.outBack, () => tween(mesh.scale, { x: restScale, y: restScale, z: restScale }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try that glowing light!`);
  }

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

PC.Games.register('lightsout', { mount });
