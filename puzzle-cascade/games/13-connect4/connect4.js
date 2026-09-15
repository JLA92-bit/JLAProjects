/**
 * Game 13 - Connect Four vs AI (3D). Tap a column to drop your disc;
 * get four in a row (any direction) before the AI does.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const COLS = 7, ROWS = 6;
const CONFIG = {
  easy: { depth: 0 },   // random
  medium: { depth: 1 }, // win/block only
  hard: { depth: 4 },   // minimax lookahead
};
const CELL = 1.0;
const HOLE_COLOR = 0x1a0c30;
const HUMAN_COLOR = 0xff4d8d;
const AI_COLOR = 0xffd93d;
const HUMAN = 1, AI = 2;

function cellXY(col, row) {
  const halfC = (COLS - 1) / 2, halfR = (ROWS - 1) / 2;
  return { x: (col - halfC) * CELL, y: (row - halfR) * CELL };
}

function cloneGrid(grid) { return grid.map((c) => c.slice()); }
function validCols(grid) { const out = []; for (let c = 0; c < COLS; c++) if (grid[c].length < ROWS) out.push(c); return out; }
function drop(grid, col, who) { grid[col].push(who); return grid[col].length - 1; }

function cellIs(grid, c, r, who) {
  return c >= 0 && c < COLS && r >= 0 && r < grid[c].length && grid[c][r] === who;
}

function checkWinAt(grid, col, row, who) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    let count = 1;
    for (let s = 1; s < 4; s++) {
      if (cellIs(grid, col + dx * s, row + dy * s, who)) count++; else break;
    }
    for (let s = 1; s < 4; s++) {
      if (cellIs(grid, col - dx * s, row - dy * s, who)) count++; else break;
    }
    if (count >= 4) return true;
  }
  return false;
}

function boardFull(grid) { return grid.every((c) => c.length === ROWS); }

function scoreWindow(cells, who, opp) {
  const countWho = cells.filter((v) => v === who).length;
  const countOpp = cells.filter((v) => v === opp).length;
  const countEmpty = cells.filter((v) => !v).length;
  if (countWho > 0 && countOpp > 0) return 0;
  if (countWho === 4) return 1000;
  if (countWho === 3 && countEmpty === 1) return 50;
  if (countWho === 2 && countEmpty === 2) return 10;
  if (countOpp === 3 && countEmpty === 1) return -80;
  return 0;
}

function evaluate(grid, who, opp) {
  let score = 0;
  const get = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS ? (grid[c][r] || 0) : undefined);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const windows = [
        [get(c, r), get(c + 1, r), get(c + 2, r), get(c + 3, r)],
        [get(c, r), get(c, r + 1), get(c, r + 2), get(c, r + 3)],
        [get(c, r), get(c + 1, r + 1), get(c + 2, r + 2), get(c + 3, r + 3)],
        [get(c, r), get(c + 1, r - 1), get(c + 2, r - 2), get(c + 3, r - 3)],
      ];
      windows.forEach((w) => { if (w.every((v) => v !== undefined)) score += scoreWindow(w, who, opp); });
    }
  }
  // center column preference
  for (let r = 0; r < grid[3].length; r++) if (grid[3][r] === who) score += 6;
  return score;
}

function minimax(grid, depth, alpha, beta, maximizing, who, opp) {
  const cols = validCols(grid);
  if (depth === 0 || cols.length === 0) return { score: evaluate(grid, who, opp) };
  if (maximizing) {
    let best = { score: -Infinity, col: cols[0] };
    for (const col of cols) {
      const g = cloneGrid(grid);
      const row = drop(g, col, who);
      if (checkWinAt(g, col, row, who)) { return { score: 100000 + depth, col }; }
      const result = minimax(g, depth - 1, alpha, beta, false, who, opp);
      if (result.score > best.score) best = { score: result.score, col };
      alpha = Math.max(alpha, result.score);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = { score: Infinity, col: cols[0] };
    for (const col of cols) {
      const g = cloneGrid(grid);
      const row = drop(g, col, opp);
      if (checkWinAt(g, col, row, opp)) { return { score: -100000 - depth, col }; }
      const result = minimax(g, depth - 1, alpha, beta, true, who, opp);
      if (result.score < best.score) best = { score: result.score, col };
      beta = Math.min(beta, result.score);
      if (alpha >= beta) break;
    }
    return best;
  }
}

function aiChoose(grid, depth, who, opp) {
  const cols = validCols(grid);
  if (depth === 0) {
    // easy: mostly random, but still block an immediate loss sometimes
    for (const col of cols) {
      const g = cloneGrid(grid); const row = drop(g, col, who);
      if (checkWinAt(g, col, row, who)) return col;
    }
    return cols[Math.floor(Math.random() * cols.length)];
  }
  const result = minimax(grid, depth, -Infinity, Infinity, true, who, opp);
  return result.col !== undefined ? result.col : cols[Math.floor(Math.random() * cols.length)];
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  let grid = Array.from({ length: COLS }, () => []);
  let finished = false, aiThinking = false, moves = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="c4-meta"><span id="c4-status">Your turn - tap a column</span></div>
    <div class="pc-canvas3d" id="c4-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a column to drop your disc</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#c4-canvas');
  const statusEl = wrap.querySelector('#c4-status');

  const stage = createStage(canvasHost, { distance: 7.2 });

  const boardMat = new THREE.MeshStandardMaterial({ color: 0x3f2a7c, roughness: 0.55, metalness: 0.1 });
  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(COLS * CELL + 0.5, ROWS * CELL + 0.5, 0.3), boardMat);
  boardMesh.position.z = -0.25;
  boardMesh.receiveShadow = true;
  stage.world.add(boardMesh);

  const holeMeshes = [];
  for (let c = 0; c < COLS; c++) {
    const colArr = [];
    for (let r = 0; r < ROWS; r++) {
      const { x, y } = cellXY(c, r);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 24), new THREE.MeshStandardMaterial({ color: HOLE_COLOR, roughness: 0.9 }));
      hole.rotation.x = Math.PI / 2;
      hole.position.set(x, y, -0.05);
      stage.world.add(hole);
      colArr.push(hole);
    }
    holeMeshes.push(colArr);
  }

  // Column tap zones (invisible tall tiles above the board)
  const colZones = [];
  for (let c = 0; c < COLS; c++) {
    const { x } = cellXY(c, 0);
    const zone = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.9, ROWS * CELL + 1, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
    zone.position.set(x, 0, 0.3);
    zone.userData = { col: c };
    stage.world.add(zone);
    colZones.push(zone);
  }
  popIn(boardMesh, { duration: 260 });

  const discMeshes = [];

  function dropDisc(col, who, isPlayer) {
    const row = drop(grid, col, who);
    moves++;
    const color = who === HUMAN ? HUMAN_COLOR : AI_COLOR;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.15 }));
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    const target = cellXY(col, row);
    disc.position.set(target.x, ROWS * CELL, 0.05);
    stage.world.add(disc);
    discMeshes.push(disc);
    api.sound.move();
    tween(disc.position, { y: target.y }, 260 + row * 40, Easing.outCubic, () => {
      api.sound.click();
      const won = checkWinAt(grid, col, row, who);
      if (won) {
        finished = true;
        highlightWinDiscs(col, row, who);
        if (who === HUMAN) {
          statusEl.textContent = 'You win!';
          api.ui.burstFromElement(canvasHost);
          setTimeout(() => api.win(difficulty === 'hard' ? 3 : 3, { moves }), 350);
        } else {
          statusEl.textContent = 'The computer wins.';
          setTimeout(() => api.lose('the computer connected four! Try again.'), 350);
        }
      } else if (boardFull(grid)) {
        finished = true;
        statusEl.textContent = "It's a draw!";
        setTimeout(() => api.win(2, { moves, result: 'draw' }), 300);
      } else if (isPlayer) {
        aiTurn();
      } else {
        statusEl.textContent = 'Your turn - tap a column';
      }
    });
  }

  function highlightWinDiscs(col, row, who) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of dirs) {
      const line = [[col, row]];
      for (let s = 1; s < 4; s++) { const c = col + dx * s, r = row + dy * s; if (grid[c] && grid[c][r] === who) line.push([c, r]); else break; }
      for (let s = 1; s < 4; s++) { const c = col - dx * s, r = row - dy * s; if (grid[c] && grid[c][r] === who) line.push([c, r]); else break; }
      if (line.length >= 4) {
        line.forEach(([c, r], i) => {
          const disc = discMeshes.find((d) => Math.abs(d.position.x - cellXY(c, r).x) < 0.01 && Math.abs(d.position.y - cellXY(c, r).y) < 0.01);
          if (disc) setTimeout(() => tween(disc.scale, { x: 1.2, y: 1.2, z: 1.2 }, 200, Easing.outBack), i * 60);
        });
        return;
      }
    }
  }

  function aiTurn() {
    aiThinking = true;
    statusEl.textContent = "Computer's turn...";
    setTimeout(() => {
      const col = aiChoose(grid, cfg.depth, AI, HUMAN);
      aiThinking = false;
      dropDisc(col, AI, false);
    }, 450);
  }

  function onPointerDown(e) {
    if (finished || aiThinking) return;
    const hit = stage.pick(e.clientX, e.clientY, colZones);
    if (!hit) return;
    const col = hit.object.userData.col;
    if (grid[col].length >= ROWS) { api.sound.error(); api.ui.shake(canvasHost); return; }
    dropDisc(col, HUMAN, true);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished || aiThinking) return;
    const col = aiChoose(grid, Math.max(cfg.depth, 3), HUMAN, AI);
    api.ui.toast(`${api.playerName}, try dropping in column ${col + 1}!`);
    const marker = holeMeshes[col][grid[col].length] || holeMeshes[col][ROWS - 1];
    tween(marker.scale, { x: 1.4, y: 1.4, z: 1.4 }, 180, Easing.outBack, () => tween(marker.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
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

PC.Games.register('connect4', { mount });
