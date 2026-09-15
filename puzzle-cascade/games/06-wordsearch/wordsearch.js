/**
 * Game 6 - Word Search (3D). Letter tiles on a tabletop grid; drag
 * across them (raycast picking on pointermove) to find each word.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, popIn } from '../../shared/js/three-stage.js';

const WORD_POOL = ['PUZZLE', 'CASCADE', 'MATCH', 'MEMORY', 'LOGIC', 'BLOCK', 'MERGE', 'PATTERN', 'CRATE', 'RIDDLE', 'SEARCH', 'BOARD', 'PIXEL', 'BONUS', 'STREAK'];
const CONFIG = {
  easy: { size: 8, wordCount: 5, dirs: [[0, 1], [1, 0]], timeStars: [60000, 100000] },
  medium: { size: 10, wordCount: 7, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1]], timeStars: [100000, 160000] },
  hard: { size: 12, wordCount: 9, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]], timeStars: [150000, 240000] },
};
const SPACING = 0.72;
const TILE = 0.62;

function starsForTime(elapsedMs, thresholds) { if (elapsedMs <= thresholds[0]) return 3; if (elapsedMs <= thresholds[1]) return 2; return 1; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function buildGrid(size, words, dirs) {
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const placements = [];
  words.forEach((word) => {
    let placed = false;
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
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
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
  return { grid, placements };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const words = shuffle(WORD_POOL).slice(0, cfg.wordCount);
  const { grid, placements } = buildGrid(cfg.size, words, cfg.dirs);
  const foundWords = new Set();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ws-wrap">
      <div class="pc-canvas3d" id="ws-canvas"></div>
      <div class="ws-words" id="ws-words">${words.map((w) => `<div class="ws-word" data-word="${w}">${w}</div>`).join('')}</div>
    </div>
    <div class="pc-stage-hint">Drag across letters (any direction) to find each word.</div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ws-canvas');
  const wordsEl = wrap.querySelector('#ws-words');

  const stage = createStage(canvasHost, { distance: cfg.size * 1.55 });
  const half = (cfg.size - 1) / 2;
  function cellXY(r, c) { return { x: (c - half) * SPACING, y: (half - r) * SPACING }; }

  const tiles = [];
  for (let r = 0; r < cfg.size; r++) {
    for (let c = 0; c < cfg.size; c++) {
      const { x, y } = cellXY(r, c);
      const mesh = makeTile({ w: TILE, h: TILE, depth: 0.14, radius: 0.1, color: 0xfffaf2 });
      mesh.material.color.set(0xffffff);
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      applyLabel(mesh, grid[r][c], { size: 96, w: TILE * 0.62, h: TILE * 0.62, color: '#241436' });
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * cfg.size + c) * 4, duration: 220 });
      tiles.push(mesh);
    }
  }

  function setTileState(mesh, state) {
    const colors = { idle: 0xfffaf2, selecting: 0xffd93d, found: 0x23d18b };
    mesh.material.color.set(colors[state]);
  }

  let dragging = false, start = null, selection = [];

  function pickTile(clientX, clientY) {
    const hit = stage.pick(clientX, clientY, tiles);
    return hit ? hit.object : null;
  }

  function computeLine(a, b) {
    const dr = Math.sign(b.r - a.r), dc = Math.sign(b.c - a.c);
    if (a.r !== b.r && a.c !== b.c && Math.abs(a.r - b.r) !== Math.abs(a.c - b.c)) return null;
    const len = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c)) + 1;
    const cells = [];
    for (let i = 0; i < len; i++) { const r = a.r + dr * i, c = a.c + dc * i; cells.push({ r, c, mesh: tiles[r * cfg.size + c] }); }
    return cells;
  }

  function clearSelectionStyle() { selection.forEach(({ mesh }) => setTileState(mesh, 'idle')); }

  function onDown(e) {
    const mesh = pickTile(e.clientX, e.clientY);
    if (!mesh) return;
    dragging = true;
    start = mesh.userData;
    selection = [{ r: start.r, c: start.c, mesh }];
    setTileState(mesh, 'selecting');
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging) return;
    const mesh = pickTile(e.clientX, e.clientY);
    if (!mesh) return;
    const line = computeLine(start, mesh.userData);
    if (!line) return;
    clearSelectionStyle();
    selection = line;
    selection.forEach(({ mesh: m }) => setTileState(m, 'selecting'));
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    checkSelection();
    selection.forEach(({ mesh, r, c }) => { const key = r + ',' + c; if (!isFoundCell(r, c)) setTileState(mesh, 'idle'); });
    selection = [];
  }

  const foundCells = new Set();
  function isFoundCell(r, c) { return foundCells.has(r + ',' + c); }

  function checkSelection() {
    if (selection.length < 2) return;
    const str = selection.map(({ r, c }) => grid[r][c]).join('');
    const rev = str.split('').reverse().join('');
    const match = placements.find((p) => !foundWords.has(p.word) && (p.word === str || p.word === rev));
    if (match) {
      foundWords.add(match.word);
      api.sound.match();
      selection.forEach(({ mesh, r, c }) => { setTileState(mesh, 'found'); foundCells.add(r + ',' + c); });
      const label = wordsEl.querySelector(`[data-word="${match.word}"]`);
      if (label) label.classList.add('is-found');
      api.ui.burstFromElement(canvasHost, { count: 14 });
      if (foundWords.size === words.length) {
        const stars = starsForTime(api.elapsedMs(), cfg.timeStars);
        setTimeout(() => api.win(stars, {}), 300);
      }
    } else {
      api.sound.error();
    }
  }

  stage.renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function hint() {
    const remaining = placements.filter((p) => !foundWords.has(p.word));
    if (!remaining.length) return;
    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    pick.cells.forEach(([r, c]) => setTileState(tiles[r * cfg.size + c], 'selecting'));
    api.ui.toast(`${api.playerName}, one word is glowing - go find it!`);
    setTimeout(() => {
      pick.cells.forEach(([r, c]) => { if (!isFoundCell(r, c)) setTileState(tiles[r * cfg.size + c], 'idle'); });
    }, 1000);
  }

  return {
    unmount: () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('wordsearch', { mount });
