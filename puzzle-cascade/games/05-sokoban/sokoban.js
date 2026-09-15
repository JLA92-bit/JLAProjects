/**
 * Game 5 - Sokoban Block Push (3D). Hand-authored levels (1/2/3 crates),
 * rendered as a tilted 3D room; push every crate onto a glowing target.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const LEVELS = {
  easy: { moveStars: [14, 22], rows: ['#####', '#   #', '# $ #', '# . #', '# @ #', '#####'] },
  medium: { moveStars: [30, 48], rows: ['#######', '#     #', '# $ $ #', '#  #  #', '# . . #', '#  @  #', '#######'] },
  hard: { moveStars: [46, 70], rows: ['########', '#      #', '# $ $ $#', '#      #', '# . . .#', '#@     #', '########'] },
};
const CELL = 1.0;

function starsForMoves(moveStars, moves) {
  if (moves <= moveStars[0]) return 3;
  if (moves <= moveStars[1]) return 2;
  return 1;
}

function parseLevel(rows) {
  const walls = new Set(), targets = new Set(), boxes = new Set();
  let player = null;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c], key = r + ',' + c;
      if (ch === '#') walls.add(key);
      else if (ch === '.') targets.add(key);
      else if (ch === '$') boxes.add(key);
      else if (ch === '@') player = { r, c };
    }
  });
  return { walls, targets, boxes, player, height: rows.length, width: Math.max(...rows.map((r) => r.length)) };
}

function mount(container, difficulty, api) {
  const level = LEVELS[difficulty];
  const state = parseLevel(level.rows);
  let moves = 0, finished = false, moving = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sk-meta">Moves: <span id="sk-moves">0</span></div>
    <div class="pc-canvas3d" id="sk-canvas"></div>
    <div class="sk-dpad" id="sk-dpad">
      <div class="sk-dbtn sk-dbtn--up" data-dir="up">⬆️</div>
      <div class="sk-dbtn sk-dbtn--left" data-dir="left">⬅️</div>
      <div class="sk-dbtn sk-dbtn--right" data-dir="right">➡️</div>
      <div class="sk-dbtn sk-dbtn--down" data-dir="down">⬇️</div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#sk-canvas');
  const movesEl = wrap.querySelector('#sk-moves');

  const stage = createStage(canvasHost, { distance: Math.max(state.width, state.height) * 1.9 });
  const halfW = (state.width - 1) / 2, halfH = (state.height - 1) / 2;
  function cellXY(r, c) { return { x: (c - halfW) * CELL, y: (halfH - r) * CELL }; }

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b0f5c, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6a2dd6, roughness: 0.4 });
  const targetMat = new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 0.35, roughness: 0.3 });
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xff9f43, roughness: 0.35 });
  const boxDoneMat = new THREE.MeshStandardMaterial({ color: 0x23d18b, roughness: 0.3, emissive: 0x23d18b, emissiveIntensity: 0.2 });

  for (let r = 0; r < state.height; r++) {
    for (let c = 0; c < state.width; c++) {
      const key = r + ',' + c;
      const { x, y } = cellXY(r, c);
      if (state.walls.has(key)) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.96, CELL * 0.96, 0.5), wallMat);
        wall.position.set(x, y, 0.25);
        wall.castShadow = true; wall.receiveShadow = true;
        stage.world.add(wall);
      } else {
        const floor = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, CELL * 0.98, 0.08), floorMat);
        floor.position.set(x, y, -0.04);
        floor.receiveShadow = true;
        stage.world.add(floor);
        if (state.targets.has(key)) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 10, 20), targetMat);
          ring.position.set(x, y, 0.02);
          stage.world.add(ring);
        }
      }
    }
  }

  const boxMeshes = new Map(); // key -> mesh
  state.boxes.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    const { x, y } = cellXY(r, c);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), state.targets.has(key) ? boxDoneMat : boxMat);
    mesh.position.set(x, y, 0.3);
    mesh.castShadow = true; mesh.receiveShadow = true;
    stage.world.add(mesh);
    popIn(mesh, { duration: 240 });
    boxMeshes.set(key, mesh);
  });

  const playerMesh = new THREE.Mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.22, 0.3, 4, 10) : new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshStandardMaterial({ color: 0xff4d8d, roughness: 0.3, emissive: 0xff4d8d, emissiveIntensity: 0.1 }));
  const pStart = cellXY(state.player.r, state.player.c);
  playerMesh.position.set(pStart.x, pStart.y, 0.35);
  playerMesh.castShadow = true;
  stage.world.add(playerMesh);
  popIn(playerMesh, { duration: 240 });

  function move(dir) {
    if (finished || moving) return;
    const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    const nr = state.player.r + d[0], nc = state.player.c + d[1];
    const nKey = nr + ',' + nc;
    if (state.walls.has(nKey)) { api.sound.error(); api.ui.shake(canvasHost); return; }
    let boxTarget = null;
    if (state.boxes.has(nKey)) {
      const br = nr + d[0], bc = nc + d[1];
      const bKey = br + ',' + bc;
      if (state.walls.has(bKey) || state.boxes.has(bKey)) { api.sound.error(); api.ui.shake(canvasHost); return; }
      boxTarget = { from: nKey, to: bKey, r: br, c: bc };
    }
    moving = true;
    const playerXY = cellXY(nr, nc);
    api.sound.move();
    if (boxTarget) {
      state.boxes.delete(boxTarget.from);
      state.boxes.add(boxTarget.to);
      const mesh = boxMeshes.get(boxTarget.from);
      boxMeshes.delete(boxTarget.from);
      boxMeshes.set(boxTarget.to, mesh);
      const boxXY = cellXY(boxTarget.r, boxTarget.c);
      mesh.material = state.targets.has(boxTarget.to) ? boxDoneMat : boxMat;
      tween(mesh.position, { x: boxXY.x, y: boxXY.y }, 150, Easing.outCubic);
    }
    state.player = { r: nr, c: nc };
    tween(playerMesh.position, { x: playerXY.x, y: playerXY.y }, 150, Easing.outCubic, () => {
      moving = false;
      moves++;
      movesEl.textContent = moves;
      checkWin();
    });
  }

  function checkWin() {
    const allOnTarget = [...state.targets].every((t) => state.boxes.has(t)) && state.boxes.size === state.targets.size;
    if (allOnTarget) {
      finished = true;
      const stars = starsForMoves(level.moveStars, moves);
      api.ui.burstFromElement(canvasHost);
      setTimeout(() => api.win(stars, { moves }), 250);
    }
  }

  function onKey(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  }
  window.addEventListener('keydown', onKey);
  wrap.querySelectorAll('.sk-dbtn').forEach((btn) => btn.addEventListener('click', () => move(btn.dataset.dir)));

  function stateKey(player, boxes) { return player.r + ',' + player.c + '|' + [...boxes].sort().join(';'); }
  function isWin(st) { return [...state.targets].every((t) => st.boxes.has(t)) && st.boxes.size === state.targets.size; }

  function solveFromHere() {
    const DIRS = [['up', -1, 0], ['down', 1, 0], ['left', 0, -1], ['right', 0, 1]];
    const startState = { player: { ...state.player }, boxes: new Set(state.boxes) };
    const visited = new Set([stateKey(startState.player, startState.boxes)]);
    const queue = [{ st: startState, path: [] }];
    let iterations = 0;
    while (queue.length && iterations < 200000) {
      iterations++;
      const { st: cur, path } = queue.shift();
      if (isWin(cur)) return path;
      for (const [dir, dr, dc] of DIRS) {
        const nr = cur.player.r + dr, nc = cur.player.c + dc, nKey = nr + ',' + nc;
        if (state.walls.has(nKey)) continue;
        let boxes = cur.boxes;
        if (cur.boxes.has(nKey)) {
          const br = nr + dr, bc = nc + dc, bKey = br + ',' + bc;
          if (state.walls.has(bKey) || cur.boxes.has(bKey)) continue;
          boxes = new Set(cur.boxes);
          boxes.delete(nKey);
          boxes.add(bKey);
        }
        const nextPlayer = { r: nr, c: nc };
        const key = stateKey(nextPlayer, boxes);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push({ st: { player: nextPlayer, boxes }, path: [...path, dir] });
      }
    }
    return null;
  }

  function hint() {
    if (finished || moving) return;
    const path = solveFromHere();
    if (!path || !path.length) { api.ui.toast(`${api.playerName}, try undoing a push - that route's blocked!`); return; }
    const dir = path[0];
    const arrow = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' }[dir];
    tween(playerMesh.scale, { x: 1.4, y: 1.4, z: 1.4 }, 160, Easing.outBack, () => tween(playerMesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try heading ${dir}! ${arrow}`);
  }

  return {
    unmount: () => { window.removeEventListener('keydown', onKey); stage.dispose(); wrap.remove(); },
    hint,
  };
}

PC.Games.register('sokoban', { mount });
