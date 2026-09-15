/**
 * Game 26 - Flow Connect (3D). Drag from a colored dot to its matching
 * dot to lay a pipe; pipes can't cross each other. Connect every pair
 * to win - fill the whole board for full marks.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 5, colorsCount: 4 },
  medium: { size: 6, colorsCount: 5 },
  hard: { size: 7, colorsCount: 7 },
};
const CELL = 1.0;
const EMPTY_COLOR = 0x2a1f4d;

function key(r, c) { return r + ',' + c; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const DIRS4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Builds a solvable puzzle: grow a random self-avoiding walk per color,
// then greedily extend every path outward to soak up leftover free cells
// so the finished board is (usually) fully covered by some valid solution.
function generatePuzzle(size, colorsCount) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const owner = Array.from({ length: size }, () => Array(size).fill(-1));
    const paths = [];
    let ok = true;
    for (let idx = 0; idx < colorsCount; idx++) {
      const free = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (owner[r][c] === -1) free.push([r, c]);
      if (!free.length) { ok = false; break; }
      const start = free[Math.floor(Math.random() * free.length)];
      const targetLen = 2 + Math.floor(Math.random() * Math.max(1, Math.floor((size * size) / colorsCount)));
      const path = [start];
      owner[start[0]][start[1]] = idx;
      while (path.length < targetLen) {
        const [r, c] = path[path.length - 1];
        const options = shuffle(DIRS4).map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && rr < size && cc >= 0 && cc < size && owner[rr][cc] === -1);
        if (!options.length) break;
        const next = options[0];
        owner[next[0]][next[1]] = idx;
        path.push(next);
      }
      if (path.length < 2) { ok = false; break; }
      paths.push(path);
    }
    if (!ok) continue;
    // greedily extend paths at either end into remaining free cells
    let progress = true;
    while (progress) {
      progress = false;
      for (let idx = 0; idx < paths.length; idx++) {
        const path = paths[idx];
        for (const end of [0, path.length - 1]) {
          const [r, c] = path[end];
          const options = shuffle(DIRS4).map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && rr < size && cc >= 0 && cc < size && owner[rr][cc] === -1);
          if (options.length) {
            const next = options[0];
            owner[next[0]][next[1]] = idx;
            if (end === 0) path.unshift(next); else path.push(next);
            progress = true;
          }
        }
      }
    }
    return { paths, size };
  }
  // fallback: minimal 2-cell paths
  const owner = Array.from({ length: size }, () => Array(size).fill(-1));
  const paths = [];
  const free = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) free.push([r, c]);
  const shuffled = shuffle(free);
  for (let idx = 0; idx < colorsCount && shuffled.length >= 2; idx++) {
    paths.push([shuffled.pop(), shuffled.pop()]);
  }
  return { paths, size };
}

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  const { paths: solutionPaths } = generatePuzzle(size, cfg.colorsCount);
  const numColors = solutionPaths.length;
  const endpoints = solutionPaths.map((p) => [p[0], p[p.length - 1]]);
  const colorOf = (idx) => PALETTE[idx % PALETTE.length];

  const cellOwner = Array.from({ length: size }, () => Array(size).fill(-1));
  const isEndpoint = Array.from({ length: size }, () => Array(size).fill(-1));
  endpoints.forEach((pair, idx) => { pair.forEach(([r, c]) => { isEndpoint[r][c] = idx; cellOwner[r][c] = idx; }); });
  const playerPaths = Array.from({ length: numColors }, () => null); // ordered [[r,c],...] or null
  let dragging = null; // { color, path: [[r,c]] }
  let finished = false, resets = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="fc-meta"><span id="fc-status">Drag from a dot to its matching color</span></div>
    <div class="pc-canvas3d" id="fc-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Pipes can't cross - fill the board for full stars</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#fc-canvas');
  const statusEl = wrap.querySelector('#fc-status');

  const halfExt = size * CELL / 2 + CELL * 0.5;
  const aspectMin = 0.46;
  const distance = Math.max((halfExt + 0.5) / (0.42 * aspectMin), (halfExt + 0.5) / 0.42) * 1.05;
  const stage = createStage(canvasHost, { distance });

  const cellMeshes = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const { x, y } = cellXY(r, c, size);
      const mesh = makeTile({ w: CELL * 0.92, h: CELL * 0.92, depth: 0.14, radius: 0.14, color: EMPTY_COLOR, roughness: 0.7 });
      mesh.position.set(x, y, 0);
      mesh.userData = { r, c };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * size + c) * 8, duration: 180 });
      row.push(mesh);
    }
    cellMeshes.push(row);
  }

  const dotMeshes = Array.from({ length: size }, () => Array(size).fill(null));
  endpoints.forEach((pair, idx) => {
    pair.forEach(([r, c]) => {
      const { x, y } = cellXY(r, c, size);
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 24), new THREE.MeshPhysicalMaterial({ color: colorOf(idx), roughness: 0.3, metalness: 0.15, clearcoat: 0.6 }));
      dot.rotation.x = Math.PI / 2;
      dot.position.set(x, y, 0.14);
      dot.castShadow = true;
      stage.world.add(dot);
      dotMeshes[r][c] = dot;
    });
  });

  function refreshCellVisual(r, c) {
    const owner = cellOwner[r][c];
    const mesh = cellMeshes[r][c];
    if (owner === -1) { mesh.material.color.set(EMPTY_COLOR); return; }
    mesh.material.color.set(colorOf(owner));
  }

  function clearColorCells(colorIdx) {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (cellOwner[r][c] === colorIdx && isEndpoint[r][c] !== colorIdx) { cellOwner[r][c] = -1; refreshCellVisual(r, c); }
    }
  }

  function paintPath(colorIdx, path) {
    path.forEach(([r, c]) => { cellOwner[r][c] = colorIdx; refreshCellVisual(r, c); });
  }

  function coverage() {
    let filled = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (cellOwner[r][c] !== -1) filled++;
    return filled / (size * size);
  }

  function allConnected() {
    return playerPaths.every((p, idx) => {
      if (!p || p.length < 2) return false;
      const [er0, ec0] = endpoints[idx][0], [er1, ec1] = endpoints[idx][1];
      const first = p[0], last = p[p.length - 1];
      const hitsStart = (first[0] === er0 && first[1] === ec0) || (first[0] === er1 && first[1] === ec1);
      const hitsEnd = (last[0] === er0 && last[1] === ec0) || (last[0] === er1 && last[1] === ec1);
      return hitsStart && hitsEnd && (first[0] !== last[0] || first[1] !== last[1]);
    });
  }

  function checkWin() {
    if (!allConnected()) return;
    finished = true;
    statusEl.textContent = 'All connected!';
    api.ui.burstFromElement(canvasHost);
    const cov = coverage();
    const stars = cov >= 0.97 ? 3 : cov >= 0.75 ? 2 : 1;
    setTimeout(() => api.win(stars, { coverage: Math.round(cov * 100), resets }), 300);
  }

  function cellAt(clientX, clientY) {
    const hit = stage.pick(clientX, clientY, cellMeshes.flat());
    return hit ? hit.object.userData : null;
  }

  function startDrag(r, c) {
    const colorIdx = isEndpoint[r][c];
    if (colorIdx === -1) return;
    clearColorCells(colorIdx);
    playerPaths[colorIdx] = null;
    dragging = { color: colorIdx, path: [[r, c]] };
    resets++;
    api.sound.click();
  }

  function extendDrag(r, c) {
    if (!dragging) return;
    const { color, path } = dragging;
    const last = path[path.length - 1];
    if (last[0] === r && last[1] === c) return;
    // backtrack support: stepping onto the previous cell shortens the path
    if (path.length >= 2) {
      const prev = path[path.length - 2];
      if (prev[0] === r && prev[1] === c) {
        const removed = path.pop();
        if (isEndpoint[removed[0]][removed[1]] !== color) { cellOwner[removed[0]][removed[1]] = -1; refreshCellVisual(removed[0], removed[1]); }
        return;
      }
    }
    const adjacent = Math.abs(last[0] - r) + Math.abs(last[1] - c) === 1;
    if (!adjacent) return;
    const owner = cellOwner[r][c];
    if (owner !== -1 && owner !== color) return; // blocked by another color
    if (owner === color && isEndpoint[r][c] === -1) return; // already part of this path elsewhere (avoid loops)
    path.push([r, c]);
    cellOwner[r][c] = color;
    refreshCellVisual(r, c);
    if (isEndpoint[r][c] === color && !(r === path[0][0] && c === path[0][1])) {
      // reached the matching endpoint - finish
      finishDrag();
    }
  }

  function finishDrag() {
    if (!dragging) return;
    const { color, path } = dragging;
    playerPaths[color] = path.slice();
    dragging = null;
    checkWin();
  }

  function onPointerDown(e) {
    if (finished) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    startDrag(cell.r, cell.c);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    extendDrag(cell.r, cell.c);
  }
  function onPointerUp() {
    if (!dragging) return;
    // incomplete path: keep cells painted but not marked connected
    playerPaths[dragging.color] = dragging.path.slice();
    dragging = null;
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  function hint() {
    if (finished) return;
    for (let idx = 0; idx < numColors; idx++) {
      const solved = playerPaths[idx];
      const isDone = solved && allConnectedSingle(idx, solved);
      if (isDone) continue;
      const sol = solutionPaths[idx];
      // find first solution cell not yet owned by this color
      const target = sol.find(([r, c]) => cellOwner[r][c] !== idx);
      if (target) {
        const mesh = cellMeshes[target[0]][target[1]];
        tween(mesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
        api.ui.toast(`${api.playerName}, route that color through the glowing cell!`);
        return;
      }
    }
    api.ui.toast(`${api.playerName}, every pipe already matches the solution!`);
  }
  function allConnectedSingle(idx, p) {
    if (!p || p.length < 2) return false;
    const [er0, ec0] = endpoints[idx][0], [er1, ec1] = endpoints[idx][1];
    const first = p[0], last = p[p.length - 1];
    const hitsStart = (first[0] === er0 && first[1] === ec0) || (first[0] === er1 && first[1] === ec1);
    const hitsEnd = (last[0] === er0 && last[1] === ec0) || (last[0] === er1 && last[1] === ec1);
    return hitsStart && hitsEnd;
  }

  return {
    unmount: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('flowconnect', { mount });
