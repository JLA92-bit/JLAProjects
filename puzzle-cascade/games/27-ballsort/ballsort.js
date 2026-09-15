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

// Random legal pours starting from a solved board can never mix two
// colors in one tube (a pour only lands on an empty tube or one whose top
// already matches) - that would just reshuffle whole colors between
// tubes and never produce a real puzzle. Instead deal the balls out
// directly, then verify the result is solvable with a bounded BFS before
// accepting it.
function isSolvable(tubes, capacity, maxStates) {
  const startKey = JSON.stringify(tubes);
  const visited = new Set([startKey]);
  let frontier = [tubes];
  let states = 0;
  while (frontier.length && states < maxStates) {
    const next = [];
    for (const t of frontier) {
      if (isSolved(t)) return true;
      for (let s = 0; s < t.length; s++) {
        if (!t[s].length) continue;
        for (let d = 0; d < t.length; d++) {
          if (!canPour(t, capacity, s, d)) continue;
          const clone = t.map((tube) => tube.slice());
          pourMove(clone, capacity, s, d);
          const key = JSON.stringify(clone);
          if (visited.has(key)) continue;
          visited.add(key);
          next.push(clone);
          states++;
          if (states >= maxStates) break;
        }
        if (states >= maxStates) break;
      }
      if (states >= maxStates) break;
    }
    frontier = next;
  }
  return false;
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

function generatePuzzle(colors, capacity, extraEmpty) {
  const maxStates = colors * capacity <= 20 ? 20000 : 9000;
  let fallback = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const tubes = dealRandom(colors, capacity, extraEmpty);
    if (isSolved(tubes)) continue;
    if (!fallback) fallback = tubes;
    if (isSolvable(tubes.map((t) => t.slice()), capacity, maxStates)) return tubes;
  }
  return fallback || dealRandom(colors, capacity, extraEmpty);
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const tubes = generatePuzzle(cfg.colors, cfg.capacity, cfg.extraEmpty);
  const tubesTotal = tubes.length;
  const cols = Math.ceil(tubesTotal / 2);
  const capacity = cfg.capacity;
  let selected = null;
  let finished = false, moves = 0, busy = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bl-meta">Pours: <span id="bl-moves">0</span></div>
    <div class="pc-canvas3d" id="bl-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a tube, then tap where to pour</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bl-canvas');
  const movesEl = wrap.querySelector('#bl-moves');

  const tubeHeight = capacity * BALL_SPACING + 0.6;
  const totalW = cols * TUBE_SPACING;
  const totalH = 2 * (tubeHeight + ROW_GAP);
  const aspectMin = 0.46;
  const distance = Math.max((totalW / 2 + 0.4) / (0.42 * aspectMin), (totalH / 2 + 0.4) / 0.42) * 1.05;
  const stage = createStage(canvasHost, { distance });

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
      setTimeout(() => api.win(stars, { moves }), 300);
      return true;
    }
    return false;
  }

  function doPour(src, dst) {
    busy = true;
    const count = pourMove(tubes, capacity, src, dst);
    if (count <= 0) { busy = false; return; }
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
        tween(ball.position, { y: localTarget.y }, 140, Easing.outBack, () => { if (i === srcTop.length - 1) { busy = false; checkWin(); } });
      });
    });
    if (srcTop.length === 0) busy = false;
  }

  function onPointerDown(e) {
    if (finished || busy) return;
    const hit = stage.pick(e.clientX, e.clientY, tubeBGs);
    if (!hit) return;
    const idx = hit.object.userData.tube;
    if (selected === null) {
      if (!tubes[idx].length) { api.sound.error(); return; }
      setSelected(idx);
      api.sound.click();
      return;
    }
    if (selected === idx) { setSelected(null); return; }
    if (canPour(tubes, capacity, selected, idx)) {
      const src = selected;
      setSelected(null);
      doPour(src, idx);
    } else {
      api.sound.error();
      api.ui.shake(canvasHost);
      setSelected(tubes[idx].length ? idx : null);
    }
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished || busy) return;
    // prefer a move that empties a tube or completes a color; else any legal, non-reversing move
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
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('ballsort', { mount });
