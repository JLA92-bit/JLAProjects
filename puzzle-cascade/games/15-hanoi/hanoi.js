/**
 * Game 15 - Tower of Hanoi (3D). Tap a peg to pick up its top disk, then
 * tap another peg to drop it there (only onto a bigger disk or empty peg).
 * Move the whole stack from the left peg to the right peg.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { disks: 3 },
  medium: { disks: 4 },
  hard: { disks: 5 },
};
const PEG_SPACING = 1.5;
const DISK_H = 0.3;
const PEG_H = 3.0;
const MIN_W = 0.42, MAX_W = 1.3;

function stateKey(pegs) { return pegs.map((p) => p.join('.')).join('|'); }

function legalMoves(pegs) {
  const moves = [];
  for (let from = 0; from < 3; from++) {
    if (!pegs[from].length) continue;
    const disk = pegs[from][pegs[from].length - 1];
    for (let to = 0; to < 3; to++) {
      if (to === from) continue;
      const top = pegs[to][pegs[to].length - 1];
      if (top === undefined || top > disk) moves.push([from, to]);
    }
  }
  return moves;
}

function applyMove(pegs, [from, to]) {
  const next = pegs.map((p) => p.slice());
  const disk = next[from].pop();
  next[to].push(disk);
  return next;
}

// BFS over the (small, <= 3^5 = 243) state space from the current position
// to the goal, so a hint is always correct no matter how the player deviated
// from the "classical" optimal sequence.
function solveNextMove(pegs, disks) {
  const goal = [[], [], Array.from({ length: disks }, (_, i) => disks - i)];
  const startKey = stateKey(pegs), goalKey = stateKey(goal);
  if (startKey === goalKey) return null;
  const visited = new Set([startKey]);
  const queue = [{ pegs, path: [] }];
  while (queue.length) {
    const { pegs: cur, path } = queue.shift();
    for (const move of legalMoves(cur)) {
      const next = applyMove(cur, move);
      const key = stateKey(next);
      if (visited.has(key)) continue;
      const newPath = [...path, move];
      if (key === goalKey) return newPath[0];
      visited.add(key);
      queue.push({ pegs: next, path: newPath });
    }
  }
  return null;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const disks = cfg.disks;
  let pegs = [Array.from({ length: disks }, (_, i) => disks - i), [], []];
  let selected = null; // peg index
  let moves = 0, finished = false, busy = false;
  const optimal = Math.pow(2, disks) - 1;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="hn-meta">Moves: <span id="hn-moves">0</span> &nbsp;•&nbsp; Best possible: ${optimal}</div>
    <div class="pc-canvas3d" id="hn-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a peg to pick up, tap another to drop</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#hn-canvas');
  const movesEl = wrap.querySelector('#hn-moves');

  const stage = createStage(canvasHost, { distance: 11 });

  const pegX = (i) => (i - 1) * PEG_SPACING;
  const baseZ = 0;

  const pegMeshes = [];
  const zoneMeshes = [];
  for (let i = 0; i < 3; i++) {
    const x = pegX(i);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x3f2a7c, roughness: 0.5 }));
    base.rotation.x = Math.PI / 2;
    base.position.set(x, 0, 0.1);
    base.receiveShadow = true;
    stage.world.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, PEG_H, 16), new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 1, metalness: 0 }));
    pole.position.set(x, 0, PEG_H / 2 + 0.2);
    pole.rotation.x = Math.PI / 2;
    pole.castShadow = true;
    stage.world.add(pole);
    pegMeshes.push(pole);
    // invisible wide tap zone covering the whole peg column
    const zone = new THREE.Mesh(new THREE.BoxGeometry(PEG_SPACING * 0.92, PEG_H + 0.6, 1.9), new THREE.MeshBasicMaterial({ visible: false }));
    zone.position.set(x, 0, PEG_H / 2);
    zone.userData = { peg: i };
    stage.world.add(zone);
    zoneMeshes.push(zone);
    popIn(base, { delay: i * 60 });
  }

  const diskMeshes = []; // diskMeshes[diskSize-1] = mesh
  function diskWidth(size) { return MIN_W + (size - 1) * ((MAX_W - MIN_W) / Math.max(1, disks - 1)); }
  function diskZ(peg, stackIndex) { return 0.2 + DISK_H / 2 + stackIndex * DISK_H; }

  for (let d = 1; d <= disks; d++) {
    const w = diskWidth(d);
    const mesh = makeTile({ w, h: w, depth: DISK_H * 0.9, radius: w / 2, color: PALETTE[d % PALETTE.length] });
    stage.world.add(mesh);
    diskMeshes[d] = mesh;
  }

  function layoutPegs(animate) {
    pegs.forEach((stack, pegIdx) => {
      stack.forEach((diskSize, i) => {
        const mesh = diskMeshes[diskSize];
        const target = { x: pegX(pegIdx), y: 0, z: diskZ(pegIdx, i) };
        if (animate) tween(mesh.position, target, 220, Easing.outCubic);
        else mesh.position.set(target.x, target.y, target.z);
      });
    });
  }
  layoutPegs(false);
  diskMeshes.forEach((m, i) => { if (m) popIn(m, { delay: i * 50 }); });

  function highlightPeg(pegIdx, on) {
    const pole = pegMeshes[pegIdx];
    tween(pole.scale, { x: on ? 1.3 : 1, y: on ? 1.3 : 1 }, 140, Easing.outBack);
    pole.material.emissive.set(on ? 0xffd93d : 0x000000);
    pole.material.emissiveIntensity = on ? 0.6 : 0;
  }

  function tryMove(from, to) {
    if (!pegs[from].length) return false;
    const disk = pegs[from][pegs[from].length - 1];
    const top = pegs[to][pegs[to].length - 1];
    if (top !== undefined && top < disk) return false;
    pegs[to].push(pegs[from].pop());
    return true;
  }

  function onPointerDown(e) {
    if (finished || busy) return;
    const hit = stage.pick(e.clientX, e.clientY, zoneMeshes);
    if (!hit) return;
    const pegIdx = hit.object.userData.peg;
    if (selected === null) {
      if (!pegs[pegIdx].length) { api.sound.error(); api.ui.shake(canvasHost); return; }
      selected = pegIdx;
      highlightPeg(pegIdx, true);
      api.sound.click();
      return;
    }
    if (selected === pegIdx) {
      highlightPeg(pegIdx, false);
      selected = null;
      return;
    }
    const ok = tryMove(selected, pegIdx);
    highlightPeg(selected, false);
    if (!ok) {
      api.sound.error();
      api.ui.shake(canvasHost);
      selected = null;
      return;
    }
    selected = null;
    moves++;
    movesEl.textContent = moves;
    api.sound.move();
    busy = true;
    layoutPegs(true);
    setTimeout(() => { busy = false; checkWin(); }, 240);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function checkWin() {
    if (pegs[2].length === disks) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const stars = moves <= optimal ? 3 : moves <= optimal * 1.5 ? 2 : 1;
      setTimeout(() => api.win(stars, { moves, optimal }), 250);
    }
  }

  function hint() {
    if (finished || busy) return;
    const move = solveNextMove(pegs, disks);
    if (!move) return;
    const [from, to] = move;
    highlightPeg(from, true);
    setTimeout(() => highlightPeg(from, false), 900);
    api.ui.toast(`${api.playerName}, move a disk from peg ${from + 1} to peg ${to + 1}!`);
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

PC.Games.register('hanoi', { mount });
