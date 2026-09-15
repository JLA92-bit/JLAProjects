/**
 * Game 25 - Nonogram / Picross (3D). Row and column clues tell you how
 * many filled cells appear in each run. Tap to fill, tap again to mark
 * an X, tap a third time to clear. Match the hidden picture to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 5, fillChance: 0.55, timeStars: [50000, 100000] },
  medium: { size: 8, fillChance: 0.5, timeStars: [110000, 200000] },
  hard: { size: 10, fillChance: 0.48, timeStars: [170000, 300000] },
};
const CELL = 0.82;
const FILL_COLOR = 0x241436;
const EMPTY_COLOR = 0xc9bfe0;
const MARK_COLOR = 0xffb3c6;

function lineClues(bools) {
  const groups = [];
  let run = 0;
  bools.forEach((v) => { if (v) run++; else if (run > 0) { groups.push(run); run = 0; } });
  if (run > 0) groups.push(run);
  return groups.length ? groups : [0];
}

function generateSolution(size, fillChance) {
  let grid;
  for (let attempt = 0; attempt < 30; attempt++) {
    grid = Array.from({ length: size }, () => Array.from({ length: size }, () => Math.random() < fillChance));
    const total = grid.flat().filter(Boolean).length;
    if (total > size && total < size * size - size) break;
  }
  return grid;
}

function computeLeft(groups, length) {
  if (groups.length === 1 && groups[0] === 0) return [];
  let pos = 0; const starts = [];
  groups.forEach((g) => { starts.push(pos); pos += g + 1; });
  return starts;
}
function computeRight(groups, length) {
  if (groups.length === 1 && groups[0] === 0) return [];
  let pos = length; const starts = new Array(groups.length);
  for (let i = groups.length - 1; i >= 0; i--) { pos -= groups[i]; starts[i] = pos; pos -= 1; }
  return starts;
}
function overlapCells(groups, length) {
  if (groups.length === 1 && groups[0] === 0) return [];
  const left = computeLeft(groups, length), right = computeRight(groups, length);
  const filled = [];
  groups.forEach((g, i) => {
    const start = right[i], end = left[i] + g - 1;
    for (let x = start; x <= end; x++) if (x >= 0 && x < length) filled.push(x);
  });
  return filled;
}

function makeClueTexture(lines, { vertical = false, aspect = 1 } = {}) {
  // Canvas pixel dimensions mirror the target plane's aspect ratio so text
  // never gets stretched or squashed when mapped onto a non-square plane.
  const base = 120;
  const w = vertical ? base : Math.round(base * aspect);
  const h = vertical ? Math.round(base / aspect) : base;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  const fontSize = vertical ? Math.min(30, h / Math.max(lines.length, 1) * 0.62) : 34;
  ctx.font = `800 ${fontSize}px 'Baloo 2', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    const lineH = h / Math.max(lines.length, 1);
    lines.forEach((t, i) => ctx.fillText(t, w / 2, lineH * (i + 0.5)));
  } else {
    ctx.fillText(lines.join(' '), w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  const solution = generateSolution(size, cfg.fillChance);
  const rowClues = solution.map((row) => lineClues(row));
  const colClues = Array.from({ length: size }, (_, c) => lineClues(solution.map((row) => row[c])));
  const state = Array.from({ length: size }, () => Array(size).fill(0)); // 0 empty,1 fill,2 mark
  let finished = false, moves = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ng-meta"><span id="ng-status">Tap: fill -> mark X -> clear</span></div>
    <div class="pc-canvas3d" id="ng-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Match the row &amp; column clues</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ng-canvas');
  const statusEl = wrap.querySelector('#ng-status');

  const maxRowGroups = Math.max(...rowClues.map((g) => g.length));
  const maxColGroups = Math.max(...colClues.map((g) => g.length));
  const rowClueW = 0.55 * maxRowGroups + 0.5;
  const colClueH = 0.4 * maxColGroups + 0.5;
  const gridSpan = size * CELL;
  const totalW = gridSpan + rowClueW;
  const totalH = gridSpan + colClueH;
  const aspectMin = 0.46;
  const distance = Math.max((totalW / 2 + 0.4) / (0.42 * aspectMin), (totalH / 2 + 0.4) / 0.42) * 1.05;

  const stage = createStage(canvasHost, { distance });

  // Grid cell (r,c): shifted right by half the row-clue width and down by
  // half the column-clue height so both label strips fit around it.
  const halfGrid = gridSpan / 2;
  function cellPos(r, c) {
    const x = -halfGrid + c * CELL + CELL / 2 + rowClueW / 2;
    const y = halfGrid - r * CELL - CELL / 2 - colClueH / 2;
    return { x, y };
  }

  const cellMeshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellPos(r, c);
      const mesh = makeTile({ w: CELL * 0.92, h: CELL * 0.92, depth: 0.16, radius: 0.08, color: EMPTY_COLOR, roughness: 0.6 });
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 6, duration: 200 });
      row.push(mesh);
    }
    cellMeshes.push(row);
  }

  // row clue labels (left of grid)
  for (let r = 0; r < size; r++) {
    const { y } = cellPos(r, 0);
    const planeW = rowClueW * 0.95, planeH = CELL * 0.9;
    const tex = makeClueTexture(rowClues[r].map(String), { aspect: planeW / planeH });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
    plane.position.set(-halfGrid + rowClueW / 2 - 0.05, y, 0.05);
    stage.world.add(plane);
  }

  // column clue labels (above grid)
  for (let c = 0; c < size; c++) {
    const { x } = cellPos(0, c);
    const planeW = CELL * 0.9, planeH = colClueH * 0.95;
    const tex = makeClueTexture(colClues[c].map(String), { vertical: true, aspect: planeW / planeH });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
    plane.position.set(x, halfGrid - colClueH / 2 + 0.02, 0.05);
    stage.world.add(plane);
  }

  function setCellVisual(r, c) {
    const mesh = cellMeshes[r][c];
    const v = state[r][c];
    mesh.material.color.set(v === 1 ? FILL_COLOR : v === 2 ? MARK_COLOR : EMPTY_COLOR);
    mesh.material.emissiveIntensity = 0;
  }

  function checkWin() {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const shouldFill = solution[r][c];
      const isFilled = state[r][c] === 1;
      if (shouldFill !== isFilled) return false;
    }
    return true;
  }

  function onPointerDown(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, cellMeshes.flat());
    if (!hit) return;
    const { r, c } = hit.object.userData;
    state[r][c] = (state[r][c] + 1) % 3;
    setCellVisual(r, c);
    tween(cellMeshes[r][c].scale, { x: 1.12, y: 1.12, z: 1.12 }, 100, Easing.outBack, () => tween(cellMeshes[r][c].scale, { x: 1, y: 1, z: 1 }, 140, Easing.outCubic));
    api.sound.click();
    moves++;
    if (checkWin()) {
      finished = true;
      statusEl.textContent = 'Solved!';
      api.ui.burstFromElement(canvasHost);
      const elapsed = api.elapsedMs();
      const stars = elapsed <= cfg.timeStars[0] ? 3 : elapsed <= cfg.timeStars[1] ? 2 : 1;
      setTimeout(() => api.win(stars, { moves }), 300);
    }
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished) return;
    for (let r = 0; r < size; r++) {
      const cells = overlapCells(rowClues[r], size);
      for (const c of cells) { if (state[r][c] !== 1) { glow(r, c); return; } }
    }
    for (let c = 0; c < size; c++) {
      const cells = overlapCells(colClues[c], size);
      for (const r of cells) { if (state[r][c] !== 1) { glow(r, c); return; } }
    }
    // fallback: any still-wrong cell
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (solution[r][c] && state[r][c] !== 1) { glow(r, c); return; }
    }
    api.ui.toast(`${api.playerName}, your board already matches every clue!`);
  }
  function glow(r, c) {
    const mesh = cellMeshes[r][c];
    mesh.material.emissive.set(0xffd93d);
    mesh.material.emissiveIntensity = 0.7;
    tween(mesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic, () => { mesh.material.emissiveIntensity = 0; }));
    api.ui.toast(`${api.playerName}, that square must be filled!`);
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

PC.Games.register('nonogram', { mount });
