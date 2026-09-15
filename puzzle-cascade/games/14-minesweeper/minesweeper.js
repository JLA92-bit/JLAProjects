/**
 * Game 14 - Minesweeper (3D). Tap to reveal a cell; a number tells you how
 * many mines touch it. Toggle Flag Mode to mark suspected mines instead
 * of revealing (mobile has no right-click). Clear every safe cell to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 6, mines: 5 },
  medium: { size: 8, mines: 12 },
  hard: { size: 10, mines: 20 },
};
const CELL = 0.98;
const HIDDEN_COLOR = 0x3f2a7c;
const REVEALED_COLOR = 0x1a0c30;
const FLAG_COLOR = 0xffd93d;
const MINE_COLOR = 0xff5c5c;
const NUM_COLORS = ['#ffffff', '#3f8efc', '#23d18b', '#ffd93d', '#a259ff', '#ff9f43', '#17c3b2', '#ff4d8d', '#ffffff'];

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function neighbors(r, c, size) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (dr === 0 && dc === 0) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push([nr, nc]);
  }
  return out;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  let mines = null; // Set of "r,c" built after first tap so it's never lost immediately
  let counts = null;
  let revealed = Array.from({ length: size }, () => Array(size).fill(false));
  let flagged = Array.from({ length: size }, () => Array(size).fill(false));
  let finished = false, firstTap = true, flagMode = false;
  const totalSafe = size * size - cfg.mines;
  let revealedCount = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ms-meta">
      <span>Mines: ${cfg.mines}</span>
      <button class="pc-chip ms-flagtoggle" id="ms-flagtoggle">🚩 Flag Mode: Off</button>
    </div>
    <div class="pc-canvas3d" id="ms-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap to reveal - toggle Flag Mode to mark mines</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ms-canvas');
  const flagBtn = wrap.querySelector('#ms-flagtoggle');

  flagBtn.addEventListener('click', () => {
    flagMode = !flagMode;
    flagBtn.textContent = `🚩 Flag Mode: ${flagMode ? 'On' : 'Off'}`;
    flagBtn.classList.toggle('is-active', flagMode);
    api.sound.click();
  });

  const stage = createStage(canvasHost, { distance: size * 2.5 });

  const meshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size);
      const mesh = makeTile({ w: 0.88, h: 0.88, depth: 0.22, radius: 0.12, color: HIDDEN_COLOR });
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 10 });
      row.push(mesh);
    }
    meshes.push(row);
  }

  function placeMines(safeR, safeC) {
    mines = Array.from({ length: size }, () => Array(size).fill(false));
    let placed = 0;
    const forbidden = new Set(neighbors(safeR, safeC, size).map(([r, c]) => `${r},${c}`));
    forbidden.add(`${safeR},${safeC}`);
    while (placed < cfg.mines) {
      const r = Math.floor(Math.random() * size), c = Math.floor(Math.random() * size);
      if (mines[r][c] || forbidden.has(`${r},${c}`)) continue;
      mines[r][c] = true;
      placed++;
    }
    counts = Array.from({ length: size }, () => Array(size).fill(0));
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      counts[r][c] = neighbors(r, c, size).filter(([nr, nc]) => mines[nr][nc]).length;
    }
  }

  function revealCell(r, c) {
    if (revealed[r][c] || flagged[r][c]) return;
    revealed[r][c] = true;
    revealedCount++;
    const mesh = meshes[r][c];
    mesh.material.color.set(REVEALED_COLOR);
    tween(mesh.scale, { z: 0.5 }, 120, Easing.outCubic, () => tween(mesh.scale, { z: 1 }, 120, Easing.outCubic));
    if (counts[r][c] > 0) {
      applyLabel(mesh, String(counts[r][c]), { size: 96, w: 0.5, h: 0.5, color: NUM_COLORS[counts[r][c]] });
    } else {
      neighbors(r, c, size).forEach(([nr, nc]) => revealCell(nr, nc));
    }
  }

  function checkWin() {
    if (revealedCount >= totalSafe) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const elapsed = api.elapsedMs();
      const stars = elapsed <= 20000 + size * 2500 ? 3 : elapsed <= 40000 + size * 3500 ? 2 : 1;
      setTimeout(() => api.win(stars, { elapsed }), 300);
    }
  }

  function loseGame(r, c) {
    finished = true;
    for (let rr = 0; rr < size; rr++) for (let cc = 0; cc < size; cc++) {
      if (mines[rr][cc]) {
        const m = meshes[rr][cc];
        m.material.color.set(MINE_COLOR);
        m.material.emissive.set(MINE_COLOR);
        m.material.emissiveIntensity = (rr === r && cc === c) ? 1 : 0.5;
      }
    }
    api.sound.error();
    api.ui.shake(canvasHost);
    setTimeout(() => api.lose('you hit a mine! Try again.'), 300);
  }

  function onPointerDown(e) {
    if (finished) return;
    const flat = meshes.flat();
    const hit = stage.pick(e.clientX, e.clientY, flat);
    if (!hit) return;
    const { r, c } = hit.object.userData;
    if (flagMode) {
      if (revealed[r][c]) return;
      flagged[r][c] = !flagged[r][c];
      const mesh = meshes[r][c];
      mesh.material.color.set(flagged[r][c] ? FLAG_COLOR : HIDDEN_COLOR);
      tween(mesh.scale, { x: 1.1, y: 1.1 }, 100, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1 }, 120, Easing.outCubic));
      api.sound.click();
      return;
    }
    if (flagged[r][c] || revealed[r][c]) return;
    if (firstTap) { placeMines(r, c); firstTap = false; }
    if (mines[r][c]) { loseGame(r, c); return; }
    api.sound.click();
    revealCell(r, c);
    checkWin();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished) return;
    if (firstTap) { api.ui.toast(`${api.playerName}, tap any cell to start!`); return; }
    // Basic constraint deduction: for a revealed numbered cell, if flagged
    // neighbors already satisfy its count, any other unrevealed neighbor is safe.
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!revealed[r][c] || counts[r][c] === 0) continue;
      const ns = neighbors(r, c, size);
      const flaggedCount = ns.filter(([nr, nc]) => flagged[nr][nc]).length;
      if (flaggedCount === counts[r][c]) {
        const safe = ns.find(([nr, nc]) => !revealed[nr][nc] && !flagged[nr][nc]);
        if (safe) {
          const mesh = meshes[safe[0]][safe[1]];
          tween(mesh.scale, { x: 1.35, y: 1.35, z: 1.35 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
          api.ui.toast(`${api.playerName}, that glowing square is safe!`);
          return;
        }
      }
    }
    // Fallback: any random safe unrevealed cell
    const safeCells = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!revealed[r][c] && !flagged[r][c] && !mines[r][c]) safeCells.push([r, c]);
    }
    if (safeCells.length) {
      const [r, c] = safeCells[Math.floor(Math.random() * safeCells.length)];
      const mesh = meshes[r][c];
      tween(mesh.scale, { x: 1.35, y: 1.35, z: 1.35 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
      api.ui.toast(`${api.playerName}, that glowing square is safe!`);
    }
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

PC.Games.register('minesweeper', { mount });
