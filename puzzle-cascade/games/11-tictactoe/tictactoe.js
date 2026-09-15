/**
 * Game 11 - Tic-Tac-Toe vs AI (3D). Tap an empty square to place your X;
 * the AI answers with O. Difficulty controls how smart the AI plays.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { ai: 'random' },
  medium: { ai: 'heuristic' },
  hard: { ai: 'minimax' },
};
const CELL = 1.15;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const X_COLOR = 0xff4d8d;
const O_COLOR = 0x3f8efc;
const EMPTY_COLOR = 0x2b0f5c;

function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every((v) => v)) return 'draw';
  return null;
}

function emptyCells(board) {
  const out = [];
  board.forEach((v, i) => { if (!v) out.push(i); });
  return out;
}

function minimax(board, player, ai, human, depth = 0) {
  const w = winner(board);
  if (w === ai) return { score: 10 - depth };
  if (w === human) return { score: depth - 10 };
  if (w === 'draw') return { score: 0 };
  const moves = [];
  for (const idx of emptyCells(board)) {
    const copy = board.slice();
    copy[idx] = player;
    const result = minimax(copy, player === ai ? human : ai, ai, human, depth + 1);
    moves.push({ idx, score: result.score });
  }
  if (player === ai) {
    return moves.reduce((best, m) => (m.score > best.score ? m : best));
  }
  return moves.reduce((best, m) => (m.score < best.score ? m : best));
}

function bestMove(board, ai, human) {
  const result = minimax(board, ai, ai, human);
  return result.idx;
}

function heuristicMove(board, ai, human) {
  // 1) win if possible
  for (const idx of emptyCells(board)) {
    const copy = board.slice(); copy[idx] = ai;
    if (winner(copy) === ai) return idx;
  }
  // 2) block opponent's win
  for (const idx of emptyCells(board)) {
    const copy = board.slice(); copy[idx] = human;
    if (winner(copy) === human) return idx;
  }
  // 3) take center
  if (!board[4]) return 4;
  // 4) take a corner
  const corners = [0, 2, 6, 8].filter((i) => !board[i]);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  // 5) anything
  const rest = emptyCells(board);
  return rest[Math.floor(Math.random() * rest.length)];
}

function cellXY(idx) {
  const r = Math.floor(idx / 3), c = idx % 3;
  return { x: (c - 1) * CELL, y: (1 - r) * CELL };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  let board = Array(9).fill(null);
  let finished = false;
  let aiThinking = false;
  let moves = 0;
  const HUMAN = 'X', AI = 'O';

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="tt-meta"><span id="tt-status">Your turn - tap a square</span></div>
    <div class="pc-canvas3d" id="tt-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">You are X, the computer is O</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#tt-canvas');
  const statusEl = wrap.querySelector('#tt-status');

  const stage = createStage(canvasHost, { distance: 5.6 });

  const cellMeshes = [];
  for (let i = 0; i < 9; i++) {
    const { x, y } = cellXY(i);
    const mesh = makeTile({ w: 1, h: 1, depth: 0.22, radius: 0.14, color: EMPTY_COLOR });
    mesh.position.set(x, y, 0);
    mesh.userData = { idx: i };
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 30 });
    cellMeshes.push(mesh);
  }

  function markCell(idx, who) {
    const mesh = cellMeshes[idx];
    mesh.material.color.set(who === HUMAN ? X_COLOR : O_COLOR);
    mesh.material.emissiveIntensity = 0;
    applyLabel(mesh, who, { size: 128, w: 0.6, h: 0.6, color: '#ffffff' });
    tween(mesh.scale, { x: 1.08, y: 1.08, z: 1.08 }, 150, Easing.outBack, () =>
      tween(mesh.scale, { x: 1, y: 1, z: 1 }, 150, Easing.outCubic));
  }

  function highlightLine(line) {
    line.forEach((idx, i) => {
      const mesh = cellMeshes[idx];
      setTimeout(() => tween(mesh.material, { emissiveIntensity: 0.8 }, 200, Easing.outCubic), i * 80);
    });
  }

  function checkEnd() {
    const w = winner(board);
    if (!w) return false;
    finished = true;
    if (w === 'draw') {
      statusEl.textContent = "It's a draw!";
      setTimeout(() => api.win(2, { result: 'draw' }), 300);
    } else {
      for (const line of LINES) {
        if (line.every((i) => board[i] === w)) { highlightLine(line); break; }
      }
      if (w === HUMAN) {
        statusEl.textContent = 'You win!';
        api.ui.burstFromElement(canvasHost);
        setTimeout(() => api.win(3, { moves }), 350);
      } else {
        statusEl.textContent = 'The computer wins.';
        setTimeout(() => api.lose('the computer got three in a row! Try again.'), 350);
      }
    }
    return true;
  }

  function aiMove() {
    if (finished) return;
    aiThinking = true;
    statusEl.textContent = "Computer's turn...";
    setTimeout(() => {
      let idx;
      if (cfg.ai === 'random') {
        const rest = emptyCells(board);
        idx = rest[Math.floor(Math.random() * rest.length)];
      } else if (cfg.ai === 'heuristic') {
        idx = heuristicMove(board, AI, HUMAN);
      } else {
        idx = bestMove(board, AI, HUMAN);
      }
      board[idx] = AI;
      markCell(idx, AI);
      api.sound.move();
      aiThinking = false;
      if (!checkEnd()) statusEl.textContent = 'Your turn - tap a square';
    }, 420);
  }

  function onPointerDown(e) {
    if (finished || aiThinking) return;
    const hit = stage.pick(e.clientX, e.clientY, cellMeshes);
    if (!hit) return;
    const idx = hit.object.userData.idx;
    if (board[idx]) { api.sound.error(); api.ui.shake(canvasHost); return; }
    board[idx] = HUMAN;
    moves++;
    markCell(idx, HUMAN);
    api.sound.click();
    if (!checkEnd()) aiMove();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished || aiThinking) return;
    const idx = bestMove(board, HUMAN, AI);
    if (idx === undefined || idx === null) return;
    const mesh = cellMeshes[idx];
    tween(mesh.scale, { x: 1.35, y: 1.35, z: 1.35 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try that glowing square!`);
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

PC.Games.register('tictactoe', { mount });
