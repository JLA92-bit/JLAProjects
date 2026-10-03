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
  const size = cfg.size;
  const enemy = placeFleet(size, cfg.ships);
  const own = placeFleet(size, cfg.ships);
  const enemyShotsAt = new Set(); // cells the player has fired at
  const ownShotsAt = new Set(); // cells the AI has fired at
  let finished = false, aiThinking = false, shots = 0;
  const timers = makeTimers();
  const ai = makeAIController(size);

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bs-meta">
      <span id="bs-status">Your turn - fire at the enemy grid</span>
      <span class="bs-fleets">Enemy ships left: <span id="bs-enemy-left">${cfg.ships.length}</span> &middot; Your ships left: <span id="bs-own-left">${cfg.ships.length}</span></span>
    </div>
    <div class="pc-canvas3d" id="bs-canvas"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bs-canvas');
  const statusEl = wrap.querySelector('#bs-status');
  const enemyLeftEl = wrap.querySelector('#bs-enemy-left');
  const ownLeftEl = wrap.querySelector('#bs-own-left');

  const halfExt = boardHalfExtent(size);
  const totalHalfH = size * CELL + GAP / 2 + 0.25;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, halfExt, totalHalfH) });

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

  // Two labels in the gap between the grids say which grid is which.
  function textPlane(text, color, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = Math.round(1024 * h / w);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    let px = Math.round(canvas.height * 0.82);
    ctx.font = `800 ${px}px 'Baloo 2', sans-serif`;
    const tw = ctx.measureText(text).width;
    if (tw > canvas.width * 0.96) { px = Math.floor(px * canvas.width * 0.96 / tw); ctx.font = `800 ${px}px 'Baloo 2', sans-serif`; }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + canvas.height * 0.04);
    const tex = new THREE.CanvasTexture(canvas);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    stage.world.add(plane);
    return plane;
  }
  const labelW = size * CELL, labelH = Math.min(size * CELL / 9, GAP * 0.36);
  textPlane('\u25B2 Enemy waters - tap to fire \u25B2', '#ffd93d', labelW, labelH).position.set(0, GAP * 0.24, 0.05);
  textPlane('\u25BC Your fleet \u25BC', '#bfe3ff', labelW, labelH).position.set(0, -GAP * 0.24, 0.05);

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
        timers.later(() => api.win(stars, { shots }), 350);
      } else {
        statusEl.textContent = 'Your fleet has been sunk.';
        timers.later(() => api.lose('the computer sank your whole fleet. Try again!'), 350);
      }
      return true;
    }
    return false;
  }

  function aiTurn() {
    aiThinking = true;
    statusEl.textContent = 'The computer is firing...';
    timers.later(() => {
      if (finished) return;
      const [r, c] = ai.nextShot();
      const result = fire(own, ownCells, r, c, ownShotsAt);
      ai.report(r, c, result.hit);
      api.sound[result.hit ? 'error' : 'move']();
      if (checkEnd()) { aiThinking = false; return; }
      aiThinking = false;
      statusEl.textContent = result.sunk ? 'The computer sank one of your ships! Your turn.' : result.hit ? 'The computer hit your ship! Your turn.' : 'The computer missed. Your turn.';
    }, 550);
  }

  // Map a tap to a cell on either grid (nearest cell, so gaps still count).
  function cellAt(clientX, clientY) {
    const p = stage.pickPlane(clientX, clientY, 0);
    if (!p) return null;
    const half = (size - 1) / 2;
    const c = Math.round(p.x / CELL + half);
    for (const [centerY, isOwn] of [[enemyCenterY, false], [ownCenterY, true]]) {
      const r = Math.round(half - (p.y - centerY) / CELL);
      if (r >= 0 && r < size && c >= 0 && c < size) return { r, c, isOwn };
    }
    return null;
  }

  function onPointerDown(e) {
    if (finished) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    if (aiThinking) { api.ui.toast('Hold on - the computer is firing.'); return; }
    const { r, c, isOwn } = cell;
    if (isOwn) { api.sound.error(); api.ui.toast('That is your fleet - fire at the top grid!'); return; }
    if (enemyShotsAt.has(key(r, c))) { api.sound.error(); api.ui.shake(canvasHost); api.ui.toast('You already fired there - pick a new square.'); return; }
    shots++;
    const result = fire(enemy, enemyCells, r, c, enemyShotsAt);
    api.sound[result.hit ? 'match' : 'click']();
    if (result.sunk) api.ui.burstFromElement(canvasHost, { count: 16 });
    if (checkEnd()) return;
    statusEl.textContent = result.sunk ? 'You sank a ship!' : result.hit ? 'Direct hit!' : 'Miss.';
    aiTurn();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished) return;
    if (aiThinking) { api.ui.toast(`${api.playerName}, wait for the computer's shot first.`); return; }
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
      finished = true;
      timers.clear();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('battleship', { mount: guardMount(mount, { retry: true }) });
