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

/* ---------- lifecycle + framing helpers (kept local so this file stays self-contained) ---------- */

// World half-height per unit of stage distance (matches three-stage.js).
const VIEW_SCALE = 0.42;

// Pick a camera distance that fits a board of the given world half-extents
// into the canvas's real aspect ratio, with a safety margin so a later
// resize (address bar, rotated phone, wrapped status text) never crops it.
function fitDistance(host, halfW, halfH, margin = 1.08) {
  const w = host.clientWidth || 340, h = host.clientHeight || 520;
  const aspect = Math.max(0.35, Math.min(2.2, w / h));
  return (Math.max(halfH, halfW / aspect) * margin) / VIEW_SCALE;
}

// Wraps a raw mount so nothing can call api.win/api.lose after unmount,
// hint() never throws, and (optionally) a lost round offers an in-place
// "Try again" button instead of leaving a dead board on screen.
function guardMount(rawMount, { retry = false } = {}) {
  return function mount(container, difficulty, api) {
    let cur = null;
    function start() {
      const inst = { alive: true };
      const safeApi = Object.assign({}, api, {
        win: (...args) => { if (inst.alive) { inst.alive = false; api.win(...args); } },
        lose: (msg) => {
          if (!inst.alive) return;
          inst.alive = false;
          api.lose(msg);
          if (retry) showRetry(inst);
        },
      });
      const res = rawMount(container, difficulty, safeApi);
      cur = {
        inst,
        el: container.lastElementChild,
        unmount: typeof res === 'function' ? res : (res && res.unmount) || (() => {}),
        hint: res && typeof res === 'object' ? res.hint : null,
      };
    }
    function stop() {
      if (!cur) return;
      const c = cur;
      cur = null;
      c.inst.alive = false;
      try { c.unmount(); } catch (e) { console.warn(e); }
    }
    function showRetry(inst) {
      if (!cur || cur.inst !== inst || !cur.el) return;
      const host = cur.el.querySelector('.pc-canvas3d') || cur.el;
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;left:0;right:0;bottom:56px;display:flex;justify-content:center;z-index:6;pointer-events:none;';
      box.innerHTML = '<button type="button" class="pc-btn pc-btn--green" style="pointer-events:auto;min-height:48px;">\u{1F501} Try again</button>';
      box.querySelector('button').addEventListener('click', () => {
        if (!cur || cur.inst !== inst) return;
        api.sound.click();
        stop();
        start();
      });
      host.appendChild(box);
    }
    start();
    return {
      unmount: () => stop(),
      hint: () => {
        if (!cur || !cur.hint) return;
        try { cur.hint(); } catch (e) { console.warn(e); }
      },
    };
  };
}

// setTimeout that is cancelled in bulk on unmount.
function makeTimers() {
  const ids = new Set();
  return {
    later(fn, ms) {
      const id = setTimeout(() => { ids.delete(id); fn(); }, ms);
      ids.add(id);
      return id;
    },
    clear() { ids.forEach(clearTimeout); ids.clear(); },
  };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const disks = cfg.disks;
  let pegs = [Array.from({ length: disks }, (_, i) => disks - i), [], []];
  let selected = null; // peg index
  let moves = 0, finished = false, busy = false;
  const timers = makeTimers();
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

  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, PEG_SPACING + MAX_W / 2 + 0.1, MAX_W / 2 + 0.3) });

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
    // invisible tap zone covering the whole peg column, top to bottom of
    // the canvas, so a tap anywhere near a peg counts
    const zone = new THREE.Mesh(new THREE.BoxGeometry(i === 1 ? PEG_SPACING : PEG_SPACING * 2, 60, 1.9), new THREE.MeshBasicMaterial({ visible: false }));
    zone.position.set(i === 0 ? x - PEG_SPACING / 2 : i === 2 ? x + PEG_SPACING / 2 : x, 0, PEG_H / 2);
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
    // make the disk you're holding glow too, so it's obvious what moves
    const stack = pegs[pegIdx];
    const top = stack.length ? diskMeshes[stack[stack.length - 1]] : null;
    if (top) {
      top.material.emissive.set(on ? 0xffffff : 0x000000);
      top.material.emissiveIntensity = on ? 0.35 : 0;
      tween(top.scale, { x: on ? 1.1 : 1, y: on ? 1.1 : 1 }, 140, Easing.outBack);
    }
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
      api.sound.click();
      return;
    }
    highlightPeg(selected, false);
    const ok = tryMove(selected, pegIdx);
    if (!ok) {
      api.sound.error();
      api.ui.shake(canvasHost);
      api.ui.toast('A bigger disk can\'t go on a smaller one!');
      selected = null;
      return;
    }
    selected = null;
    moves++;
    movesEl.textContent = moves;
    api.sound.move();
    busy = true;
    layoutPegs(true);
    timers.later(() => { busy = false; checkWin(); }, 240);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function checkWin() {
    if (pegs[2].length === disks) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const stars = moves <= optimal ? 3 : moves <= optimal * 1.5 ? 2 : 1;
      timers.later(() => api.win(stars, { moves, optimal }), 250);
    }
  }

  function hint() {
    if (finished || busy) return;
    const move = solveNextMove(pegs, disks);
    if (!move) return;
    const [from, to] = move;
    if (selected !== null && selected !== from) { highlightPeg(selected, false); selected = null; }
    if (selected === null) {
      highlightPeg(from, true);
      timers.later(() => { if (selected !== from) highlightPeg(from, false); }, 900);
    }
    api.ui.toast(`${api.playerName}, move a disk from the ${['left', 'middle', 'right'][from]} peg to the ${['left', 'middle', 'right'][to]} peg!`);
  }

  return {
    unmount: () => {
      finished = true;
      timers.clear();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('hanoi', { mount: guardMount(mount) });
