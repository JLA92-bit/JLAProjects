/**
 * Game 21 - Reversi / Othello vs AI (3D). Standard 8x8 board. Tap an
 * empty square that would flank at least one AI disc to place your
 * disc and flip every bracketed line. Most discs when the board fills
 * (or neither side can move) wins.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const SIZE = 8;
const CELL = 1.0;
const BOARD_COLOR = 0x1c6e4a;
const CELL_COLOR_A = 0x1f7a52;
const CELL_COLOR_B = 0x1c6e4a;
const HUMAN = 1, AI = 2;
// You play white (matching the intro card's example), the computer black.
const HUMAN_COLOR = 0xfffaf2;
const AI_COLOR = 0x241436;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

const CONFIG = {
  easy: { level: 'random' },
  medium: { level: 'greedy' },
  hard: { level: 'minimax', depth: 4 },
};

const WEIGHTS = [
  [100, -20, 10, 5, 5, 10, -20, 100],
  [-20, -50, -2, -2, -2, -2, -50, -20],
  [10, -2, -1, -1, -1, -1, -2, 10],
  [5, -2, -1, -1, -1, -1, -2, 5],
  [5, -2, -1, -1, -1, -1, -2, 5],
  [10, -2, -1, -1, -1, -1, -2, 10],
  [-20, -50, -2, -2, -2, -2, -50, -20],
  [100, -20, 10, 5, 5, 10, -20, 100],
];

function emptyBoard() {
  const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  b[3][3] = AI; b[3][4] = HUMAN; b[4][3] = HUMAN; b[4][4] = AI;
  return b;
}

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

function flipsFor(board, r, c, player) {
  if (board[r][c] !== 0) return [];
  const opp = player === HUMAN ? AI : HUMAN;
  const all = [];
  for (const [dr, dc] of DIRS) {
    let rr = r + dr, cc = c + dc;
    const line = [];
    while (inBounds(rr, cc) && board[rr][cc] === opp) { line.push([rr, cc]); rr += dr; cc += dc; }
    if (line.length && inBounds(rr, cc) && board[rr][cc] === player) all.push(...line);
  }
  return all;
}

function legalMoves(board, player) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const flips = flipsFor(board, r, c, player);
    if (flips.length) moves.push({ r, c, flips });
  }
  return moves;
}

function applyMove(board, move, player) {
  board[move.r][move.c] = player;
  move.flips.forEach(([r, c]) => { board[r][c] = player; });
}

function cloneBoard(b) { return b.map((row) => row.slice()); }

function evaluate(board, player, opp) {
  let score = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] === player) score += WEIGHTS[r][c];
    else if (board[r][c] === opp) score -= WEIGHTS[r][c];
  }
  const mobility = legalMoves(board, player).length - legalMoves(board, opp).length;
  score += mobility * 3;
  return score;
}

function minimax(board, depth, alpha, beta, maximizing, player, opp) {
  const who = maximizing ? player : opp;
  const moves = legalMoves(board, who);
  if (depth === 0) return { score: evaluate(board, player, opp) };
  if (!moves.length) {
    const otherMoves = legalMoves(board, maximizing ? opp : player);
    if (!otherMoves.length) return { score: evaluate(board, player, opp) };
    return minimax(board, depth - 1, alpha, beta, !maximizing, player, opp);
  }
  let best = null;
  for (const move of moves) {
    const b2 = cloneBoard(board);
    applyMove(b2, move, who);
    const result = minimax(b2, depth - 1, alpha, beta, !maximizing, player, opp);
    if (maximizing) {
      if (best === null || result.score > best.score) best = { score: result.score, move };
      alpha = Math.max(alpha, result.score);
    } else {
      if (best === null || result.score < best.score) best = { score: result.score, move };
      beta = Math.min(beta, result.score);
    }
    if (alpha >= beta) break;
  }
  return best;
}

function chooseMove(board, level, player, opp, depth) {
  const moves = legalMoves(board, player);
  if (!moves.length) return null;
  if (level === 'random') return moves[Math.floor(Math.random() * moves.length)];
  if (level === 'greedy') {
    let best = moves[0];
    moves.forEach((m) => { if (m.flips.length > best.flips.length) best = m; });
    return best;
  }
  const result = minimax(board, depth || 4, -Infinity, Infinity, true, player, opp);
  return (result && result.move) || moves[Math.floor(Math.random() * moves.length)];
}

function cellXY(r, c) {
  const half = (SIZE - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
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
  let board = emptyBoard();
  let finished = false, aiThinking = false, busy = false, moves = 0, passes = 0;
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="rv-meta">
      <span class="rv-score"><span class="rv-dot rv-dot--you"></span> You: <span id="rv-you">2</span></span>
      <span id="rv-status">Your turn</span>
      <span class="rv-score"><span class="rv-dot rv-dot--ai"></span> Computer: <span id="rv-ai">2</span></span>
    </div>
    <div class="pc-canvas3d" id="rv-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">You are white - tap a glowing square</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#rv-canvas');
  const statusEl = wrap.querySelector('#rv-status');
  const youEl = wrap.querySelector('#rv-you');
  const aiEl = wrap.querySelector('#rv-ai');

  const boardHalf = (SIZE * CELL) / 2 + 0.3;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, boardHalf, boardHalf + 0.6) });

  const boardMat = new THREE.MeshStandardMaterial({ color: BOARD_COLOR, roughness: 0.65, metalness: 0.05 });
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE * CELL + 0.4, SIZE * CELL + 0.4, 0.3), boardMat);
  boardMesh.position.z = -0.22;
  boardMesh.receiveShadow = true;
  stage.world.add(boardMesh);
  popIn(boardMesh, { duration: 260 });

  const cellMeshes = [];
  const discMeshes = [];
  for (let r = 0; r < SIZE; r++) {
    const cellRow = [], discRow = [];
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = cellXY(r, c);
      const cell = makeTile({ w: 0.94, h: 0.94, depth: 0.1, radius: 0.08, color: (r + c) % 2 === 0 ? CELL_COLOR_A : CELL_COLOR_B, roughness: 0.8 });
      cell.position.set(x, y, -0.02);
      cell.userData = { r, c };
      stage.world.add(cell);
      cellRow.push(cell);
      discRow.push(null);
    }
    cellMeshes.push(cellRow);
    discMeshes.push(discRow);
  }

  function makeDisc(player) {
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.18, 28);
    const mat = new THREE.MeshPhysicalMaterial({ color: player === HUMAN ? HUMAN_COLOR : AI_COLOR, roughness: 0.3, metalness: 0.15, clearcoat: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    return mesh;
  }

  function placeDisc(r, c, player, animate) {
    const { x, y } = cellXY(r, c);
    const mesh = makeDisc(player);
    mesh.position.set(x, y, 0.12);
    stage.world.add(mesh);
    discMeshes[r][c] = mesh;
    if (animate) popIn(mesh, { duration: 220 });
  }

  function flipDisc(r, c, player) {
    const mesh = discMeshes[r][c];
    if (!mesh) return;
    tween(mesh.scale, { x: 0.05 }, 140, Easing.inOutQuad, () => {
      mesh.material.color.set(player === HUMAN ? HUMAN_COLOR : AI_COLOR);
      tween(mesh.scale, { x: 1 }, 140, Easing.outBack);
    });
  }

  // small ring marking the computer's most recent move
  const lastMarker = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff4d8d, toneMapped: false }));
  lastMarker.visible = false;
  stage.world.add(lastMarker);
  function markLast(r, c) {
    const { x, y } = cellXY(r, c);
    lastMarker.position.set(x, y, 0.24);
    lastMarker.visible = true;
  }

  function syncCounts() {
    let you = 0, ai = 0;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { if (board[r][c] === HUMAN) you++; else if (board[r][c] === AI) ai++; }
    youEl.textContent = you; aiEl.textContent = ai;
    return { you, ai };
  }

  // initial discs
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]) placeDisc(r, c, board[r][c], false);
  syncCounts();

  function highlightLegal(player) {
    cellMeshes.flat().forEach((m) => m.material.emissiveIntensity = 0);
    if (player !== HUMAN) return;
    const moves = legalMoves(board, HUMAN);
    moves.forEach((m) => {
      const cell = cellMeshes[m.r][m.c];
      cell.material.emissive.set(0xffd93d);
      cell.material.emissiveIntensity = 0.35;
    });
    return moves;
  }

  function endGame() {
    finished = true;
    const { you, ai } = syncCounts();
    cellMeshes.flat().forEach((m) => { m.material.emissiveIntensity = 0; });
    if (you === ai) { statusEl.textContent = "It's a tie!"; timers.later(() => api.win(2, { you, ai }), 300); return; }
    if (you > ai) {
      statusEl.textContent = 'You win!';
      api.ui.burstFromElement(canvasHost);
      const margin = you - ai;
      const stars = margin >= 20 ? 3 : margin >= 8 ? 2 : 1;
      timers.later(() => api.win(stars, { you, ai, moves }), 300);
    } else {
      statusEl.textContent = 'The computer wins.';
      timers.later(() => api.lose(`the computer finished with ${ai} discs to your ${you}. Try again!`), 300);
    }
  }

  function afterMove(activePlayer) {
    const otherPlayer = activePlayer === HUMAN ? AI : HUMAN;
    const otherMoves = legalMoves(board, otherPlayer);
    const selfMoves = legalMoves(board, activePlayer);
    if (!otherMoves.length && !selfMoves.length) { endGame(); return; }
    if (!otherMoves.length) {
      // other side has to pass
      passes++;
      api.ui.toast(activePlayer === HUMAN ? 'The computer has no move - go again!' : 'You have no move this time - the computer goes again.');
      if (activePlayer === HUMAN) turnHuman(); else turnAI();
      return;
    }
    if (otherPlayer === AI) turnAI(); else turnHuman();
  }

  function turnHuman() {
    aiThinking = false;
    busy = false;
    statusEl.textContent = 'Your turn';
    highlightLegal(HUMAN);
  }

  function turnAI() {
    aiThinking = true;
    statusEl.textContent = 'Computer is thinking...';
    highlightLegal(AI);
    timers.later(() => {
      if (finished) return;
      const move = chooseMove(board, cfg.level, AI, HUMAN, cfg.depth);
      if (!move) { afterMove(AI); return; }
      applyMove(board, move, AI);
      placeDisc(move.r, move.c, AI, true);
      markLast(move.r, move.c);
      move.flips.forEach(([r, c]) => flipDisc(r, c, AI));
      moves++;
      syncCounts();
      api.sound.move();
      timers.later(() => { if (!finished) afterMove(AI); }, 320);
    }, 500);
  }

  function onPointerDown(e) {
    if (finished || aiThinking || busy) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!p) return;
    const half = (SIZE - 1) / 2;
    const r = Math.round(half - p.y / CELL), c = Math.round(p.x / CELL + half);
    if (!inBounds(r, c)) return;
    const flips = flipsFor(board, r, c, HUMAN);
    if (!flips.length) {
      api.sound.error();
      api.ui.shake(canvasHost);
      api.ui.toast(board[r][c] ? 'That square is taken - tap a glowing one.' : 'No discs to flip there - tap a glowing square.');
      return;
    }
    busy = true;
    cellMeshes.flat().forEach((m) => { m.material.emissiveIntensity = 0; });
    lastMarker.visible = false;
    applyMove(board, { r, c, flips }, HUMAN);
    api.sound.click();
    placeDisc(r, c, HUMAN, true);
    flips.forEach(([fr, fc]) => flipDisc(fr, fc, HUMAN));
    moves++;
    syncCounts();
    timers.later(() => { if (!finished) afterMove(HUMAN); }, 320);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  turnHuman();

  function hint() {
    if (finished) return;
    if (aiThinking || busy) { api.ui.toast(`${api.playerName}, wait for the computer to finish its move.`); return; }
    const move = chooseMove(board, 'minimax', HUMAN, AI, 4);
    if (!move) { api.ui.toast(`${api.playerName}, you have no legal move - pass.`); return; }
    const cell = cellMeshes[move.r][move.c];
    tween(cell.scale, { x: 1.15, y: 1.15, z: 1.15 }, 180, Easing.outBack, () => tween(cell.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try the glowing square!`);
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

PC.Games.register('reversi', { mount: guardMount(mount, { retry: true }) });
