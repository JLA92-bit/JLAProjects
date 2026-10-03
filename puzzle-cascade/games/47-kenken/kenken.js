/**
 * Game 47 - Math Cages (KenKen). Fill the grid so every row and column
 * holds each number once. Each outlined cage shows a target and an
 * operation: the numbers inside the cage must combine to that target.
 * Puzzles come from a random Latin square cut into random cages.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 4, ops: ['+', '-'], maxCage: 3 },
  medium: { size: 5, ops: ['+', '-', 'x'], maxCage: 3 },
  hard: { size: 6, ops: ['+', '-', 'x', '/'], maxCage: 4 },
};
const CELL = 1;
const EMPTY_COLOR = 0x1d0f3a;
const SELECTED_COLOR = 0x6a4bd0;
const CONFLICT_COLOR = 0x9c2a44;
const CAGE_BAD_COLOR = 0x8a5a14;
const OP_SYMBOL = { '+': '+', '-': '-', x: '×', '/': '÷', '=': '' };

function fitDistance(host, halfW, halfH, margin = 1.08) {
  const w = host.clientWidth, h = host.clientHeight;
  let aspect = w && h ? w / h : 0.5;
  aspect = Math.max(0.4, Math.min(1.6, aspect));
  return Math.max((halfH * margin) / 0.42, (halfW * margin) / (0.42 * aspect));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function latinSquare(n) {
  const rows = shuffle([...Array(n).keys()]);
  const cols = shuffle([...Array(n).keys()]);
  const syms = shuffle([...Array(n).keys()].map((v) => v + 1));
  return rows.map((r) => cols.map((c) => syms[(r + c) % n]));
}

function makeCages(sol, cfg) {
  const n = cfg.size;
  const owner = Array.from({ length: n }, () => Array(n).fill(-1));
  const cages = [];
  let singles = 0;
  for (const idx of shuffle([...Array(n * n).keys()])) {
    const r0 = Math.floor(idx / n), c0 = idx % n;
    if (owner[r0][c0] >= 0) continue;
    const roll = Math.random();
    let target = roll < 0.12 && singles < Math.ceil(n / 3) ? 1 : roll < 0.62 ? 2 : roll < 0.9 ? 3 : cfg.maxCage;
    target = Math.min(target, cfg.maxCage);
    const cells = [[r0, c0]];
    owner[r0][c0] = cages.length;
    while (cells.length < target) {
      const opts = [];
      cells.forEach(([r, c]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n && owner[rr][cc] < 0) opts.push([rr, cc]);
      }));
      if (!opts.length) break;
      const [rr, cc] = opts[Math.floor(Math.random() * opts.length)];
      owner[rr][cc] = cages.length;
      cells.push([rr, cc]);
    }
    if (cells.length === 1) singles++;
    cages.push({ cells });
  }
  cages.forEach((cage) => {
    const vals = cage.cells.map(([r, c]) => sol[r][c]);
    if (vals.length === 1) { cage.op = '='; cage.target = vals[0]; return; }
    const sum = vals.reduce((a, b) => a + b, 0);
    const prod = vals.reduce((a, b) => a * b, 1);
    const choices = [];
    if (vals.length === 2) {
      const [hi, lo] = vals[0] > vals[1] ? vals : [vals[1], vals[0]];
      if (cfg.ops.includes('-')) choices.push(['-', hi - lo]);
      if (cfg.ops.includes('/') && hi % lo === 0) choices.push(['/', hi / lo], ['/', hi / lo]);
      if (cfg.ops.includes('x')) choices.push(['x', prod]);
      choices.push(['+', sum]);
    } else {
      choices.push(['+', sum]);
      if (cfg.ops.includes('x') && prod <= 120) choices.push(['x', prod]);
    }
    const [op, t] = choices[Math.floor(Math.random() * choices.length)];
    cage.op = op; cage.target = t;
  });
  return { cages, owner };
}

function cageOk(cage, vals) {
  if (vals.some((v) => !v)) return null; // incomplete
  if (cage.op === '=') return vals[0] === cage.target;
  if (cage.op === '+') return vals.reduce((a, b) => a + b, 0) === cage.target;
  if (cage.op === 'x') return vals.reduce((a, b) => a * b, 1) === cage.target;
  const hi = Math.max(...vals), lo = Math.min(...vals);
  if (cage.op === '-') return hi - lo === cage.target;
  return hi === lo * cage.target;
}

function cageTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = "800 84px 'Baloo 2', sans-serif";
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(20,8,40,0.9)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, 8, 52);
  ctx.fillStyle = '#ffd93d';
  ctx.fillText(text, 8, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const n = cfg.size;
  const solution = latinSquare(n);
  const { cages, owner } = makeCages(solution, cfg);
  const board = Array.from({ length: n }, () => Array(n).fill(0));
  let selected = null, mistakes = 0, hintsUsed = 0, finished = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="kk-meta"><span>Mistakes: <span class="kk-mistakes">0</span></span><span>Use 1 to ${n}</span></div>
    <div class="pc-canvas3d kk-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a square, then a number below</span></div>
    </div>
    <div class="kk-numpad" style="grid-template-columns: repeat(${n + 1}, minmax(44px, 1fr));"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.kk-canvas');
  const mistakesEl = wrap.querySelector('.kk-mistakes');
  const numpadEl = wrap.querySelector('.kk-numpad');

  const padHandlers = [];
  for (let v = 1; v <= n + 1; v++) {
    const btn = document.createElement('button');
    const val = v <= n ? v : 0;
    btn.className = 'kk-numbtn' + (val === 0 ? ' kk-numbtn--erase' : '');
    btn.textContent = val === 0 ? '✕' : String(val);
    btn.setAttribute('aria-label', val === 0 ? 'Erase' : `Number ${val}`);
    const h = () => place(val);
    btn.addEventListener('click', h);
    padHandlers.push([btn, h]);
    numpadEl.appendChild(btn);
  }

  const half = (n * CELL) / 2;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, half + 0.15, half + 0.15) });
  const cellXY = (r, c) => ({ x: (c - (n - 1) / 2) * CELL, y: ((n - 1) / 2 - r) * CELL });

  // cage tints: neighbouring cages get different palette tints
  const cageTint = [];
  cages.forEach((cage, ci) => {
    const used = new Set();
    cage.cells.forEach(([r, c]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && owner[rr][cc] !== ci && cageTint[owner[rr][cc]] !== undefined) used.add(cageTint[owner[rr][cc]]);
    }));
    let t = Math.floor(Math.random() * PALETTE.length);
    for (let k = 0; k < PALETTE.length && used.has(t); k++) t = (t + 1) % PALETTE.length;
    cageTint[ci] = t;
  });
  const baseColor = (r, c) => new THREE.Color(EMPTY_COLOR).lerp(new THREE.Color(PALETTE[cageTint[owner[r][c]]]), 0.38);

  const meshes = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      const { x, y } = cellXY(r, c);
      const m = makeTile({ w: CELL * 0.94, h: CELL * 0.94, depth: 0.16, radius: 0.1, color: baseColor(r, c), roughness: 0.5 });
      m.position.set(x, y, 0);
      m.userData = { r, c, label: null };
      stage.world.add(m);
      popIn(m, { delay: (r * n + c) * 10 });
      row.push(m);
    }
    meshes.push(row);
  }

  // thick cage borders where neighbouring cells belong to different cages
  const borderMat = new THREE.MeshBasicMaterial({ color: 0xc99a2e });
  const borderGroup = new THREE.Group();
  stage.world.add(borderGroup);
  const T = 0.08;
  function addBar(x, y, w, h) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, h), borderMat);
    bar.position.set(x, y, 0.16);
    bar.renderOrder = 5;
    borderGroup.add(bar);
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const { x, y } = cellXY(r, c);
    if (c === n - 1 || owner[r][c] !== owner[r][c + 1]) addBar(x + CELL / 2, y, T, CELL + T);
    if (c === 0) addBar(x - CELL / 2, y, T, CELL + T);
    if (r === n - 1 || owner[r][c] !== owner[r + 1][c]) addBar(x, y - CELL / 2, CELL + T, T);
    if (r === 0) addBar(x, y + CELL / 2, CELL + T, T);
  }
  borderGroup.scale.set(0.001, 0.001, 1);
  later(() => tween(borderGroup.scale, { x: 1, y: 1 }, 380, Easing.outBack), 200);

  // cage target labels in each cage's top-left cell
  cages.forEach((cage) => {
    const [r, c] = cage.cells.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])[0];
    const text = `${cage.target}${OP_SYMBOL[cage.op]}`;
    const mat = new THREE.MeshBasicMaterial({ map: cageTexture(text), transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), mat);
    plane.position.set(-CELL * 0.47 + 0.4 + 0.02, CELL * 0.47 - 0.15 - 0.01, 0.12);
    plane.renderOrder = 11;
    meshes[r][c].add(plane);
  });

  function setValueLabel(r, c, hinted) {
    const m = meshes[r][c];
    if (m.userData.label) {
      const p = m.userData.label;
      m.remove(p); p.geometry.dispose(); if (p.material.map) p.material.map.dispose(); p.material.dispose();
      m.userData.label = null;
    }
    if (board[r][c]) {
      const p = applyLabel(m, String(board[r][c]), { size: 128, w: 0.6, h: 0.6, color: hinted ? '#7dffc4' : '#ffffff' });
      p.position.y = -0.11;
      m.userData.label = p;
    }
  }

  function refreshColors() {
    const conflict = Array.from({ length: n }, () => Array(n).fill(false));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = board[r][c];
      if (!v) continue;
      for (let k = 0; k < n; k++) {
        if (k !== c && board[r][k] === v) conflict[r][c] = true;
        if (k !== r && board[k][c] === v) conflict[r][c] = true;
      }
    }
    const badCage = cages.map((cage) => cageOk(cage, cage.cells.map(([r, c]) => board[r][c])) === false);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const m = meshes[r][c];
      const isSel = selected && selected.r === r && selected.c === c;
      let col = baseColor(r, c);
      if (badCage[owner[r][c]]) col = new THREE.Color(CAGE_BAD_COLOR);
      if (conflict[r][c]) col = new THREE.Color(CONFLICT_COLOR);
      if (isSel) col = new THREE.Color(SELECTED_COLOR);
      m.material.color.copy(col);
      m.material.emissive.copy(col);
      m.material.emissiveIntensity = isSel ? 0.35 : conflict[r][c] ? 0.25 : 0;
    }
    return conflict;
  }

  function select(r, c) {
    selected = { r, c };
    refreshColors();
    const m = meshes[r][c];
    tween(m.scale, { x: 1.06, y: 1.06 }, 110, Easing.outBack, () => tween(m.scale, { x: 1, y: 1 }, 140));
  }

  function onPointerDown(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, meshes.flat(), false);
    if (!hit) return;
    api.sound.click();
    select(hit.object.userData.r, hit.object.userData.c);
  }
  const el = stage.renderer.domElement;
  el.addEventListener('pointerdown', onPointerDown);

  function place(v) {
    if (finished) return;
    if (!selected) { api.sound.error(); api.ui.shake(canvasHost); api.ui.toast('Tap a square on the board first'); return; }
    const { r, c } = selected;
    board[r][c] = v;
    setValueLabel(r, c, false);
    const conflict = refreshColors();
    const m = meshes[r][c];
    if (v && conflict[r][c]) {
      mistakes++;
      mistakesEl.textContent = mistakes;
      api.sound.error();
      api.ui.shake(canvasHost);
    } else {
      api.sound.click();
      tween(m.scale, { x: 1.1, y: 1.1 }, 110, Easing.outBack, () => tween(m.scale, { x: 1, y: 1 }, 150));
    }
    checkWin();
  }

  function checkWin() {
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!board[r][c]) return;
    const conflict = refreshColors();
    if (conflict.flat().some(Boolean)) return;
    if (!cages.every((cage) => cageOk(cage, cage.cells.map(([r, c]) => board[r][c])))) {
      api.ui.toast('Almost! One of the cage sums is not right yet.');
      return;
    }
    finished = true;
    selected = null;
    refreshColors();
    meshes.flat().forEach((m, i) => later(() => {
      m.material.emissive.set(0x23d18b);
      tween(m.material, { emissiveIntensity: 0.16 }, 200);
      tween(m.scale, { x: 1.12, y: 1.12 }, 150, Easing.outBack, () => tween(m.scale, { x: 1, y: 1 }, 200));
    }, i * 25));
    api.ui.burstFromElement(canvasHost);
    const penalty = mistakes + hintsUsed;
    const stars = penalty === 0 ? 3 : penalty <= Math.ceil(n / 2) ? 2 : 1;
    later(() => api.win(stars, { mistakes, hints: hintsUsed }), 500);
  }

  function hint() {
    if (finished) return;
    const wrong = [], empty = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!board[r][c]) empty.push([r, c]);
      else if (board[r][c] !== solution[r][c]) wrong.push([r, c]);
    }
    let target = null;
    if (selected && board[selected.r][selected.c] !== solution[selected.r][selected.c]) target = [selected.r, selected.c];
    else if (wrong.length) target = wrong[0];
    else if (empty.length) {
      // prefer a cell in the cage closest to finished
      empty.sort((a, b) => {
        const fa = cages[owner[a[0]][a[1]]].cells.filter(([r, c]) => !board[r][c]).length;
        const fb = cages[owner[b[0]][b[1]]].cells.filter(([r, c]) => !board[r][c]).length;
        return fa - fb;
      });
      target = empty[0];
    }
    if (!target) return;
    const [r, c] = target;
    hintsUsed++;
    board[r][c] = solution[r][c];
    selected = { r, c };
    setValueLabel(r, c, true);
    refreshColors();
    const m = meshes[r][c];
    tween(m.scale, { x: 1.3, y: 1.3 }, 180, Easing.outBack, () => tween(m.scale, { x: 1, y: 1 }, 220));
    api.ui.toast(wrong.length ? `${api.playerName}, I fixed a square that was wrong.` : `${api.playerName}, here is one square filled in!`);
    checkWin();
  }

  return {
    unmount: () => {
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      el.removeEventListener('pointerdown', onPointerDown);
      padHandlers.forEach(([b, h]) => b.removeEventListener('click', h));
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('kenken', { mount });
