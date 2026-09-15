/**
 * Game 1 - Sliding Tile Puzzle (3D). Tap a tile next to the gap to slide
 * it across a tilted tabletop. 3x3 / 4x4 / 5x5 tiers.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const SIZE_BY_DIFFICULTY = { easy: 3, medium: 4, hard: 5 };
const MOVE_STAR_THRESHOLDS = { 3: [40, 70], 4: [90, 150], 5: [160, 260] };
const SPACING = 1.12;
const TILE_SIZE = 1;
const TILE_DEPTH = 0.3;

function starsForMoves(size, moves) {
  const [three, two] = MOVE_STAR_THRESHOLDS[size];
  if (moves <= three) return 3;
  if (moves <= two) return 2;
  return 1;
}

function buildSolved(size) {
  const arr = [];
  for (let i = 1; i < size * size; i++) arr.push(i);
  arr.push(0);
  return arr;
}

function isSolvable(arr, size) {
  const flat = arr.filter((n) => n !== 0);
  let inversions = 0;
  for (let i = 0; i < flat.length; i++) for (let j = i + 1; j < flat.length; j++) if (flat[i] > flat[j]) inversions++;
  if (size % 2 === 1) return inversions % 2 === 0;
  const blankRow = Math.floor(arr.indexOf(0) / size);
  const rowFromBottom = size - blankRow;
  return (inversions + rowFromBottom) % 2 === 0;
}

function neighborIndices(i, size) {
  const row = Math.floor(i / size), col = i % size;
  const out = [];
  if (row > 0) out.push(i - size);
  if (row < size - 1) out.push(i + size);
  if (col > 0) out.push(i - 1);
  if (col < size - 1) out.push(i + 1);
  return out;
}

function shuffledBoard(size) {
  let arr = buildSolved(size);
  let blank = arr.indexOf(0);
  let lastBlank = -1;
  for (let i = 0; i < size * size * 30; i++) {
    const neighbors = neighborIndices(blank, size).filter((n) => n !== lastBlank);
    const next = neighbors[Math.floor(Math.random() * neighbors.length)];
    [arr[blank], arr[next]] = [arr[next], arr[blank]];
    lastBlank = blank; blank = next;
  }
  return arr;
}

function cellXY(idx, size) {
  const row = Math.floor(idx / size), col = idx % size;
  const half = (size - 1) / 2;
  return { x: (col - half) * SPACING, y: (half - row) * SPACING };
}

function mount(container, difficulty, api) {
  const size = SIZE_BY_DIFFICULTY[difficulty];
  let board = shuffledBoard(size);
  if (!isSolvable(board, size)) board = shuffledBoard(size);
  let moves = 0;
  let solved = false;
  let busy = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sl-meta"><span>Moves: <span id="sl-moves">0</span></span></div>
    <div class="pc-canvas3d" id="sl-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a tile next to the gap to slide it</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#sl-canvas');
  const movesEl = wrap.querySelector('#sl-moves');

  const stage = createStage(canvasHost, { distance: size * 2.6, lookAtY: 0 });

  const meshByValue = new Map();
  for (let idx = 0; idx < board.length; idx++) {
    const val = board[idx];
    if (val === 0) continue;
    const { x, y } = cellXY(idx, size);
    const mesh = makeTile({ w: TILE_SIZE, h: TILE_SIZE, depth: TILE_DEPTH, radius: 0.16, color: PALETTE[val % PALETTE.length] });
    mesh.position.set(x, y, 0);
    mesh.userData.value = val;
    applyLabel(mesh, String(val), { size: 128, w: 0.62, h: 0.62 });
    stage.world.add(mesh);
    popIn(mesh, { delay: idx * 18 });
    meshByValue.set(val, mesh);
  }

  function meshList() { return [...meshByValue.values()]; }

  function onPointerDown(e) {
    if (busy || solved) return;
    const hit = stage.pick(e.clientX, e.clientY, meshList());
    if (!hit) return;
    const val = hit.object.userData.value;
    const idx = board.indexOf(val);
    tryMove(idx);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function tryMove(idx) {
    const blank = board.indexOf(0);
    if (!neighborIndices(blank, size).includes(idx)) {
      api.sound.error();
      api.ui.shake(canvasHost);
      return;
    }
    const val = board[idx];
    [board[blank], board[idx]] = [board[idx], board[blank]];
    moves++;
    movesEl.textContent = moves;
    api.sound.move();
    const mesh = meshByValue.get(val);
    const target = cellXY(blank, size);
    busy = true;
    tween(mesh.position, { x: target.x, y: target.y }, 160, Easing.outCubic, () => { busy = false; checkWin(); });
  }

  function checkWin() {
    const target = buildSolved(size);
    if (board.every((v, i) => v === target[i])) {
      solved = true;
      stage.renderer.domElement.getBoundingClientRect && api.ui.burst(
        canvasHost.getBoundingClientRect().left + canvasHost.clientWidth / 2,
        canvasHost.getBoundingClientRect().top + canvasHost.clientHeight / 2
      );
      const stars = starsForMoves(size, moves);
      setTimeout(() => api.win(stars, { moves }), 250);
    }
  }

  return () => {
    stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    stage.dispose();
    wrap.remove();
  };
}

PC.Games.register('sliding', { mount });
