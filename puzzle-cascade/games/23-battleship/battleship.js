/**
 * Game 23 - Battleship vs AI (3D). Your fleet is auto-placed on the
 * lower grid. Tap the upper (enemy) grid to fire; the AI fires back at
 * your grid after every shot. Sink the whole enemy fleet first.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 6, ships: [3, 2, 2] },
  medium: { size: 8, ships: [4, 3, 2, 2] },
  hard: { size: 10, ships: [5, 4, 3, 2, 2] },
};
const CELL = 0.86;
const GAP = 1.7; // world-space gap between the two boards
const WATER_COLOR = 0x1c4f8f;
const SHIP_COLOR = 0x546274;
const HIT_COLOR = 0xff5c5c;
const MISS_COLOR = 0xdfeeff;
const SUNK_COLOR = 0x241436;

function key(r, c) { return r + ',' + c; }

function emptyGrid(size) { return Array.from({ length: size }, () => Array(size).fill(0)); }

function placeFleet(size, shipSizes) {
  const grid = emptyGrid(size); // 0 empty, shipId+1 occupied
  const ships = [];
  shipSizes.forEach((len, idx) => {
    let placed = false;
    for (let attempt = 0; attempt < 400 && !placed; attempt++) {
      const horiz = Math.random() < 0.5;
      const r0 = Math.floor(Math.random() * size);
      const c0 = Math.floor(Math.random() * size);
      const cells = [];
      let ok = true;
      for (let i = 0; i < len; i++) {
        const r = horiz ? r0 : r0 + i;
        const c = horiz ? c0 + i : c0;
        if (r < 0 || r >= size || c < 0 || c >= size) { ok = false; break; }
        // keep a 1-cell buffer so ships never touch, simplifies visuals
        for (let dr = -1; dr <= 1 && ok; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < size && cc >= 0 && cc < size && grid[rr][cc] !== 0) { ok = false; break; }
        }
        cells.push([r, c]);
      }
      if (!ok) continue;
      cells.forEach(([r, c]) => { grid[r][c] = idx + 1; });
      ships.push({ id: idx, cells, hits: new Set() });
      placed = true;
    }
  });
  return { grid, ships };
}

function makeAIController(size) {
  const tried = new Set();
  const stack = [];
  return {
    nextShot() {
      while (stack.length) {
        const [r, c] = stack.pop();
        if (!tried.has(key(r, c)) && r >= 0 && r < size && c >= 0 && c < size) return [r, c];
      }
      // checkerboard-parity search for statistically better coverage
      const parity = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (!tried.has(key(r, c)) && (r + c) % 2 === 0) parity.push([r, c]);
      }
      const pool = parity.length ? parity : (() => {
        const all = [];
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!tried.has(key(r, c))) all.push([r, c]);
        return all;
      })();
      return pool[Math.floor(Math.random() * pool.length)];
    },
    report(r, c, hit) {
      tried.add(key(r, c));
      if (hit) {
        [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([rr, cc]) => stack.push([rr, cc]));
      }
    },
  };
}

function boardHalfExtent(size) { return size * CELL / 2 + CELL * 0.5; }

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  const enemy = placeFleet(size, cfg.ships);
  const own = placeFleet(size, cfg.ships);
  const enemyShotsAt = new Set(); // cells the player has fired at
  const ownShotsAt = new Set(); // cells the AI has fired at
  let finished = false, aiThinking = false, shots = 0;
  const ai = makeAIController(size);

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bs-meta">
      <span id="bs-status">Your turn - fire at the enemy grid</span>
      <span class="bs-fleets">Enemy ships left: <span id="bs-enemy-left">${cfg.ships.length}</span> &middot; Your ships left: <span id="bs-own-left">${cfg.ships.length}</span></span>
    </div>
    <div class="pc-canvas3d" id="bs-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Top grid = enemy waters. Bottom grid = your fleet.</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bs-canvas');
  const statusEl = wrap.querySelector('#bs-status');
  const enemyLeftEl = wrap.querySelector('#bs-enemy-left');
  const ownLeftEl = wrap.querySelector('#bs-own-left');

  const halfExt = boardHalfExtent(size);
  const boardHalfHeight = size * CELL;
  const totalHalfH = boardHalfHeight + GAP / 2 + 0.6;
  const aspectMin = 0.46;
  const distW = (halfExt + 0.6) / (0.42 * aspectMin);
  const distH = totalHalfH / 0.42;
  const distance = Math.max(distW, distH) * 1.05;

  const stage = createStage(canvasHost, { distance });

  const enemyCenterY = (size * CELL) / 2 + GAP / 2;
  const ownCenterY = -((size * CELL) / 2 + GAP / 2);

  function cellXY(r, c, centerY) {
    const half = (size - 1) / 2;
    return { x: (c - half) * CELL, y: centerY - (r - half) * CELL };
  }

  function buildBoard(centerY, isOwn) {
    const cells = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const { x, y } = cellXY(r, c, centerY);
        const mesh = makeTile({ w: CELL * 0.9, h: CELL * 0.9, depth: 0.16, radius: 0.08, color: WATER_COLOR, roughness: 0.55, metalness: 0.1 });
        mesh.position.set(x, y, 0);
        mesh.userData = { r, c, isOwn };
        stage.world.add(mesh);
        popIn(mesh, { delay: (r * size + c) * 5, duration: 200 });
        row.push(mesh);
      }
      cells.push(row);
    }
    return cells;
  }

  const enemyCells = buildBoard(enemyCenterY, false);
  const ownCells = buildBoard(ownCenterY, true);

  // reveal own ships immediately (translucent gray)
  own.ships.forEach((ship) => {
    ship.cells.forEach(([r, c]) => {
      ownCells[r][c].material.color.set(SHIP_COLOR);
    });
  });

  function markCell(mesh, state) {
    if (state === 'hit') mesh.material.color.set(HIT_COLOR);
    else if (state === 'miss') mesh.material.color.set(MISS_COLOR);
    else if (state === 'sunk') mesh.material.color.set(SUNK_COLOR);
    tween(mesh.scale, { x: 1.15, y: 1.15, z: 1.15 }, 140, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 160, Easing.outCubic));
  }

  function shipAt(fleet, r, c) {
    return fleet.ships.find((s) => s.cells.some(([sr, sc]) => sr === r && sc === c));
  }

  function fire(fleetData, cellsGrid, r, c, triedSet) {
    triedSet.add(key(r, c));
    const ship = shipAt(fleetData, r, c);
    const mesh = cellsGrid[r][c];
    if (!ship) { markCell(mesh, 'miss'); return { hit: false }; }
    ship.hits.add(key(r, c));
    const sunk = ship.hits.size === ship.cells.length;
    if (sunk) {
      ship.cells.forEach(([sr, sc]) => markCell(cellsGrid[sr][sc], 'sunk'));
    } else {
      markCell(mesh, 'hit');
    }
    return { hit: true, sunk, ship };
  }

  function shipsLeft(fleetData) { return fleetData.ships.filter((s) => s.hits.size < s.cells.length).length; }

  function checkEnd() {
    const eLeft = shipsLeft(enemy);
    const oLeft = shipsLeft(own);
    enemyLeftEl.textContent = eLeft;
    ownLeftEl.textContent = oLeft;
    if (eLeft === 0 || oLeft === 0) {
      finished = true;
      if (eLeft === 0) {
        statusEl.textContent = 'You sank the enemy fleet - victory!';
        api.ui.burstFromElement(canvasHost);
        const stars = shots <= size * 2.2 ? 3 : shots <= size * 3.2 ? 2 : 1;
        setTimeout(() => api.win(stars, { shots }), 350);
      } else {
        statusEl.textContent = 'Your fleet has been sunk.';
        setTimeout(() => api.lose('the AI sank your whole fleet. Try again.'), 350);
      }
      return true;
    }
    return false;
  }

  function aiTurn() {
    aiThinking = true;
    statusEl.textContent = "AI is firing...";
    setTimeout(() => {
      const [r, c] = ai.nextShot();
      const result = fire(own, ownCells, r, c, ownShotsAt);
      ai.report(r, c, result.hit);
      api.sound[result.hit ? 'error' : 'move']();
      if (checkEnd()) { aiThinking = false; return; }
      aiThinking = false;
      statusEl.textContent = result.hit ? 'The AI hit your ship! Your turn.' : 'The AI missed. Your turn.';
    }, 550);
  }

  function onPointerDown(e) {
    if (finished || aiThinking) return;
    const hit = stage.pick(e.clientX, e.clientY, enemyCells.flat());
    if (!hit) return;
    const { r, c } = hit.object.userData;
    if (enemyShotsAt.has(key(r, c))) { api.sound.error(); api.ui.shake(canvasHost); return; }
    shots++;
    const result = fire(enemy, enemyCells, r, c, enemyShotsAt);
    api.sound[result.hit ? 'match' : 'click']();
    if (result.sunk) api.ui.burstFromElement(canvasHost, { count: 16 });
    if (checkEnd()) return;
    statusEl.textContent = result.hit ? 'Direct hit! AI is up next.' : 'Miss. AI is up next.';
    aiTurn();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished || aiThinking) return;
    // deduce: prefer a cell adjacent to an existing unresolved hit on the enemy board
    let target = null;
    for (const ship of enemy.ships) {
      if (ship.hits.size === 0 || ship.hits.size === ship.cells.length) continue;
      for (const [r, c] of ship.cells) {
        if (!ship.hits.has(key(r, c)) && !enemyShotsAt.has(key(r, c))) { target = [r, c]; break; }
      }
      if (target) break;
    }
    if (!target) {
      const parity = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!enemyShotsAt.has(key(r, c)) && (r + c) % 2 === 0) parity.push([r, c]);
      const pool = parity.length ? parity : (() => { const all = []; for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!enemyShotsAt.has(key(r, c))) all.push([r, c]); return all; })();
      target = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!target) return;
    const mesh = enemyCells[target[0]][target[1]];
    tween(mesh.scale, { x: 1.35, y: 1.35, z: 1.35 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try the glowing square!`);
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

PC.Games.register('battleship', { mount });
