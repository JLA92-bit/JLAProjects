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


function cellXY(idx) {
  const r = Math.floor(idx / 3), c = idx % 3;
  return { x: (c - 1) * CELL, y: (1 - r) * CELL };
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
  const life = lifecycle();
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
  fitBoard(stage, canvasHost, 2 * CELL + 1.1, 2 * CELL + 1.1, { pad: 16, bottom: 50 });

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
      mesh.material.emissive.set(0xffffff);
      life.later(() => tween(mesh.material, { emissiveIntensity: 0.35 }, 200, Easing.outCubic), i * 80);
    });
  }

  function checkEnd() {
    const w = winner(board);
    if (!w) return false;
    finished = true;
    if (w === 'draw') {
      statusEl.textContent = "It's a draw!";
      life.later(() => api.win(2, { result: 'draw' }), 300);
    } else {
      for (const line of LINES) {
        if (line.every((i) => board[i] === w)) { highlightLine(line); break; }
      }
      if (w === HUMAN) {
        statusEl.textContent = 'You win!';
        api.ui.burstFromElement(canvasHost);
        life.later(() => api.win(3, { moves }), 350);
      } else {
        statusEl.textContent = 'The computer wins this time.';
        life.later(() => {
          api.lose('the computer got three in a row! Try again.');
          showRetry(canvasHost, restart);
        }, 450);
      }
    }
    return true;
  }

  function aiMove() {
    if (finished) return;
    aiThinking = true;
    statusEl.textContent = "Computer's turn...";
    life.later(() => {
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
    const pt = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!pt) return;
    const c = Math.round(pt.x / CELL) + 1, r = 1 - Math.round(pt.y / CELL);
    if (r < 0 || r > 2 || c < 0 || c > 2) return;
    const idx = r * 3 + c;
    if (board[idx]) { api.sound.error(); api.ui.shake(canvasHost); return; }
    board[idx] = HUMAN;
    moves++;
    markCell(idx, HUMAN);
    api.sound.click();
    if (!checkEnd()) aiMove();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, this game is over!`); return; }
    if (aiThinking) return;
    // opening move: centre is always a strong choice (and skips a full search)
    const idx = emptyCells(board).length === 9 ? 4 : bestMove(board, HUMAN, AI);
    if (idx === undefined || idx === null) return;
    glow(cellMeshes[idx]);
    api.ui.toast(`${api.playerName}, try that glowing square!`);
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

PC.Games.register('tictactoe', { mount });
