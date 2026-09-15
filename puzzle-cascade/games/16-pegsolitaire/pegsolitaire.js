/**
 * Game 16 - Peg Solitaire (3D). Tap a peg, then tap an empty hole two
 * spaces away in a straight line to jump over and remove the peg between.
 * Get down to as few pegs as possible.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CELL = 0.92;
const PEG_COLOR = 0xff4d8d;
const HOLE_COLOR = 0x1a0c30;
const SELECT_COLOR = 0xffd93d;

function diamondBoard(radius) {
  const cells = [];
  for (let r = -radius; r <= radius; r++) {
    for (let c = -radius; c <= radius; c++) {
      if (Math.abs(r) + Math.abs(c) <= radius) cells.push([r + radius, c + radius]);
    }
  }
  const size = radius * 2 + 1;
  return { cells, size };
}

function englishBoard() {
  const rows = [
    '..OOO..',
    '..OOO..',
    'OOOOOOO',
    'OOOOOOO',
    'OOOOOOO',
    '..OOO..',
    '..OOO..',
  ];
  const cells = [];
  rows.forEach((row, r) => { [...row].forEach((ch, c) => { if (ch === 'O') cells.push([r, c]); }); });
  return { cells, size: 7 };
}

const CONFIG = {
  easy: { board: () => diamondBoard(2) },     // 13 holes
  medium: { board: () => diamondBoard(3) },   // 25 holes
  hard: { board: () => englishBoard() },      // 33 holes
};

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function keyOf(r, c) { return `${r},${c}`; }

function findMoves(pegSet, validSet) {
  const moves = [];
  const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
  pegSet.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    dirs.forEach(([dr, dc]) => {
      const mr = r + dr / 2, mc = c + dc / 2;
      const tr = r + dr, tc = c + dc;
      const midKey = keyOf(mr, mc), toKey = keyOf(tr, tc);
      if (validSet.has(toKey) && pegSet.has(midKey) && !pegSet.has(toKey)) {
        moves.push({ from: [r, c], mid: [mr, mc], to: [tr, tc] });
      }
    });
  });
  return moves;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const { cells, size } = cfg.board();
  const validSet = new Set(cells.map(([r, c]) => keyOf(r, c)));
  // start with every hole filled except the center
  const centerIdx = Math.floor(cells.length / 2);
  const centerKey = keyOf(...cells[centerIdx]);
  let pegSet = new Set(cells.map(([r, c]) => keyOf(r, c)));
  pegSet.delete(centerKey);
  let selected = null;
  let moves = 0, finished = false, busy = false;
  const startPegs = pegSet.size;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ps-meta">Pegs left: <span id="ps-count">${startPegs}</span></div>
    <div class="pc-canvas3d" id="ps-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a peg, then jump it over another into an empty hole</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ps-canvas');
  const countEl = wrap.querySelector('#ps-count');

  const stage = createStage(canvasHost, { distance: size * 2.7 });

  const holeMeshes = new Map();
  const pegMeshes = new Map();

  cells.forEach(([r, c]) => {
    const { x, y } = cellXY(r, c, size);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 20), new THREE.MeshStandardMaterial({ color: HOLE_COLOR, roughness: 0.9 }));
    hole.rotation.x = Math.PI / 2;
    hole.position.set(x, y, -0.06);
    hole.userData = { r, c };
    stage.world.add(hole);
    holeMeshes.set(keyOf(r, c), hole);
    popIn(hole, { delay: (r + c) * 8 });

    if (pegSet.has(keyOf(r, c))) {
      const peg = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), new THREE.MeshStandardMaterial({ color: PEG_COLOR, roughness: 0.3, metalness: 0.15 }));
      peg.position.set(x, y, 0.32);
      peg.castShadow = true;
      peg.userData = { r, c };
      stage.world.add(peg);
      popIn(peg, { delay: (r + c) * 12 });
      pegMeshes.set(keyOf(r, c), peg);
    }
  });

  function removePeg(key) {
    const mesh = pegMeshes.get(key);
    if (!mesh) return;
    tween(mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 180, Easing.outCubic, () => {
      stage.world.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    pegMeshes.delete(key);
  }

  function movePeg(fromKey, toKey) {
    const mesh = pegMeshes.get(fromKey);
    pegMeshes.delete(fromKey);
    pegMeshes.set(toKey, mesh);
    const [r, c] = toKey.split(',').map(Number);
    const { x, y } = cellXY(r, c, size);
    tween(mesh.position, { x, y, z: 0.5 }, 200, Easing.outCubic, () => tween(mesh.position, { z: 0.32 }, 100, Easing.outCubic));
  }

  function setSelected(key) {
    if (selected) {
      const prevMesh = pegMeshes.get(selected);
      if (prevMesh) { prevMesh.material.emissive.set(0x000000); prevMesh.material.emissiveIntensity = 0; }
    }
    selected = key;
    if (selected) {
      const mesh = pegMeshes.get(selected);
      mesh.material.emissive.set(SELECT_COLOR);
      mesh.material.emissiveIntensity = 0.7;
    }
  }

  function onPointerDown(e) {
    if (finished || busy) return;
    const targets = [...holeMeshes.values(), ...pegMeshes.values()];
    const hit = stage.pick(e.clientX, e.clientY, targets);
    if (!hit) return;
    const { r, c } = hit.object.userData;
    const key = keyOf(r, c);
    const hasPeg = pegSet.has(key);
    if (hasPeg) {
      setSelected(key);
      api.sound.click();
      return;
    }
    if (!selected) return;
    // attempt jump from selected to this empty hole
    const [sr, sc] = selected.split(',').map(Number);
    const dr = r - sr, dc = c - sc;
    if (Math.abs(dr) + Math.abs(dc) !== 2 || (dr !== 0 && dc !== 0)) { api.sound.error(); api.ui.shake(canvasHost); return; }
    const midKey = keyOf(sr + dr / 2, sc + dc / 2);
    if (!pegSet.has(midKey)) { api.sound.error(); api.ui.shake(canvasHost); return; }
    // legal jump
    pegSet.delete(selected);
    pegSet.delete(midKey);
    pegSet.add(key);
    movePeg(selected, key);
    removePeg(midKey);
    setSelected(null);
    moves++;
    countEl.textContent = pegSet.size;
    api.sound.move();
    busy = true;
    setTimeout(() => { busy = false; checkEnd(); }, 260);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function checkEnd() {
    const remaining = findMoves(pegSet, validSet);
    if (remaining.length === 0) {
      finished = true;
      const left = pegSet.size;
      const stars = left <= 1 ? 3 : left <= 3 ? 2 : 1;
      api.ui.burstFromElement(canvasHost);
      setTimeout(() => api.win(stars, { pegsLeft: left, moves }), 300);
    }
  }

  function hint() {
    if (finished || busy) return;
    const options = findMoves(pegSet, validSet);
    if (!options.length) return;
    const move = options[Math.floor(Math.random() * options.length)];
    const fromMesh = pegMeshes.get(keyOf(...move.from));
    const toHole = holeMeshes.get(keyOf(...move.to));
    [fromMesh, toHole].forEach((m) => {
      if (!m) return;
      tween(m.scale, { x: 1.4, y: 1.4, z: 1.4 }, 180, Easing.outBack, () => tween(m.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    });
    api.ui.toast(`${api.playerName}, try jumping that glowing peg!`);
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

PC.Games.register('pegsolitaire', { mount });
