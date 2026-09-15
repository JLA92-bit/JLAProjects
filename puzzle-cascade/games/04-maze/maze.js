/**
 * Game 4 - Maze Runner (3D). Recursive-backtracker maze rendered as a
 * tilted 3D corridor set; race the clock from start to the flag.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 7, timeLimitMs: 45000 },
  medium: { size: 11, timeLimitMs: 70000 },
  hard: { size: 15, timeLimitMs: 100000 },
};
const CELL = 1.0;
const WALL_T = 0.1;
const WALL_H = 0.5;

function generateMaze(size) {
  const cells = [];
  for (let r = 0; r < size; r++) { const row = []; for (let c = 0; c < size; c++) row.push({ N: true, E: true, S: true, W: true, visited: false }); cells.push(row); }
  const stack = [[0, 0]];
  cells[0][0].visited = true;
  const DIRS = [['N', 0, -1, 'S'], ['S', 0, 1, 'N'], ['E', 1, 0, 'W'], ['W', -1, 0, 'E']];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const options = DIRS.filter(([, dc, dr]) => { const nr = r + dr, nc = c + dc; return nr >= 0 && nr < size && nc >= 0 && nc < size && !cells[nr][nc].visited; });
    if (!options.length) { stack.pop(); continue; }
    const [dir, dc, dr, opp] = options[Math.floor(Math.random() * options.length)];
    const nr = r + dr, nc = c + dc;
    cells[r][c][dir] = false; cells[nr][nc][opp] = false; cells[nr][nc].visited = true;
    stack.push([nr, nc]);
  }
  return cells;
}

function starsForTime(remainingMs, totalMs) {
  const frac = remainingMs / totalMs;
  if (frac >= 0.55) return 3;
  if (frac >= 0.25) return 2;
  return 1;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  const maze = generateMaze(size);
  let pos = { r: 0, c: 0 };
  const goal = { r: size - 1, c: size - 1 };
  let finished = false;
  let remainingMs = cfg.timeLimitMs;
  let moving = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="mz-meta"><span class="mz-time">Time left: <span id="mz-time">${Math.ceil(remainingMs / 1000)}s</span></span></div>
    <div class="pc-canvas3d" id="mz-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Arrows / WASD or the pad</span></div>
    </div>
    <div class="mz-dpad" id="mz-dpad">
      <div class="mz-dbtn mz-dbtn--up" data-dir="up">⬆️</div>
      <div class="mz-dbtn mz-dbtn--left" data-dir="left">⬅️</div>
      <div class="mz-dbtn mz-dbtn--right" data-dir="right">➡️</div>
      <div class="mz-dbtn mz-dbtn--down" data-dir="down">⬇️</div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#mz-canvas');
  const timeEl = wrap.querySelector('#mz-time');
  const timeWrapEl = wrap.querySelector('.mz-time');

  const stage = createStage(canvasHost, { distance: size * 1.7, floorZ: -0.02 });
  const half = (size - 1) / 2;
  function cellXY(r, c) { return { x: (c - half) * CELL, y: (half - r) * CELL }; }

  // Floor plate under the maze
  const floorGeo = new THREE.PlaneGeometry(size * CELL + 0.4, size * CELL + 0.4);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b0f5c, roughness: 0.9 });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  floorMesh.position.z = -0.03;
  stage.world.add(floorMesh);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.35, metalness: 0.1 });
  const wallGroup = new THREE.Group();
  function addWall(cx, cy, horizontal) {
    const w = horizontal ? CELL + WALL_T : WALL_T;
    const h = horizontal ? WALL_T : CELL + WALL_T;
    const geo = new THREE.BoxGeometry(w, h, WALL_H);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(cx, cy, WALL_H / 2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    wallGroup.add(mesh);
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = maze[r][c];
      const { x, y } = cellXY(r, c);
      if (cell.N) addWall(x, y + CELL / 2, true);
      if (cell.W) addWall(x - CELL / 2, y, false);
      if (r === size - 1 && cell.S) addWall(x, y - CELL / 2, true);
      if (c === size - 1 && cell.E) addWall(x + CELL / 2, y, false);
    }
  }
  stage.world.add(wallGroup);

  // Goal flag
  const goalXY = cellXY(goal.r, goal.c);
  const goalMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 0.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x23d18b, emissive: 0x23d18b, emissiveIntensity: 0.3, roughness: 0.3 })
  );
  goalMesh.position.set(goalXY.x, goalXY.y, 0.35);
  goalMesh.rotation.y = Math.PI / 4;
  goalMesh.castShadow = true;
  stage.world.add(goalMesh);
  stage.onTick(() => { goalMesh.rotation.z += 0.02; goalMesh.position.z = 0.35 + Math.sin(performance.now() / 300) * 0.06; });

  // Player
  const playerMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xff4d8d, roughness: 0.25, metalness: 0.15, emissive: 0xff4d8d, emissiveIntensity: 0.15 })
  );
  const startXY = cellXY(0, 0);
  playerMesh.position.set(startXY.x, startXY.y, 0.28);
  playerMesh.castShadow = true;
  stage.world.add(playerMesh);
  popIn(playerMesh, { duration: 260 });

  function move(dir) {
    if (finished || moving) return;
    const cell = maze[pos.r][pos.c];
    let nr = pos.r, nc = pos.c;
    if (dir === 'up' && !cell.N) nr--;
    else if (dir === 'down' && !cell.S) nr++;
    else if (dir === 'left' && !cell.W) nc--;
    else if (dir === 'right' && !cell.E) nc++;
    else { api.sound.error(); api.ui.shake(canvasHost); return; }
    pos = { r: nr, c: nc };
    api.sound.move();
    const target = cellXY(nr, nc);
    moving = true;
    tween(playerMesh.position, { x: target.x, y: target.y }, 130, Easing.outCubic, () => {
      moving = false;
      if (pos.r === goal.r && pos.c === goal.c) {
        finished = true;
        clearInterval(timerId);
        const stars = starsForTime(remainingMs, cfg.timeLimitMs);
        api.ui.burstFromElement(canvasHost);
        setTimeout(() => api.win(stars, { remainingMs }), 250);
      }
    });
  }

  function onKey(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  }
  window.addEventListener('keydown', onKey);
  wrap.querySelectorAll('.mz-dbtn').forEach((btn) => btn.addEventListener('click', () => move(btn.dataset.dir)));

  const timerId = setInterval(() => {
    if (finished) return;
    remainingMs -= 200;
    if (remainingMs <= 0) {
      remainingMs = 0; timeEl.textContent = '0s';
      clearInterval(timerId);
      finished = true;
      api.lose('Out of time! Try again.');
      return;
    }
    timeEl.textContent = Math.ceil(remainingMs / 1000) + 's';
    timeWrapEl.classList.toggle('is-low', remainingMs < cfg.timeLimitMs * 0.25);
  }, 200);

  function hint() {
    if (finished || moving) return;
    const start = pos.r * size + pos.c;
    const goalIdx = goal.r * size + goal.c;
    const prev = new Array(size * size).fill(-1);
    const visited = new Array(size * size).fill(false);
    visited[start] = true;
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === goalIdx) break;
      const r = Math.floor(cur / size), c = cur % size;
      const cell = maze[r][c];
      const options = [];
      if (!cell.N) options.push((r - 1) * size + c);
      if (!cell.S) options.push((r + 1) * size + c);
      if (!cell.W) options.push(r * size + (c - 1));
      if (!cell.E) options.push(r * size + (c + 1));
      options.forEach((n) => { if (!visited[n]) { visited[n] = true; prev[n] = cur; queue.push(n); } });
    }
    if (!visited[goalIdx]) return;
    let step = goalIdx;
    while (prev[step] !== start && prev[step] !== -1) step = prev[step];
    const nr = Math.floor(step / size), nc = step % size;
    const dirWord = nr < pos.r ? 'up' : nr > pos.r ? 'down' : nc < pos.c ? 'left' : 'right';
    const dirArrow = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' }[dirWord];
    tween(playerMesh.scale, { x: 1.5, y: 1.5, z: 1.5 }, 160, Easing.outBack, () => tween(playerMesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, head ${dirWord}! ${dirArrow}`);
  }

  return {
    unmount: () => {
      window.removeEventListener('keydown', onKey);
      clearInterval(timerId);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('maze', { mount });
