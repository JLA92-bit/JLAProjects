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

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  let lights = Array.from({ length: size }, () => Array(size).fill(false));
  let moves = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="lo-meta">Moves: <span id="lo-moves">0</span></div>
    <div class="pc-canvas3d" id="lo-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a light - it flips itself and its neighbors</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#lo-canvas');
  const movesEl = wrap.querySelector('#lo-moves');

  const stage = createStage(canvasHost, { distance: size * 1.9 });
  const half = (size - 1) / 2;
  function cellXY(r, c) { return { x: (c - half) * CELL, y: (half - r) * CELL }; }

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c);
      const mesh = makeTile({ w: 0.86, h: 0.86, depth: 0.22, radius: 0.16, color: OFF_COLOR, emissive: OFF_COLOR, emissiveIntensity: 0 });
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
    if (animate) {
      tween(mesh.material, { emissiveIntensity: on ? 0.85 : 0 }, 160, Easing.outCubic);
      tween(mesh.scale, { x: on ? 1.06 : 1, y: on ? 1.06 : 1, z: on ? 1.06 : 1 }, 160, Easing.outBack);
    } else {
      mesh.material.emissiveIntensity = on ? 0.85 : 0;
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

  // scramble from an all-off board using real presses so it's always solvable
  for (let i = 0; i < cfg.scramble; i++) {
    press(Math.floor(Math.random() * size), Math.floor(Math.random() * size), false);
  }
  // sync visuals without animation for the initial state
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const on = lights[r][c];
    meshes[r][c].material.color.set(on ? ON_COLOR : OFF_COLOR);
    meshes[r][c].material.emissiveIntensity = on ? 0.85 : 0;
  }

  function checkWin() {
    const allOff = lights.every((row) => row.every((v) => !v));
    if (allOff) {
      finished = true;
      const threshold3 = cfg.scramble * 1.2, threshold2 = cfg.scramble * 2;
      const stars = moves <= threshold3 ? 3 : moves <= threshold2 ? 2 : 1;
      api.ui.burstFromElement(canvasHost);
      setTimeout(() => api.win(stars, { moves }), 250);
    }
  }

  function onPointerDown(e) {
    if (finished) return;
    const flat = meshes.flat();
    const hit = stage.pick(e.clientX, e.clientY, flat);
    if (!hit) return;
    const { r, c } = hit.object.userData;
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
    if (finished) return;
    const x = solve();
    const idx = x.findIndex((v) => v === 1);
    if (idx === -1) return;
    const r = Math.floor(idx / size), c = idx % size;
    const mesh = meshes[r][c];
    const restScale = lights[r][c] ? 1.06 : 1;
    tween(mesh.scale, { x: 1.4, y: 1.4, z: 1.4 }, 180, Easing.outBack, () => tween(mesh.scale, { x: restScale, y: restScale, z: restScale }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try that glowing light!`);
  }

  return {
    unmount: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('lightsout', { mount });
