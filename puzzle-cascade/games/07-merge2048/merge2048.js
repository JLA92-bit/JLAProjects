/**
 * Game 7 - Number Merge (3D, 2048-style). Swipe/arrow keys slide every
 * tile; equal tiles merge. Reach the target value to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 4, target: 128, moveStars: [60, 100] },
  medium: { size: 4, target: 512, moveStars: [140, 220] },
  hard: { size: 5, target: 2048, moveStars: [260, 420] },
};
const SPACING = 1.08;
const TILE_COLORS = {
  2: 0xfff3d6, 4: 0xffe6a8, 8: 0xffd93d, 16: 0xff9f43, 32: 0xff7043, 64: 0xff4d8d,
  128: 0xd6216b, 256: 0xa259ff, 512: 0x6a2dd6, 1024: 0x3f8efc, 2048: 0x23d18b, 4096: 0x17c3b2,
};
function colorFor(v) { return TILE_COLORS[v] || 0x241436; }

function starsForMoves(moveStars, moves) { if (moves <= moveStars[0]) return 3; if (moves <= moveStars[1]) return 2; return 1; }

let uid = 1;

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  let board = Array.from({ length: size }, () => Array(size).fill(null));
  let moves = 0, busy = false, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="n2-meta"><span>Moves: <span id="n2-moves">0</span></span><span>Target: ${cfg.target}</span></div>
    <div class="pc-canvas3d" id="n2-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Swipe or use arrow keys</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#n2-canvas');
  const movesEl = wrap.querySelector('#n2-moves');

  const stage = createStage(canvasHost, { distance: size * 2.5 });
  const half = (size - 1) / 2;
  function cellXY(r, c) { return { x: (c - half) * SPACING, y: (half - r) * SPACING }; }

  // faint background cells
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const { x, y } = cellXY(r, c);
    const bg = makeTile({ w: 1, h: 1, depth: 0.06, radius: 0.14, color: 0x000000, opacity: 0.18 });
    bg.position.set(x, y, -0.05);
    bg.castShadow = false;
    stage.world.add(bg);
  }

  function spawnTile(r, c, value) {
    const { x, y } = cellXY(r, c);
    const mesh = makeTile({ w: 0.94, h: 0.94, depth: 0.3, radius: 0.16, color: colorFor(value) });
    mesh.position.set(x, y, 0);
    applyLabel(mesh, String(value), { size: 110, w: 0.6, h: 0.6, color: value <= 4 ? '#5b4636' : '#ffffff' });
    stage.world.add(mesh);
    popIn(mesh, { duration: 220 });
    const tile = { id: uid++, value, mesh, r, c };
    board[r][c] = tile;
    return tile;
  }

  function relabel(tile) {
    tile.mesh.remove(tile.mesh.children[0]);
    applyLabel(tile.mesh, String(tile.value), { size: 110, w: 0.6, h: 0.6, color: tile.value <= 4 ? '#5b4636' : '#ffffff' });
    tile.mesh.material.color.set(colorFor(tile.value));
  }

  function randomEmptyCell() {
    const empties = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!board[r][c]) empties.push([r, c]);
    if (!empties.length) return null;
    return empties[Math.floor(Math.random() * empties.length)];
  }

  spawnTile(...randomEmptyCell(), 2);
  spawnTile(...randomEmptyCell(), 2);

  function getLine(dir, k) {
    const coords = [];
    for (let i = 0; i < size; i++) {
      if (dir === 'left') coords.push([k, i]);
      else if (dir === 'right') coords.push([k, size - 1 - i]);
      else if (dir === 'up') coords.push([i, k]);
      else coords.push([size - 1 - i, k]);
    }
    return coords;
  }

  function move(dir) {
    if (busy || finished) return;
    let moved = false;
    const arrivals = []; // {tile, r, c}
    const removals = []; // meshes to remove after tween
    const winners = []; // tiles whose value doubled (need relabel + pop after)

    for (let k = 0; k < size; k++) {
      const coords = getLine(dir, k);
      const tiles = coords.map(([r, c]) => board[r][c]).filter(Boolean);
      const merged = [];
      let i = 0;
      while (i < tiles.length) {
        if (i + 1 < tiles.length && tiles[i].value === tiles[i + 1].value) {
          merged.push({ value: tiles[i].value * 2, sources: [tiles[i], tiles[i + 1]], mergedFlag: true });
          i += 2;
        } else {
          merged.push({ value: tiles[i].value, sources: [tiles[i]], mergedFlag: false });
          i += 1;
        }
      }
      merged.forEach((entry, idx) => {
        const [r, c] = coords[idx];
        entry.sources.forEach((src) => {
          if (src.r !== r || src.c !== c) moved = true;
          arrivals.push({ tile: src, r, c });
        });
        if (entry.mergedFlag) {
          winners.push({ keep: entry.sources[0], drop: entry.sources[1], value: entry.value, r, c });
          moved = true;
        }
      });
    }

    if (!moved) return;
    api.sound.move();
    busy = true;
    board = Array.from({ length: size }, () => Array(size).fill(null));

    let pending = arrivals.length;
    arrivals.forEach(({ tile, r, c }) => {
      const target = cellXY(r, c);
      tween(tile.mesh.position, { x: target.x, y: target.y }, 130, Easing.outCubic, () => {
        pending--;
        if (pending === 0) finishMove(winners, arrivals, moves + 1);
      });
    });
  }

  function finishMove(winners, arrivals, moveCount) {
    const droppedIds = new Set(winners.map((w) => w.drop.id));
    winners.forEach(({ keep, drop, value, r, c }) => {
      stage.world.remove(drop.mesh);
      keep.value = value; keep.r = r; keep.c = c;
      relabel(keep);
      tween(keep.mesh.scale, { x: 1.25, y: 1.25, z: 1.25 }, 100, Easing.outCubic, () => tween(keep.mesh.scale, { x: 1, y: 1, z: 1 }, 120, Easing.outBack));
      api.sound.match();
    });
    arrivals.forEach(({ tile, r, c }) => {
      if (droppedIds.has(tile.id)) return;
      tile.r = r; tile.c = c;
      board[r][c] = tile;
    });

    moves = moveCount;
    movesEl.textContent = moves;

    const empty = randomEmptyCell();
    if (empty) {
      const value = Math.random() < 0.85 ? 2 : 4;
      spawnTile(empty[0], empty[1], value);
    }

    busy = false;
    checkEnd();
  }

  function checkEnd() {
    let maxVal = 0;
    const tiles = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c]) { tiles.push(board[r][c]); maxVal = Math.max(maxVal, board[r][c].value); }
    if (maxVal >= cfg.target) {
      finished = true;
      const stars = starsForMoves(cfg.moveStars, moves);
      api.ui.burstFromElement(canvasHost);
      setTimeout(() => api.win(stars, { moves }), 250);
      return;
    }
    const full = tiles.length === size * size;
    if (full) {
      let canMerge = false;
      for (let r = 0; r < size && !canMerge; r++) for (let c = 0; c < size && !canMerge; c++) {
        const t = board[r][c];
        if (!t) continue;
        if (c + 1 < size && board[r][c + 1] && board[r][c + 1].value === t.value) canMerge = true;
        if (r + 1 < size && board[r + 1][c] && board[r + 1][c].value === t.value) canMerge = true;
      }
      if (!canMerge) {
        finished = true;
        api.lose('No more moves! Try again.');
      }
    }
  }

  function onKey(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  }
  window.addEventListener('keydown', onKey);

  let touchStart = null;
  function onPointerDown(e) { touchStart = { x: e.clientX, y: e.clientY }; }
  function onPointerUp(e) {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  stage.renderer.domElement.addEventListener('pointerup', onPointerUp);

  return () => {
    window.removeEventListener('keydown', onKey);
    stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    stage.renderer.domElement.removeEventListener('pointerup', onPointerUp);
    stage.dispose();
    wrap.remove();
  };
}

PC.Games.register('merge2048', { mount });
