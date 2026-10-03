/**
 * Game 36 - Block Drop (mini Tetris). Falling tetrominoes on a narrow
 * portrait-friendly grid. Move/rotate/drop with on-screen buttons or
 * swipes, clear lines, and reach the target line count to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { cols: 6, rows: 12, fallMs: 900, targetLines: 8 },
  medium: { cols: 6, rows: 14, fallMs: 680, targetLines: 12 },
  hard: { cols: 7, rows: 16, fallMs: 480, targetLines: 16 },
};

const SHAPES = {
  I: { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: 0x17c3b2 },
  O: { cells: [[1, 0], [2, 0], [1, 1], [2, 1]], color: 0xffd93d },
  T: { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: 0xa259ff },
  S: { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: 0x23d18b },
  Z: { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: 0xff5c5c },
  J: { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: 0x3f8efc },
  L: { cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: 0xff9f43 },
};
const SHAPE_KEYS = Object.keys(SHAPES);

function rotateCells(cells) {
  // rotate 90deg within a 4x4 box
  return cells.map(([x, y]) => [3 - y, x]);
}

function randomShape() { return SHAPE_KEYS[Math.floor(Math.random() * SHAPE_KEYS.length)]; }

const CELL = 0.72;

// Fit a (halfW x halfH) world rectangle inside the canvas host, measured at
// mount time, leaving room for DOM overlays (reserve, in px) and a small
// safety margin so nothing crops on narrow phones.
function fitView(host, halfW, halfH, { margin = 1.04, reserveTop = 0, reserveBottom = 0 } = {}) {
  const w = host.clientWidth || 320, h = host.clientHeight || 480;
  const aspect = Math.max(0.3, w / h);
  const f = Math.max(0.5, (h - reserveTop - reserveBottom) / h);
  const halfVis = Math.max(halfH / f, halfW / aspect) * margin;
  return { distance: halfVis / 0.42, lookAtY: -halfVis * (reserveBottom - reserveTop) / h };
}

function mount(container, difficulty, api) {
  let game = null;
  const start = () => { game = play(container, difficulty, api, restart); };
  function restart() { if (game) game.unmount(); start(); }
  start();
  return {
    unmount: () => { if (game) game.unmount(); game = null; },
    hint: () => { if (game) game.hint(); },
  };
}

function play(container, difficulty, api, restart) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  let alive = true;
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
    timers.add(id);
  }
  const { cols, rows } = cfg;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  let linesCleared = 0, piecesUsed = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bd-meta">Lines: <span id="bd-lines">0</span>/${cfg.targetLines}</div>
    <div class="pc-canvas3d" id="bd-canvas"></div>
    <div class="bd-controls">
      <div class="bd-btn" role="button" aria-label="Move left" data-act="left">⬅️</div>
      <div class="bd-btn" role="button" aria-label="Turn" data-act="rotate">🔄</div>
      <div class="bd-btn" role="button" aria-label="Move down" data-act="down">⬇️</div>
      <div class="bd-btn" role="button" aria-label="Drop" data-act="drop">⏬</div>
      <div class="bd-btn" role="button" aria-label="Move right" data-act="right">➡️</div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bd-canvas');
  const linesEl = wrap.querySelector('#bd-lines');

  const totalW = cols * CELL, totalH = rows * CELL;
  const halfW = totalW / 2 + 0.2, halfH = totalH / 2 + 0.2;
  const stage = createStage(canvasHost, fitView(canvasHost, halfW, halfH));

  function cellPos(col, row) { return { x: (col - (cols - 1) / 2) * CELL, y: ((rows - 1) / 2 - row) * CELL }; }

  // border
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x3f2a7c, roughness: 0.6 });
  const border = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 0.16, totalH + 0.16), new THREE.MeshStandardMaterial({ color: 0x1c1044 }));
  border.position.z = -0.15;
  stage.world.add(border);

  const lockedGroup = new THREE.Group();
  const fallingGroup = new THREE.Group();
  const ghostGroup = new THREE.Group();
  stage.world.add(lockedGroup, fallingGroup, ghostGroup);

  function makeCellMesh(color, opacity = 1) {
    return makeTile({ w: CELL * 0.92, h: CELL * 0.92, depth: 0.22, radius: 0.09, color, opacity });
  }

  let piece = null; // { key, cells, px, py, color }
  function spawnPiece() {
    const key = randomShape();
    const def = SHAPES[key];
    const p = { key, cells: def.cells.map((c) => c.slice()), px: Math.floor((cols - 4) / 2), py: 0, color: def.color };
    if (collides(p, 0, 0, p.cells)) { gameOver(); return null; }
    return p;
  }
  function collides(p, dx, dy, cells) {
    return cells.some(([x, y]) => {
      const col = p.px + x + dx, row = p.py + y + dy;
      if (col < 0 || col >= cols || row >= rows) return true;
      if (row < 0) return false;
      return grid[row][col] !== null;
    });
  }

  function renderFalling() {
    while (fallingGroup.children.length) { const m = fallingGroup.children.pop(); m.geometry.dispose(); m.material.dispose(); }
    while (ghostGroup.children.length) { const m = ghostGroup.children.pop(); m.geometry.dispose(); m.material.dispose(); }
    if (!piece) return;
    // ghost: how far piece can drop
    let ghostDy = 0;
    while (!collides(piece, 0, ghostDy + 1, piece.cells)) ghostDy++;
    piece.cells.forEach(([x, y]) => {
      const col = piece.px + x, row = piece.py + y;
      if (row >= 0) {
        const { x: wx, y: wy } = cellPos(col, row);
        const m = makeCellMesh(piece.color);
        m.position.set(wx, wy, 0);
        fallingGroup.add(m);
      }
      const grow = row + ghostDy;
      if (grow >= 0 && grow < rows) {
        const { x: gx, y: gy } = cellPos(col, grow);
        const gm = makeCellMesh(piece.color, 0.18);
        gm.position.set(gx, gy, -0.03);
        ghostGroup.add(gm);
      }
    });
  }

  function lockPiece() {
    if (finished || !piece) return;
    piece.cells.forEach(([x, y]) => {
      const col = piece.px + x, row = piece.py + y;
      if (row >= 0 && row < rows) grid[row][col] = piece.color;
    });
    piecesUsed++;
    clearLines();
    rebuildLocked();
    if (finished) { piece = null; renderFalling(); return; }
    piece = spawnPiece();
    renderFalling();
  }

  function clearLines() {
    let cleared = 0;
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r].every((v) => v !== null)) {
        grid.splice(r, 1);
        grid.unshift(Array(cols).fill(null));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      linesCleared += cleared;
      linesEl.textContent = linesCleared;
      api.sound.match();
      api.ui.burstFromElement(canvasHost);
      if (linesCleared >= cfg.targetLines) winGame();
    }
  }

  function rebuildLocked() {
    while (lockedGroup.children.length) { const m = lockedGroup.children.pop(); m.geometry.dispose(); m.material.dispose(); }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== null) {
        const { x, y } = cellPos(c, r);
        const m = makeCellMesh(grid[r][c]);
        m.position.set(x, y, 0);
        lockedGroup.add(m);
      }
    }
  }

  function winGame() {
    if (finished) return;
    finished = true;
    const stars = piecesUsed <= cfg.targetLines * 2 ? 3 : piecesUsed <= cfg.targetLines * 3 ? 2 : 1;
    api.sound.win();
    later(() => api.win(stars, { piecesUsed }), 450);
  }
  function gameOver() {
    if (finished) return;
    finished = true;
    later(() => {
      api.lose('the stack topped out! Try again.');
      const over = document.createElement('div');
      over.className = 'bd-over';
      over.innerHTML = `<div>The blocks reached the top!<br>Lines: ${linesCleared} / ${cfg.targetLines}</div><button class="pc-btn pc-btn--blue">Try again</button>`;
      over.querySelector('button').addEventListener('click', () => { api.sound.click(); restart(); });
      canvasHost.appendChild(over);
    }, 250);
  }

  function tryMove(dx, dy) {
    if (finished || !piece) return false;
    if (!collides(piece, dx, dy, piece.cells)) { piece.px += dx; piece.py += dy; renderFalling(); return true; }
    return false;
  }
  function tryRotate() {
    if (finished || !piece) return;
    const rotated = rotateCells(piece.cells);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(piece, kick, 0, rotated)) { piece.cells = rotated; piece.px += kick; renderFalling(); api.sound.move(); return; }
    }
  }
  function hardDrop() {
    if (finished || !piece) return;
    let dy = 0;
    while (!collides(piece, 0, dy + 1, piece.cells)) dy++;
    piece.py += dy;
    api.sound.click();
    lockPiece();
  }

  piece = spawnPiece();
  renderFalling();

  // Real frame time, clamped: after a long pause (app in the background)
  // the piece falls at most one row instead of jumping down the board.
  let acc = 0;
  let lastT = performance.now();
  const unsubTick = stage.onTick(() => {
    const now = performance.now();
    const dtMs = Math.min(50, Math.max(0, now - lastT));
    lastT = now;
    if (finished || !piece) return;
    acc += dtMs;
    if (acc >= cfg.fallMs) {
      acc = 0;
      if (!tryMove(0, 1)) lockPiece();
    }
  });

  function onBtn(act) {
    if (finished) return;
    if (act === 'left') { if (tryMove(-1, 0)) api.sound.move(); }
    else if (act === 'right') { if (tryMove(1, 0)) api.sound.move(); }
    else if (act === 'down') { if (!tryMove(0, 1)) lockPiece(); }
    else if (act === 'rotate') tryRotate();
    else if (act === 'drop') hardDrop();
  }
  wrap.querySelectorAll('.bd-btn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); onBtn(btn.dataset.act); });
  });

  // Canvas gestures: tap = turn, swipe left/right = move one column per
  // ~40px dragged, quick swipe down = drop.
  let touchStartX = null, touchStartY = null, touchId = null, stepsDone = 0, touchT = 0;
  const el = stage.renderer.domElement;
  function onTouchStart(e) {
    if (touchId !== null) return;
    touchId = e.pointerId; touchStartX = e.clientX; touchStartY = e.clientY; stepsDone = 0; touchT = performance.now();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onTouchMove(e) {
    if (e.pointerId !== touchId || finished) return;
    const dx = e.clientX - touchStartX;
    const want = Math.trunc(dx / 40);
    while (stepsDone < want) { if (!tryMove(1, 0)) break; stepsDone++; api.sound.move(); }
    while (stepsDone > want) { if (!tryMove(-1, 0)) break; stepsDone--; api.sound.move(); }
  }
  function onTouchEnd(e) {
    if (e.pointerId !== touchId) return;
    touchId = null;
    if (e.type === 'pointercancel') return;
    const dx = e.clientX - touchStartX, dy = e.clientY - touchStartY;
    if (stepsDone !== 0) return;
    if (Math.hypot(dx, dy) < 18) onBtn('rotate');
    else if (dy > 60 && dy > Math.abs(dx) * 1.5 && performance.now() - touchT < 450) onBtn('drop');
  }
  el.addEventListener('pointerdown', onTouchStart);
  el.addEventListener('pointermove', onTouchMove);
  el.addEventListener('pointerup', onTouchEnd);
  el.addEventListener('pointercancel', onTouchEnd);

  function onKey(e) {
    if (e.key === 'ArrowLeft') onBtn('left');
    else if (e.key === 'ArrowRight') onBtn('right');
    else if (e.key === 'ArrowUp') onBtn('rotate');
    else if (e.key === 'ArrowDown') onBtn('down');
    else if (e.key === ' ') onBtn('drop');
  }
  window.addEventListener('keydown', onKey);

  // Hint: try every turn + column for the current piece and score the
  // resulting stack (lines cleared good; holes and height bad).
  const hintGroup = new THREE.Group();
  stage.world.add(hintGroup);
  function bestPlacement() {
    let best = null;
    let cells = piece.cells;
    for (let rot = 0; rot < 4; rot++) {
      for (let px = -3; px < cols; px++) {
        const p = { px, py: piece.py, cells };
        if (collides(p, 0, 0, cells)) continue;
        let dy = 0;
        while (!collides(p, 0, dy + 1, cells)) dy++;
        const g = grid.map((row) => row.slice());
        let above = false;
        cells.forEach(([x, y]) => { const r = p.py + y + dy; if (r < 0) above = true; else g[r][px + x] = 1; });
        if (above) continue;
        const lines = g.filter((row) => row.every((v) => v !== null)).length;
        let holes = 0, height = 0;
        for (let c = 0; c < cols; c++) {
          let seen = false;
          for (let r = 0; r < rows; r++) {
            if (g[r][c] !== null) { if (!seen) height += rows - r; seen = true; } else if (seen) holes++;
          }
        }
        const score = lines * 8 - holes * 5 - height * 0.35 - rot * 0.05;
        if (!best || score > best.score) best = { score, rot, px, dy, cells };
      }
      cells = rotateCells(cells);
    }
    return best;
  }
  function hint() {
    if (finished || !piece) return;
    const best = bestPlacement();
    if (!best) { api.ui.toast(`${api.playerName}, the faded ghost shows where it'll land!`); return; }
    while (hintGroup.children.length) { const m = hintGroup.children.pop(); m.geometry.dispose(); m.material.dispose(); }
    best.cells.forEach(([x, y]) => {
      const r = piece.py + y + best.dy;
      if (r < 0) return;
      const { x: wx, y: wy } = cellPos(best.px + x, r);
      const m = makeCellMesh(0xffd93d, 0.55);
      m.position.set(wx, wy, -0.02);
      hintGroup.add(m);
    });
    later(() => { while (hintGroup.children.length) { const m = hintGroup.children.pop(); m.geometry.dispose(); m.material.dispose(); } }, 1800);
    const turns = best.rot === 0 ? '' : `turn it ${best.rot} time${best.rot > 1 ? 's' : ''}, then `;
    api.ui.toast(`${api.playerName}, ${turns}fit it into the yellow spot!`);
  }

  return {
    unmount: () => {
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      unsubTick();
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerdown', onTouchStart);
      el.removeEventListener('pointermove', onTouchMove);
      el.removeEventListener('pointerup', onTouchEnd);
      el.removeEventListener('pointercancel', onTouchEnd);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('blockdrop', { mount });
