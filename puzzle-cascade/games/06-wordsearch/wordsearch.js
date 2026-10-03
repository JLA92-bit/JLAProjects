/**
 * Game 6 - Word Search (3D). Letter tiles on a tabletop grid; drag
 * across them to find each word. The drag snaps to the nearest straight
 * line (row, column or diagonal), so it doesn't need a precise finger.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, popIn, tween, Easing } from '../../shared/js/three-stage.js';

const WORD_POOL = ['PUZZLE', 'CASCADE', 'MATCH', 'MEMORY', 'LOGIC', 'BLOCK', 'MERGE', 'PATTERN', 'CRATE', 'RIDDLE', 'SEARCH', 'BOARD', 'PIXEL', 'BONUS', 'STREAK'];
const CONFIG = {
  easy: { size: 7, wordCount: 5, dirs: [[0, 1], [1, 0]], timeStars: [90000, 180000] },
  medium: { size: 9, wordCount: 7, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1]], timeStars: [150000, 270000] },
  hard: { size: 10, wordCount: 9, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]], timeStars: [240000, 420000] },
};
const SPACING = 0.72;
const TILE = 0.66;

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
function starsForTime(elapsedMs, thresholds) { if (elapsedMs <= thresholds[0]) return 3; if (elapsedMs <= thresholds[1]) return 2; return 1; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function buildGrid(size, words, dirs) {
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const placements = [];
  words.forEach((word) => {
    if (word.length > size) return;
    let placed = false;
    for (let attempt = 0; attempt < 400 && !placed; attempt++) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const r0 = Math.floor(Math.random() * size), c0 = Math.floor(Math.random() * size);
      const endR = r0 + dr * (word.length - 1), endC = c0 + dc * (word.length - 1);
      if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
      let ok = true;
      for (let i = 0; i < word.length; i++) { const r = r0 + dr * i, c = c0 + dc * i; const existing = grid[r][c]; if (existing && existing !== word[i]) { ok = false; break; } }
      if (!ok) continue;
      for (let i = 0; i < word.length; i++) { const r = r0 + dr * i, c = c0 + dc * i; grid[r][c] = word[i]; }
      placements.push({ word, cells: Array.from({ length: word.length }, (_, i) => [r0 + dr * i, c0 + dc * i]) });
      placed = true;
    }
  });
  const alphabet = 'ABCDEFGHIJKLMNOPRSTUVWY';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
  return { grid, placements };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const life = lifecycle();
  // Only words that actually got placed are listed, so the round is always winnable.
  const { grid, placements } = buildGrid(cfg.size, shuffle(WORD_POOL).slice(0, cfg.wordCount), cfg.dirs);
  const words = placements.map((p) => p.word).sort();
  const foundWords = new Set();
  let finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ws-wrap">
      <div class="pc-canvas3d" id="ws-canvas"></div>
      <div class="ws-words" id="ws-words">${words.map((w) => `<div class="ws-word" data-word="${w}">${w}</div>`).join('')}</div>
    </div>
    <div class="pc-stage-hint">Drag across letters in a straight line to find each word.</div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ws-canvas');
  const wordsEl = wrap.querySelector('#ws-words');

  const stage = createStage(canvasHost, { distance: cfg.size * 1.55 });
  const span = (cfg.size - 1) * SPACING + TILE;
  fitBoard(stage, canvasHost, span, span, { pad: 6, top: 6, bottom: 6 });
  const half = (cfg.size - 1) / 2;
  function cellXY(r, c) { return { x: (c - half) * SPACING, y: (half - r) * SPACING }; }

  const tiles = [];
  for (let r = 0; r < cfg.size; r++) {
    for (let c = 0; c < cfg.size; c++) {
      const { x, y } = cellXY(r, c);
      const mesh = makeTile({ w: TILE, h: TILE, depth: 0.14, radius: 0.1, color: 0xfffaf2 });
      mesh.material.envMapIntensity = 0.35; // pale tiles otherwise bloom into a white sheet
      mesh.material.clearcoat = 0.3;
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      applyLabel(mesh, grid[r][c], { size: 96, w: TILE * 0.7, h: TILE * 0.7, color: '#241436' });
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * cfg.size + c) * 4, duration: 220 });
      tiles.push(mesh);
    }
  }

  const COLORS = { idle: 0xfffaf2, selecting: 0xffd93d, found: 0x7ce8b5, hint: 0xffb3d1 };
  const foundCells = new Set();
  function isFoundCell(r, c) { return foundCells.has(r + ',' + c); }
  function setTileState(mesh, state) { mesh.material.color.set(COLORS[state]); }
  function restoreTile(r, c) { setTileState(tiles[r * cfg.size + c], isFoundCell(r, c) ? 'found' : 'idle'); }

  // Continuous board coords (in cells) under the finger.
  function boardPoint(clientX, clientY) {
    const pt = stage.pickPlane(clientX, clientY, 0);
    if (!pt) return null;
    return { c: pt.x / SPACING + half, r: half - pt.y / SPACING };
  }
  const inGrid = (r, c) => r >= 0 && r < cfg.size && c >= 0 && c < cfg.size;

  // Snap the drag to one of 8 straight directions from the start cell.
  function lineTo(start, p) {
    const dr = p.r - start.r, dc = p.c - start.c;
    const dist = Math.hypot(dr, dc);
    if (dist < 0.5) return [start];
    const oct = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
    const sr = Math.round(Math.sin(oct * Math.PI / 4)), sc = Math.round(Math.cos(oct * Math.PI / 4));
    let len = Math.round(Math.max(Math.abs(dr), Math.abs(dc)));
    while (len > 0 && !inGrid(start.r + sr * len, start.c + sc * len)) len--;
    const cells = [];
    for (let i = 0; i <= len; i++) cells.push({ r: start.r + sr * i, c: start.c + sc * i });
    return cells;
  }

  let drag = null, selection = [];
  function paintSelection(cells) {
    selection.forEach(({ r, c }) => restoreTile(r, c));
    selection = cells;
    selection.forEach(({ r, c }) => setTileState(tiles[r * cfg.size + c], 'selecting'));
  }

  const canvas = stage.renderer.domElement;
  function onDown(e) {
    if (finished) return;
    const p = boardPoint(e.clientX, e.clientY);
    if (!p) return;
    const r = Math.round(p.r), c = Math.round(p.c);
    if (!inGrid(r, c)) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drag = { r, c, id: e.pointerId };
    paintSelection([{ r, c }]);
    api.sound.click();
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = boardPoint(e.clientX, e.clientY);
    if (!p) return;
    const cells = lineTo(drag, p);
    if (cells.length !== selection.length || cells.some((cell, i) => cell.r !== selection[i].r || cell.c !== selection[i].c)) paintSelection(cells);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    checkSelection();
    selection.forEach(({ r, c }) => restoreTile(r, c));
    selection = [];
  }
  function onCancel() {
    drag = null;
    selection.forEach(({ r, c }) => restoreTile(r, c));
    selection = [];
  }

  function checkSelection() {
    if (selection.length < 2) return;
    const str = selection.map(({ r, c }) => grid[r][c]).join('');
    const rev = str.split('').reverse().join('');
    const match = placements.find((p) => !foundWords.has(p.word) && (p.word === str || p.word === rev));
    if (match) {
      foundWords.add(match.word);
      api.sound.match();
      selection.forEach(({ r, c }) => foundCells.add(r + ',' + c));
      const label = wordsEl.querySelector(`[data-word="${match.word}"]`);
      if (label) label.classList.add('is-found');
      api.ui.burstFromElement(canvasHost, { count: 14 });
      if (foundWords.size === words.length) {
        finished = true;
        const stars = starsForTime(api.elapsedMs(), cfg.timeStars);
        life.later(() => api.win(stars, { words: words.length }), 300);
      }
    } else if (selection.length >= 3) {
      api.sound.error();
      api.ui.shake(canvasHost);
    }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  // Hint lights up the first letter of a word and names it.
  function hint() {
    const remaining = placements.filter((p) => !foundWords.has(p.word));
    if (!remaining.length) { api.ui.toast(`${api.playerName}, you found every word!`); return; }
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    const [r0, c0] = pick.cells[0];
    const first = tiles[r0 * cfg.size + c0];
    setTileState(first, 'hint');
    tween(first.scale, { x: 1.35, y: 1.35, z: 1.35 }, 180, Easing.outBack, () => tween(first.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
    api.ui.toast(`${api.playerName}, ${pick.word} starts at the pink letter!`);
    life.later(() => { if (!selection.some((s) => s.r === r0 && s.c === c0)) restoreTile(r0, c0); }, 2200);
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('wordsearch', { mount });
