/**
 * Game 27 - Ball Sort Puzzle (3D). Tap a tube to lift its top ball, tap
 * another tube to pour it in - only onto a matching color or an empty
 * tube. Sort every tube into a single color to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { colors: 4, capacity: 4, extraEmpty: 2 },
  medium: { colors: 5, capacity: 4, extraEmpty: 2 },
  hard: { colors: 6, capacity: 5, extraEmpty: 2 },
};
const BALL_SPACING = 0.6;
const TUBE_W = 0.82;
const TUBE_SPACING = 1.05;
const ROW_GAP = 0.6;

function canPour(tubes, capacity, src, dst) {
  if (src === dst) return false;
  const s = tubes[src], d = tubes[dst];
  if (!s.length) return false;
  if (d.length >= capacity) return false;
  if (d.length === 0) return true;
  return d[d.length - 1] === s[s.length - 1];
}

function pourMove(tubes, capacity, src, dst) {
  if (!canPour(tubes, capacity, src, dst)) return 0;
  const s = tubes[src], d = tubes[dst];
  const color = s[s.length - 1];
  let runLen = 0;
  for (let i = s.length - 1; i >= 0; i--) { if (s[i] === color) runLen++; else break; }
  const space = capacity - d.length;
  const moveCount = Math.min(runLen, space);
  for (let i = 0; i < moveCount; i++) d.push(s.pop());
  return moveCount;
}

function isSolved(tubes) {
  return tubes.every((t) => t.length === 0 || t.every((v) => v === t[0]));
}

// Depth-first solver with a visited set (tube order doesn't matter, so
// states are keyed by their sorted tubes). Returns the list of [src, dst]
// pours that solves the board, or null if none was found within maxStates.
// Used both to make sure every dealt puzzle is solvable and to give hints
// from whatever position the player is in.
function solve(tubes, capacity, maxStates = 40000) {
  const visited = new Set();
  const path = [];
  let states = 0;
  const keyOf = (t) => t.map((tube) => tube.join('')).sort().join('|');
  function uniform(t) { return t.length > 0 && t.every((v) => v === t[0]); }
  function dfs(t) {
    if (isSolved(t)) return true;
    if (++states > maxStates) return false;
    const k = keyOf(t);
    if (visited.has(k)) return false;
    visited.add(k);
    const moves = [];
    for (let s = 0; s < t.length; s++) {
      if (!t[s].length) continue;
      let emptyTried = false;
      for (let d = 0; d < t.length; d++) {
        if (!canPour(t, capacity, s, d)) continue;
        if (!t[d].length) {
          if (uniform(t[s]) || emptyTried) continue; // pointless or duplicate
          emptyTried = true;
        }
        // prefer stacking onto matching colors over using empty tubes
        moves.push({ s, d, score: t[d].length ? 1 : 0 });
      }
    }
    moves.sort((m1, m2) => m2.score - m1.score);
    for (const { s, d } of moves) {
      const clone = t.map((tube) => tube.slice());
      pourMove(clone, capacity, s, d);
      path.push([s, d]);
      if (dfs(clone)) return true;
      path.pop();
      if (states > maxStates) return false;
    }
    return false;
  }
  return dfs(tubes.map((tube) => tube.slice())) ? path.slice() : null;
}

function dealRandom(colors, capacity, extraEmpty) {
  const tubesTotal = colors + extraEmpty;
  const balls = [];
  for (let c = 0; c < colors; c++) for (let i = 0; i < capacity; i++) balls.push(c);
  for (let i = balls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [balls[i], balls[j]] = [balls[j], balls[i]]; }
  const tubes = Array.from({ length: tubesTotal }, () => []);
  balls.forEach((color, i) => { tubes[i % colors].push(color); });
  return tubes;
}

// Guaranteed-solvable fallback: scramble a solved board by undoing legal
// single-ball pours (each step can be redone forward one ball at a time).
function scrambleFromSolved(colors, capacity, extraEmpty) {
  const tubes = Array.from({ length: colors + extraEmpty }, (_, i) => (i < colors ? Array(capacity).fill(i) : []));
  for (let step = 0; step < colors * capacity * 6; step++) {
    const sources = tubes.map((t, i) => i).filter((i) => {
      const t = tubes[i];
      return t.length && (t.length === 1 || t[t.length - 2] === t[t.length - 1]);
    });
    const s = sources[Math.floor(Math.random() * sources.length)];
    const dests = tubes.map((t, i) => i).filter((i) => i !== s && tubes[i].length < capacity);
    if (s === undefined || !dests.length) continue;
    const d = dests[Math.floor(Math.random() * dests.length)];
    tubes[d].push(tubes[s].pop());
  }
  return tubes;
}

function generatePuzzle(colors, capacity, extraEmpty) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const tubes = dealRandom(colors, capacity, extraEmpty);
    if (isSolved(tubes)) continue;
    if (solve(tubes, capacity, 30000)) return tubes;
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const tubes = scrambleFromSolved(colors, capacity, extraEmpty);
    if (!isSolved(tubes) && solve(tubes, capacity, 30000)) return tubes;
  }
  return scrambleFromSolved(colors, capacity, extraEmpty);
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
  const tubes = generatePuzzle(cfg.colors, cfg.capacity, cfg.extraEmpty);
  const tubesTotal = tubes.length;
  const cols = Math.ceil(tubesTotal / 2);
  const capacity = cfg.capacity;
  let selected = null;
  let finished = false, moves = 0, busy = false;
  const history = []; // snapshots of tubes before each pour, for undo
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bl-meta">Pours: <span id="bl-moves">0</span></div>
    <div class="pc-canvas3d" id="bl-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a tube, then tap where to pour</span></div>
    </div>
    <div class="bl-actions">
      <button type="button" class="pc-btn pc-btn--ghost bl-btn" id="bl-undo" disabled>\u21A9\uFE0F Undo</button>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bl-canvas');
  const movesEl = wrap.querySelector('#bl-moves');
  const undoBtn = wrap.querySelector('#bl-undo');

  const tubeHeight = capacity * BALL_SPACING + 0.6;
  const totalW = cols * TUBE_SPACING;
  const totalH = 2 * (tubeHeight + ROW_GAP);
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, totalW / 2 + 0.05, totalH / 2 + 0.35) });

  function tubePos(idx) {
    const row = idx < cols ? 0 : 1;
    const col = idx < cols ? idx : idx - cols;
    const rowCount = row === 0 ? Math.min(cols, tubesTotal) : tubesTotal - cols;
    const rowWidth = rowCount * TUBE_SPACING;
    const x = -rowWidth / 2 + col * TUBE_SPACING + TUBE_SPACING / 2;
    const y = row === 0 ? (tubeHeight + ROW_GAP) / 2 : -(tubeHeight + ROW_GAP) / 2;
    return { x, y };
  }

  const tubeGroups = [];
  const tubeBGs = [];
  for (let i = 0; i < tubesTotal; i++) {
    const { x, y } = tubePos(i);
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    stage.world.add(group);
    const bg = makeTile({ w: TUBE_W, h: tubeHeight, depth: 0.1, radius: 0.22, color: 0x241a3d, roughness: 0.8, opacity: 0.9 });
    bg.position.z = -0.1;
    bg.userData = { tube: i };
    group.add(bg);
    tubeGroups.push(group);
    tubeBGs.push(bg);
    popIn(group, { delay: i * 40, duration: 220 });
  }

  const ballMeshes = tubes.map(() => []);
  function ballY(slotIdx) { return -tubeHeight / 2 + 0.4 + slotIdx * BALL_SPACING; }

  function rebuildBalls(idx) {
    ballMeshes[idx].forEach((m) => tubeGroups[idx].remove(m));
    ballMeshes[idx] = [];
    tubes[idx].forEach((colorIdx, slot) => {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 20), new THREE.MeshPhysicalMaterial({ color: PALETTE[colorIdx % PALETTE.length], roughness: 0.25, metalness: 0.2, clearcoat: 0.7 }));
      ball.position.set(0, ballY(slot), 0.05);
      ball.castShadow = true;
      tubeGroups[idx].add(ball);
      ballMeshes[idx].push(ball);
    });
  }
  tubes.forEach((_, idx) => rebuildBalls(idx));

  function setSelected(idx) {
    // drop the previously lifted ball back into place
    if (selected !== null && selected !== idx && ballMeshes[selected].length) {
      const prevTop = ballMeshes[selected][ballMeshes[selected].length - 1];
      tween(prevTop.position, { y: ballY(ballMeshes[selected].length - 1) }, 120, Easing.outCubic);
    }
    selected = idx;
    tubeBGs.forEach((bg, i) => {
      bg.material.emissive.set(i === idx ? 0xffd93d : 0x000000);
      bg.material.emissiveIntensity = i === idx ? 0.5 : 0;
    });
    if (idx !== null && ballMeshes[idx].length) {
      const top = ballMeshes[idx][ballMeshes[idx].length - 1];
      tween(top.position, { y: ballY(tubes[idx].length - 1) + 0.25 }, 140, Easing.outCubic);
    }
  }

  function checkWin() {
    if (isSolved(tubes)) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const idealMoves = cfg.colors * 2;
      const stars = moves <= idealMoves ? 3 : moves <= idealMoves * 1.8 ? 2 : 1;
      undoBtn.disabled = true;
      timers.later(() => api.win(stars, { moves }), 300);
      return true;
    }
    return false;
  }

  function doPour(src, dst) {
    busy = true;
    const snapshot = tubes.map((t) => t.slice());
    const count = pourMove(tubes, capacity, src, dst);
    if (count <= 0) { busy = false; return; }
    history.push(snapshot);
    undoBtn.disabled = false;
    moves++;
    movesEl.textContent = moves;
    api.sound.move();
    // rebuild dst balls (new ones appended) and animate src's departure balls flying over
    const srcTop = ballMeshes[src].splice(ballMeshes[src].length - count, count);
    srcTop.forEach((ball, i) => {
      const destSlot = tubes[dst].length - count + i;
      const worldFrom = tubeGroups[src].position;
      const worldTo = tubeGroups[dst].position;
      const localTarget = { x: 0, y: ballY(destSlot) };
      tubeGroups[dst].add(ball);
      // convert current world position to dst-local space for a smooth arc
      ball.position.x += worldFrom.x - worldTo.x;
      ball.position.y += worldFrom.y - worldTo.y;
      ballMeshes[dst].push(ball);
      tween(ball.position, { x: localTarget.x, y: localTarget.y + 0.5 }, 160, Easing.outCubic, () => {
        tween(ball.position, { y: localTarget.y }, 140, Easing.outBack, () => { if (i === srcTop.length - 1 && !finished) { busy = false; if (!checkWin()) checkStuck(); } });
      });
    });
    if (srcTop.length === 0) busy = false;
  }

  function anyLegalPour() {
    for (let s2 = 0; s2 < tubesTotal; s2++) for (let d = 0; d < tubesTotal; d++) if (canPour(tubes, capacity, s2, d)) return true;
    return false;
  }
  function checkStuck() {
    if (!anyLegalPour()) {
      api.sound.error();
      api.ui.toast('No pours left - tap Undo to back up and try another way.');
    }
  }

  // Nearest tube to the tap (anywhere over or just around it counts).
  function tubeAt(clientX, clientY) {
    const p = stage.pickPlane(clientX, clientY, 0);
    if (!p) return null;
    let best = null, bestD = Infinity;
    for (let i = 0; i < tubesTotal; i++) {
      const { x, y } = tubePos(i);
      const dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
      if (dx > TUBE_SPACING * 0.5 || dy > tubeHeight / 2 + ROW_GAP / 2) continue;
      const d = dx + dy * 0.1;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function onPointerDown(e) {
    if (finished || busy) return;
    const idx = tubeAt(e.clientX, e.clientY);
    if (idx === null) return;
    if (selected === null) {
      if (!tubes[idx].length) { api.sound.error(); api.ui.toast('That tube is empty - pick one with balls in it.'); return; }
      setSelected(idx);
      api.sound.click();
      return;
    }
    if (selected === idx) { setSelected(null); api.sound.click(); return; }
    if (canPour(tubes, capacity, selected, idx)) {
      const src = selected;
      setSelected(null);
      doPour(src, idx);
    } else {
      api.sound.error();
      api.ui.shake(canvasHost);
      api.ui.toast(tubes[idx].length >= capacity ? 'That tube is full.' : 'Balls only go on the same color or into an empty tube.');
      setSelected(null);
    }
  }

  function undo() {
    if (finished || busy) return;
    if (!history.length) { api.sound.error(); return; }
    setSelected(null);
    const prev = history.pop();
    prev.forEach((t, i) => { tubes[i] = t; rebuildBalls(i); });
    moves++; // undo still counts toward the pour total for stars
    movesEl.textContent = moves;
    undoBtn.disabled = history.length === 0;
    api.sound.click();
  }
  undoBtn.addEventListener('click', undo);
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished || busy) return;
    const plan = solve(tubes, capacity, 25000);
    if (plan && plan.length) {
      const [s0, d0] = plan[0];
      setSelected(s0);
      const bg0 = tubeBGs[d0];
      tween(bg0.scale, { x: 1.08, y: 1.08, z: 1.08 }, 180, Easing.outBack, () => tween(bg0.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
      bg0.material.emissive.set(0x23d18b);
      bg0.material.emissiveIntensity = 0.5;
      timers.later(() => { if (selected !== d0) { bg0.material.emissiveIntensity = 0; } }, 1400);
      api.ui.toast(`${api.playerName}, the lifted ball goes into the green tube!`);
      return;
    }
    if (!plan && history.length) {
      api.ui.toast(`${api.playerName}, this mix looks stuck - tap Undo a few times and try another way.`);
      undoBtn.classList.add('bl-btn--hint');
      timers.later(() => undoBtn.classList.remove('bl-btn--hint'), 1600);
      return;
    }
    // fallback: prefer a move that empties a tube or completes a color
    let best = null;
    for (let s = 0; s < tubesTotal; s++) {
      for (let d = 0; d < tubesTotal; d++) {
        if (!canPour(tubes, capacity, s, d)) continue;
        const srcColor = tubes[s][tubes[s].length - 1];
        const srcRun = tubes[s].filter((v) => v === srcColor).length === tubes[s].length;
        const completesColor = tubes[d].length + Math.min(tubes[s].length, capacity - tubes[d].length) === capacity && (tubes[d].length === 0 || tubes[d][0] === srcColor);
        const score = (srcRun ? 2 : 0) + (completesColor ? 3 : 0) + (tubes[d].length === 0 ? 1 : 0);
        if (!best || score > best.score) best = { s, d, score };
      }
    }
    if (!best) { api.ui.toast(`${api.playerName}, no legal pour is available!`); return; }
    setSelected(best.s);
    const bg = tubeBGs[best.d];
    tween(bg.scale, { x: 1.08, y: 1.08, z: 1.08 }, 180, Easing.outBack, () => tween(bg.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
    api.ui.toast(`${api.playerName}, pour into the glowing tube!`);
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

PC.Games.register('ballsort', { mount: guardMount(mount) });
