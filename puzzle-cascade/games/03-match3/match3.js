/**
 * Game 3 - Color Match-3 (3D). Gem meshes (octahedra) on a tilted board;
 * swap adjacent gems to make lines of 3+, cascades fall and refill.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 6, types: 5, moves: 18, target: 500 },
  medium: { size: 7, types: 6, moves: 20, target: 850 },
  hard: { size: 8, types: 6, moves: 22, target: 1250 },
};
const SPACING = 1.0;
const GEM_RADIUS = 0.4;

function idx(r, c, size) { return r * size + c; }
function randomGem(types) { return Math.floor(Math.random() * types); }

function makeBoard(size, types) {
  const board = new Array(size * size);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    let g;
    do { g = randomGem(types); } while (
      (c >= 2 && board[idx(r, c - 1, size)] === g && board[idx(r, c - 2, size)] === g) ||
      (r >= 2 && board[idx(r - 1, c, size)] === g && board[idx(r - 2, c, size)] === g)
    );
    board[idx(r, c, size)] = g;
  }
  return board;
}

function findMatches(board, size) {
  const matched = new Set();
  for (let r = 0; r < size; r++) {
    let run = [idx(r, 0, size)];
    for (let c = 1; c <= size; c++) {
      const cur = c < size ? board[idx(r, c, size)] : Symbol();
      const prev = board[run[run.length - 1]];
      if (c < size && cur === prev) run.push(idx(r, c, size));
      else { if (run.length >= 3) run.forEach((i) => matched.add(i)); run = [idx(r, c, size)]; }
    }
  }
  for (let c = 0; c < size; c++) {
    let run = [idx(0, c, size)];
    for (let r = 1; r <= size; r++) {
      const cur = r < size ? board[idx(r, c, size)] : Symbol();
      const prev = board[run[run.length - 1]];
      if (r < size && cur === prev) run.push(idx(r, c, size));
      else { if (run.length >= 3) run.forEach((i) => matched.add(i)); run = [idx(r, c, size)]; }
    }
  }
  return matched;
}

function isAdjacent(a, b, size) {
  const ar = Math.floor(a / size), ac = a % size, br = Math.floor(b / size), bc = b % size;
  return (Math.abs(ar - br) === 1 && ac === bc) || (Math.abs(ac - bc) === 1 && ar === br);
}

function hasAnyMove(board, size) {
  for (let i = 0; i < board.length; i++) {
    const r = Math.floor(i / size), c = i % size;
    const neighbors = [];
    if (c < size - 1) neighbors.push(i + 1);
    if (r < size - 1) neighbors.push(i + size);
    for (const n of neighbors) {
      const copy = board.slice();
      [copy[i], copy[n]] = [copy[n], copy[i]];
      if (findMatches(copy, size).size > 0) return true;
    }
  }
  return false;
}

function starsForScore(score, target) {
  if (score >= target * 1.3) return 3;
  if (score >= target) return 2;
  return 1;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  let board = makeBoard(size, cfg.types);
  let movesLeft = cfg.moves, score = 0, selected = null, busy = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="m3-meta">
      <span>Score: <span id="m3-score">0</span> / ${cfg.target}</span>
      <span>Moves: <span id="m3-moves">${movesLeft}</span></span>
    </div>
    <div class="pc-canvas3d" id="m3-canvas"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#m3-canvas');
  const scoreEl = wrap.querySelector('#m3-score');
  const movesEl = wrap.querySelector('#m3-moves');

  const stage = createStage(canvasHost, { distance: size * 2.1 });
  const half = (size - 1) / 2;
  function cellXY(i) { const r = Math.floor(i / size), c = i % size; return { x: (c - half) * SPACING, y: (half - r) * SPACING }; }

  const gemGeo = new THREE.OctahedronGeometry(GEM_RADIUS, 0);
  function makeGem(type) {
    const mat = new THREE.MeshStandardMaterial({ color: PALETTE[type], metalness: 0.35, roughness: 0.2, emissive: PALETTE[type], emissiveIntensity: 0.12 });
    const mesh = new THREE.Mesh(gemGeo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.rotation.y = Math.random() * Math.PI;
    return mesh;
  }

  let meshAt = board.map((type, i) => {
    const { x, y } = cellXY(i);
    const mesh = makeGem(type);
    mesh.position.set(x, y, 0);
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 6, scale: 1 });
    return mesh;
  });

  stage.onTick(() => { meshAt.forEach((m) => { if (m) m.rotation.y += 0.006; }); });

  function meshList() { return meshAt.filter(Boolean); }

  function setSelected(i, on) {
    const m = meshAt[i];
    if (!m) return;
    tween(m.scale, on ? { x: 1.25, y: 1.25, z: 1.25 } : { x: 1, y: 1, z: 1 }, 120, Easing.outBack);
  }

  function onPointerDown(e) {
    if (busy) return;
    const hit = stage.pick(e.clientX, e.clientY, meshList());
    if (!hit) return;
    const i = meshAt.indexOf(hit.object);
    onClick(i);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function onClick(i) {
    api.sound.click();
    if (selected === null) { selected = i; setSelected(i, true); return; }
    if (selected === i) { setSelected(i, false); selected = null; return; }
    if (!isAdjacent(selected, i, size)) { setSelected(selected, false); selected = i; setSelected(i, true); return; }
    const a = selected, b = i;
    setSelected(a, false);
    selected = null;
    attemptSwap(a, b);
  }

  function attemptSwap(a, b) {
    const copy = board.slice();
    [copy[a], copy[b]] = [copy[b], copy[a]];
    const matches = findMatches(copy, size);
    busy = true;
    const posA = cellXY(a), posB = cellXY(b);
    const meshA = meshAt[a], meshB = meshAt[b];
    tween(meshA.position, { x: posB.x, y: posB.y }, 160, Easing.outCubic);
    tween(meshB.position, { x: posA.x, y: posA.y }, 160, Easing.outCubic, () => {
      if (matches.size === 0) {
        api.sound.error();
        api.ui.shake(canvasHost);
        tween(meshA.position, { x: posA.x, y: posA.y }, 160, Easing.outCubic);
        tween(meshB.position, { x: posB.x, y: posB.y }, 160, Easing.outCubic, () => { busy = false; });
        return;
      }
      board = copy;
      [meshAt[a], meshAt[b]] = [meshAt[b], meshAt[a]];
      movesLeft--;
      movesEl.textContent = movesLeft;
      resolveCascades(1);
    });
  }

  function resolveCascades(multiplier) {
    const matches = findMatches(board, size);
    if (matches.size === 0) { busy = false; checkEnd(); return; }
    score += matches.size * 10 * multiplier;
    scoreEl.textContent = score;
    api.sound.match();
    if (matches.size >= 4) api.ui.burstFromElement(canvasHost, { count: 16 });

    let pending = matches.size;
    matches.forEach((i) => {
      const m = meshAt[i];
      tween(m.scale, { x: 0.01, y: 0.01, z: 0.01 }, 200, Easing.inOutQuad, () => {
        stage.world.remove(m);
        board[i] = null;
        meshAt[i] = null;
        pending--;
        if (pending === 0) setTimeout(() => collapseAndRefill(multiplier), 60);
      });
    });
  }

  function collapseAndRefill(multiplier) {
    for (let c = 0; c < size; c++) {
      let write = size - 1;
      for (let r = size - 1; r >= 0; r--) {
        const i = idx(r, c, size);
        if (board[i] !== null) {
          const wi = idx(write, c, size);
          if (wi !== i) {
            board[wi] = board[i]; meshAt[wi] = meshAt[i];
            board[i] = null; meshAt[i] = null;
            const target = cellXY(wi);
            tween(meshAt[wi].position, { x: target.x, y: target.y }, 220, Easing.outCubic);
          }
          write--;
        }
      }
      for (let r = write; r >= 0; r--) {
        const i = idx(r, c, size);
        const type = randomGem(cfg.types);
        board[i] = type;
        const mesh = makeGem(type);
        const target = cellXY(i);
        mesh.position.set(target.x, target.y + 4, 0.6);
        stage.world.add(mesh);
        tween(mesh.position, { x: target.x, y: target.y, z: 0 }, 320 + r * 40, Easing.outCubic);
        meshAt[i] = mesh;
      }
    }
    setTimeout(() => resolveCascades(multiplier + 1), 380);
  }

  function checkEnd() {
    if (score >= cfg.target) {
      const stars = starsForScore(score, cfg.target);
      setTimeout(() => api.win(stars, { score, movesLeft }), 200);
      return;
    }
    if (movesLeft <= 0) {
      api.ui.toast('Out of moves - try again!', { color: '#d6216b' });
      api.ui.shake(canvasHost);
      return;
    }
    if (!hasAnyMove(board, size)) {
      meshAt.forEach((m) => m && stage.world.remove(m));
      board = makeBoard(size, cfg.types);
      meshAt = board.map((type, i) => {
        const { x, y } = cellXY(i);
        const mesh = makeGem(type);
        mesh.position.set(x, y, 0);
        stage.world.add(mesh);
        popIn(mesh, { delay: i * 6 });
        return mesh;
      });
      api.ui.toast('Reshuffled - no moves left!');
    }
  }

  function hint() {
    if (busy) return;
    for (let i = 0; i < board.length; i++) {
      const r = Math.floor(i / size), c = i % size;
      const neighbors = [];
      if (c < size - 1) neighbors.push(i + 1);
      if (r < size - 1) neighbors.push(i + size);
      for (const n of neighbors) {
        const copy = board.slice();
        [copy[i], copy[n]] = [copy[n], copy[i]];
        if (findMatches(copy, size).size > 0) {
          [i, n].forEach((idx) => {
            const m = meshAt[idx];
            if (!m) return;
            tween(m.scale, { x: 1.35, y: 1.35, z: 1.35 }, 180, Easing.outBack, () => tween(m.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
          });
          api.ui.toast(`${api.playerName}, swap those two glowing gems!`);
          return;
        }
      }
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

PC.Games.register('match3', { mount });
