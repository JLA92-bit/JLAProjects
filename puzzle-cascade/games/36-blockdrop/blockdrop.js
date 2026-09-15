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

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const { cols, rows } = cfg;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  let linesCleared = 0, piecesUsed = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bd-meta">Lines: <span id="bd-lines">0</span>/${cfg.targetLines}</div>
    <div class="pc-canvas3d" id="bd-canvas"></div>
    <div class="bd-controls">
      <div class="bd-btn" data-act="left">⬅️</div>
      <div class="bd-btn" data-act="rotate">🔄</div>
      <div class="bd-btn" data-act="down">⬇️</div>
      <div class="bd-btn" data-act="drop">⏬</div>
      <div class="bd-btn" data-act="right">➡️</div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bd-canvas');
  const linesEl = wrap.querySelector('#bd-lines');

  const totalW = cols * CELL, totalH = rows * CELL;
  const halfW = totalW / 2 + 0.5, halfH = totalH / 2 + 0.5;
  const distance = Math.max(halfH / 0.42, halfW / (0.42 * 0.5));
  const stage = createStage(canvasHost, { distance });

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
    piece.cells.forEach(([x, y]) => {
      const col = piece.px + x, row = piece.py + y;
      if (row >= 0 && row < rows) grid[row][col] = piece.color;
    });
    piecesUsed++;
    clearLines();
    rebuildLocked();
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
      if (linesCleared >= cfg.targetLines) { setTimeout(winGame, 200); }
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
    finished = true;
    const stars = piecesUsed <= cfg.targetLines * 2 ? 3 : piecesUsed <= cfg.targetLines * 3 ? 2 : 1;
    api.sound.win();
    setTimeout(() => api.win(stars, { piecesUsed }), 250);
  }
  function gameOver() {
    finished = true;
    setTimeout(() => api.lose('the stack topped out! Try again.'), 250);
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

  let acc = 0;
  const unsubTick = stage.onTick(() => {
    if (finished || !piece) return;
    acc += 1000 / 60;
    if (acc >= cfg.fallMs) {
      acc = 0;
      if (!tryMove(0, 1)) lockPiece();
    }
  });

  function onBtn(act) {
    if (finished) return;
    if (act === 'left') tryMove(-1, 0);
    else if (act === 'right') tryMove(1, 0);
    else if (act === 'down') { if (!tryMove(0, 1)) lockPiece(); }
    else if (act === 'rotate') tryRotate();
    else if (act === 'drop') hardDrop();
  }
  wrap.querySelectorAll('.bd-btn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); onBtn(btn.dataset.act); });
  });

  // basic swipe on canvas
  let touchStartX = null, touchStartY = null;
  const el = stage.renderer.domElement;
  function onTouchStart(e) { touchStartX = e.clientX; touchStartY = e.clientY; }
  function onTouchEnd(e) {
    if (touchStartX === null) return;
    const dx = e.clientX - touchStartX, dy = e.clientY - touchStartY;
    if (Math.hypot(dx, dy) < 18) { onBtn('rotate'); }
    else if (Math.abs(dx) > Math.abs(dy)) { onBtn(dx > 0 ? 'right' : 'left'); }
    else if (dy > 0) { onBtn('drop'); }
    touchStartX = null;
  }
  el.addEventListener('pointerdown', onTouchStart);
  el.addEventListener('pointerup', onTouchEnd);

  function onKey(e) {
    if (e.key === 'ArrowLeft') onBtn('left');
    else if (e.key === 'ArrowRight') onBtn('right');
    else if (e.key === 'ArrowUp') onBtn('rotate');
    else if (e.key === 'ArrowDown') onBtn('down');
    else if (e.key === ' ') onBtn('drop');
  }
  window.addEventListener('keydown', onKey);

  function hint() {
    if (finished || !piece) return;
    api.ui.toast(`${api.playerName}, the faded ghost shows where it'll land!`);
    ghostGroup.children.forEach((m) => tween(m.material, { opacity: 0.55 }, 200, Easing.outCubic, () => tween(m.material, { opacity: 0.18 }, 500)));
  }

  return {
    unmount: () => {
      finished = true;
      unsubTick();
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('pointerdown', onTouchStart);
      el.removeEventListener('pointerup', onTouchEnd);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('blockdrop', { mount });
