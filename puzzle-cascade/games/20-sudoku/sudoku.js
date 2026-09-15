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

function cellXY(r, c, size, cell) {
  const half = (size - 1) / 2;
  return { x: (c - half) * cell, y: (half - r) * cell };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size, boxW = cfg.boxW, boxH = cfg.boxH;
  const CELL = size <= 4 ? 1.0 : size <= 6 ? 0.85 : 0.62;

  const solution = makeSolvedGrid(size, boxW, boxH);
  const given = solution.map((row) => row.slice());
  const clueCount = Math.round(size * size * cfg.clueFrac);
  const positions = shuffle(Array.from({ length: size * size }, (_, i) => i));
  const isGiven = Array.from({ length: size }, () => Array(size).fill(false));
  positions.slice(0, clueCount).forEach((idx) => { isGiven[Math.floor(idx / size)][idx % size] = true; });
  const board = solution.map((row, r) => row.map((v, c) => (isGiven[r][c] ? v : 0)));

  let selected = null;
  let mistakes = 0, finished = false;

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
    btn.textContent = n;
    btn.addEventListener('click', () => placeNumber(n));
    numpadEl.appendChild(btn);
  }
  const eraseBtn = document.createElement('button');
  eraseBtn.className = 'su-numbtn su-numbtn--erase';
  eraseBtn.textContent = '✕';
  eraseBtn.addEventListener('click', () => placeNumber(0));
  numpadEl.appendChild(eraseBtn);

  const stage = createStage(canvasHost, { distance: size * CELL * 2.4 });

  // box divider lines (subtle grid over the board)
  const gridLineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
  const half = (size * CELL) / 2;
  for (let i = 0; i <= size; i += boxW) {
    const x = -half + i * CELL;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -half, 0.14), new THREE.Vector3(x, half, 0.14)]);
    stage.world.add(new THREE.Line(geo, gridLineMat));
  }
  for (let j = 0; j <= size; j += boxH) {
    const y = -half + j * CELL;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-half, y, 0.14), new THREE.Vector3(half, y, 0.14)]);
    stage.world.add(new THREE.Line(geo, gridLineMat));
  }

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size, CELL);
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

  function onPointerDown(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, meshes.flat());
    if (!hit) return;
    const { r, c } = hit.object.userData;
    if (isGiven[r][c]) { api.sound.click(); setSelected(r, c); return; }
    setSelected(r, c);
    api.sound.click();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function placeNumber(n) {
    if (!selected || finished) return;
    const { r, c } = selected;
    if (isGiven[r][c]) { api.sound.error(); api.ui.shake(canvasHost); return; }
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
      setTimeout(() => { board[r][c] = 0; refreshCell(r, c); mesh.material.color.set(SELECTED_COLOR); }, 450);
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
    setTimeout(() => api.win(stars, { mistakes }), 300);
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
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('sudoku', { mount });
