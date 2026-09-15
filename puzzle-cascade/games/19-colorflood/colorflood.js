/**
 * Game 19 - Color Flood (3D). Tap a color swatch to flood-fill outward
 * from the top-left corner, capturing every touching same-or-new-colored
 * cell. Turn the whole board into one color within the move limit.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 8, colors: 4, moves: 20 },
  medium: { size: 12, colors: 5, moves: 26 },
  hard: { size: 14, colors: 6, moves: 30 },
};
const CELL = 0.72;

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function neighbors(r, c, size) {
  const out = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < size - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < size - 1) out.push([r, c + 1]);
  return out;
}

function floodRegion(grid, size, color) {
  const seen = Array.from({ length: size }, () => Array(size).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  const region = [[0, 0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of neighbors(r, c, size)) {
      if (seen[nr][nc]) continue;
      if (grid[nr][nc] === grid[0][0]) { seen[nr][nc] = true; region.push([nr, nc]); stack.push([nr, nc]); }
    }
  }
  return region;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size, numColors = cfg.colors;
  const colors = PALETTE.slice(0, numColors);
  let grid = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.floor(Math.random() * numColors)));
  let movesUsed = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="cf-meta">Moves left: <span id="cf-moves">${cfg.moves}</span></div>
    <div class="pc-canvas3d" id="cf-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Flood the whole board from the top-left corner</span></div>
    </div>
    <div class="cf-palette" id="cf-palette"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#cf-canvas');
  const movesEl = wrap.querySelector('#cf-moves');
  const paletteEl = wrap.querySelector('#cf-palette');

  colors.forEach((hex, i) => {
    const btn = document.createElement('button');
    btn.className = 'cf-swatch';
    btn.style.background = '#' + hex.toString(16).padStart(6, '0');
    btn.addEventListener('click', () => applyColor(i));
    paletteEl.appendChild(btn);
  });

  const stage = createStage(canvasHost, { distance: size * 1.9 });

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size);
      const mesh = makeTile({ w: CELL * 0.94, h: CELL * 0.94, depth: 0.18, radius: 0.08, color: colors[grid[r][c]] });
      mesh.position.set(x, y, 0);
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 3 });
      row.push(mesh);
    }
    meshes.push(row);
  }

  function applyColor(colorIdx) {
    if (finished) return;
    if (colorIdx === grid[0][0]) { api.ui.toast(`${api.playerName}, pick a different color!`); return; }
    const region = floodRegion(grid, size, grid[0][0]);
    region.forEach(([r, c]) => { grid[r][c] = colorIdx; });
    movesUsed++;
    movesEl.textContent = Math.max(0, cfg.moves - movesUsed);
    api.sound.click();
    region.forEach(([r, c], i) => {
      const mesh = meshes[r][c];
      setTimeout(() => {
        mesh.material.color.set(colors[colorIdx]);
        tween(mesh.scale, { x: 1.1, y: 1.1 }, 100, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1 }, 120, Easing.outCubic));
      }, Math.min(i, 40) * 6);
    });
    setTimeout(checkEnd, 260);
  }

  function isSolved() {
    const first = grid[0][0];
    return grid.every((row) => row.every((v) => v === first));
  }

  function checkEnd() {
    if (isSolved()) {
      finished = true;
      const remaining = cfg.moves - movesUsed;
      const stars = remaining >= cfg.moves * 0.35 ? 3 : remaining >= cfg.moves * 0.12 ? 2 : 1;
      api.ui.burstFromElement(canvasHost);
      setTimeout(() => api.win(stars, { movesUsed }), 250);
    } else if (movesUsed >= cfg.moves) {
      finished = true;
      api.sound.error();
      api.ui.shake(canvasHost);
      setTimeout(() => api.lose('you ran out of moves! Try again.'), 250);
    }
  }

  function hint() {
    if (finished) return;
    // greedy: pick the color that captures the most new cells this move
    let best = -1, bestGain = -1;
    for (let colorIdx = 0; colorIdx < numColors; colorIdx++) {
      if (colorIdx === grid[0][0]) continue;
      const testGrid = grid.map((row) => row.slice());
      const region = floodRegion(testGrid, size, testGrid[0][0]);
      const before = region.length;
      region.forEach(([r, c]) => { testGrid[r][c] = colorIdx; });
      const after = floodRegion(testGrid, size, colorIdx).length;
      const gain = after - before;
      if (gain > bestGain) { bestGain = gain; best = colorIdx; }
    }
    if (best === -1) return;
    const swatch = paletteEl.children[best];
    swatch.classList.add('cf-swatch--hint');
    setTimeout(() => swatch.classList.remove('cf-swatch--hint'), 1200);
    api.ui.toast(`${api.playerName}, try that glowing color!`);
  }

  return {
    unmount: () => {
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('colorflood', { mount });
