/**
 * Game 41 - Traffic Jam (3D). A 6x6 parking lot full of cars and trucks.
 * Drag each vehicle along its own direction (cars only go forward and
 * back) to clear a path so the red car can drive out of the exit on the
 * right edge. Every embedded layout was verified solvable with the BFS
 * solver below; the stored number is its optimal move count.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

// 36-char layouts, read row by row: 'o' = empty, 'A' = red car (row 3),
// any other letter = one vehicle. [layout, optimal moves]
const LEVELS = {
  easy: [
    ['KKGGJoHHHoJCooAAoCBDFMICBDFMIoLLFEEE', 5],
    ['oCCIIIooooDGooAADGEoooHHEoooFFEoBBBo', 5],
    ['oFFoCoJHHoCGJoAACGEEoooGIoBBBoIooDDo', 5],
    ['oKKIGGFFHIBoAAHoBoooooEEoDDJJooLLCCC', 7],
    ['oEEIIooJJJHooAAoHBFooDCBFGGDCooooooo', 5],
    ['LLBBooNoGGKKNAAoIDJHCCIDJHFEEooHFMMo', 7],
    ['DFFFIoDoCoIKAACBoKHHoBEEooGGoooooJJo', 5],
    ['IGGGLLIoBBBHFAAoDHFoJJDKFEEEoKoMMCCo', 7],
  ],
  medium: [
    ['oGGoNNLJJCCHLoAAEHKKKFEHDIIFMMDBBBoo', 13],
    ['oHHoEoooooEGCAABEGCFFBoGCoIBDDooIJJo', 13],
    ['GGGEJoBBoEJooAAEJIHoDCCIHoDFFFoooooo', 14],
    ['LLGGoDJJooHDFAAKHDFBBKHoFoEIooooEICC', 13],
    ['NNoEEBHHIIIBooAAMoLJCCMDLJKFFDooKoGG', 16],
    ['oooooooHHHEooGAAEIFGBoEIFGBCCoDDDooo', 14],
    ['GFFKIoGoBKIJAABooJooDDDoEEEoHooCCCHo', 15],
    ['ooIGooooIGoDAAIoJDCEEoJBCHHFoBoooFoo', 15],
  ],
  hard: [
    ['BBBLLoNNJJJoAACooDKoCIEDKGGIEHoMMFFH', 24],
    ['NLLoGGNEEDooAAKDoooIKMMJCIBBHJCFFoHo', 22],
    ['oGGGCoooEBCoAAEBCoFoJJJIFHHDoIKKoDoI', 22],
    ['ooGGGooooBBIAAoHoIooDHoICoDFEECooFoo', 22],
    ['oJJJKGooLLKGAAooEoooDoEoICDHHFICoBBF', 22],
    ['BooFFHBoJoDHAAJLDHoooLIIGGGECooKKECo', 24],
  ],
};

const N = 6;
const CELL = 1;
const EXIT_ROW = 2;
const RED = 0xff3b5c;
const CAR_COLORS = [0xff9f43, 0xffd93d, 0x23d18b, 0x17c3b2, 0x3f8efc, 0xa259ff];
const TRUCK_COLORS = [0x3f8efc, 0xa259ff, 0x17c3b2, 0xff9f43];

function parseLevel(s) {
  const byId = {};
  for (let i = 0; i < N * N; i++) {
    const ch = s[i];
    if (ch === 'o') continue;
    const r = Math.floor(i / N), c = i % N;
    if (!byId[ch]) byId[ch] = { id: ch, r, c, len: 0, h: false };
    const car = byId[ch];
    car.len++;
    if (r === car.r && c !== car.c) car.h = true;
  }
  const list = Object.values(byId);
  list.sort((a, b) => (a.id === 'A' ? -1 : b.id === 'A' ? 1 : a.id < b.id ? -1 : 1));
  return list;
}

// Positions: for horizontal cars the column of the left end, for vertical
// cars the row of the top end. Returns the list of moves [carIndex, newPos]
// along a shortest solution, or null when unsolvable.
function solveBFS(cars, startPos) {
  const n = cars.length;
  const fixed = cars.map((k) => (k.h ? k.r : k.c));
  const key = (p) => p.join(',');
  const parent = new Map();
  parent.set(key(startPos), null);
  let queue = [startPos];
  let goal = null;
  while (queue.length && !goal) {
    const next = [];
    for (const p of queue) {
      if (p[0] === N - 2) { goal = p; break; }
      const g = new Uint8Array(N * N);
      for (let i = 0; i < n; i++) {
        const k = cars[i];
        for (let j = 0; j < k.len; j++) {
          if (k.h) g[fixed[i] * N + p[i] + j] = 1; else g[(p[i] + j) * N + fixed[i]] = 1;
        }
      }
      for (let i = 0; i < n; i++) {
        const k = cars[i];
        const cell = (x) => (k.h ? fixed[i] * N + x : x * N + fixed[i]);
        const tryPos = (np0) => {
          const np = p.slice(); np[i] = np0;
          const kk = key(np);
          if (!parent.has(kk)) { parent.set(kk, { prev: p, move: [i, np0] }); next.push(np); }
        };
        for (let x = p[i] - 1; x >= 0 && !g[cell(x)]; x--) tryPos(x);
        for (let x = p[i] + k.len; x < N && !g[cell(x)]; x++) tryPos(x - k.len + 1);
      }
    }
    queue = next;
  }
  if (!goal) return null;
  const moves = [];
  let cur = goal;
  for (;;) {
    const info = parent.get(key(cur));
    if (!info) break;
    moves.unshift(info.move);
    cur = info.prev;
  }
  return moves;
}

function fitView(host, w, h, bottomPx) {
  const cw = host.clientWidth || 360, ch = host.clientHeight || 640;
  const aspect = cw / ch || 0.5;
  const usable = Math.max(0.6, (ch - bottomPx) / ch);
  const halfH = Math.max((h * 1.08) / (2 * usable), (w * 1.08) / (2 * aspect));
  return { halfH, shiftY: halfH * (1 - usable) };
}

function mount(container, difficulty, api) {
  const tier = LEVELS[difficulty] ? difficulty : 'easy';
  const [layout, optimal] = LEVELS[tier][Math.floor(Math.random() * LEVELS[tier].length)];
  const cars = parseLevel(layout);
  const pos = cars.map((k) => (k.h ? k.c : k.r));
  let moves = 0, finished = false, busy = false, tapTipShown = false;
  const timeouts = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };
  const cancels = [];

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="rh-meta"><span>Moves: <span class="rh-moves">0</span></span><span>Best: ${optimal}</span></div>
    <div class="pc-canvas3d rh-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Drag cars to free the red car</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.rh-canvas');
  const movesEl = wrap.querySelector('.rh-moves');

  const VIEW_W = N * CELL + 1.6, VIEW_H = N * CELL + 0.9;
  const fit0 = fitView(canvasHost, VIEW_W, VIEW_H, 44);
  const stage = createStage(canvasHost, { distance: fit0.halfH / 0.42 });
  const baseHalfH = fit0.halfH;
  function refit() {
    const f = fitView(canvasHost, VIEW_W, VIEW_H, 44);
    stage.camera.zoom = baseHalfH / f.halfH;
    stage.camera.updateProjectionMatrix();
    stage.world.position.y = f.shiftY;
  }
  refit();
  const ro = new ResizeObserver(refit);
  ro.observe(canvasHost);

  const half = (N - 1) / 2;
  const colX = (c) => (c - half) * CELL;
  const rowY = (r) => (half - r) * CELL;

  // lot: base, cell markings, frame with an exit gap on the right of row 3
  const base = makeTile({ w: N * CELL + 0.5, h: N * CELL + 0.5, depth: 0.2, radius: 0.3, color: 0x24123f, roughness: 0.7 });
  base.position.set(0, 0, -0.32);
  stage.world.add(base);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const slot = makeTile({ w: 0.94, h: 0.94, depth: 0.05, radius: 0.12, color: 0x3a2266, roughness: 0.8 });
    slot.position.set(colX(c), rowY(r), -0.2);
    slot.castShadow = false;
    stage.world.add(slot);
  }
  const frameColor = 0x5b3aa8;
  const edge = N * CELL / 2 + 0.2;
  const frames = [
    { w: N * CELL + 0.7, h: 0.22, x: 0, y: edge },
    { w: N * CELL + 0.7, h: 0.22, x: 0, y: -edge },
    { w: 0.22, h: N * CELL + 0.7, x: -edge, y: 0 },
  ];
  // right side split around the exit row
  const exitTop = rowY(EXIT_ROW) + 0.5, exitBottom = rowY(EXIT_ROW) - 0.5;
  const topLen = (edge + 0.12) - exitTop, bottomLen = exitBottom + (edge + 0.12);
  frames.push({ w: 0.22, h: topLen, x: edge, y: exitTop + topLen / 2 });
  frames.push({ w: 0.22, h: bottomLen, x: edge, y: exitBottom - bottomLen / 2 });
  frames.forEach((f) => {
    const m = makeTile({ w: f.w, h: f.h, depth: 0.4, radius: 0.1, color: frameColor });
    m.position.set(f.x, f.y, 0);
    stage.world.add(m);
  });
  const exitPad = makeTile({ w: 0.62, h: 0.9, depth: 0.08, radius: 0.12, color: 0x23d18b, emissive: 0x23d18b, emissiveIntensity: 0.9 });
  exitPad.position.set(edge + 0.3, rowY(EXIT_ROW), -0.18);
  stage.world.add(exitPad);
  applyLabel(exitPad, '➜', { size: 128, color: '#ffffff', w: 0.6, h: 0.6 });
  let pulseT = 0;
  const unsubPulse = stage.onTick(() => {
    pulseT += 0.05;
    exitPad.material.emissiveIntensity = 0.6 + Math.sin(pulseT) * 0.35;
  });

  // vehicles
  const meshes = [];
  let ci = 0, ti = 0;
  cars.forEach((car, i) => {
    const isRed = car.id === 'A';
    const color = isRed ? RED : car.len === 3 ? TRUCK_COLORS[ti++ % TRUCK_COLORS.length] : CAR_COLORS[ci++ % CAR_COLORS.length];
    const long = car.len * CELL - 0.14;
    const w = car.h ? long : 0.82, h = car.h ? 0.82 : long;
    const mesh = makeTile({ w, h, depth: 0.34, radius: 0.22, color, emissive: color, emissiveIntensity: isRed ? 0.25 : 0 });
    const roofColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.22);
    const roof = makeTile({ w: car.h ? long * 0.48 : 0.56, h: car.h ? 0.56 : long * 0.48, depth: 0.14, radius: 0.14, color: roofColor });
    roof.position.z = 0.22;
    roof.userData.carIndex = i;
    mesh.add(roof);
    if (isRed) applyLabel(roof, '★', { size: 128, color: '#ffffff', w: 0.42, h: 0.42 });
    mesh.userData.carIndex = i;
    stage.world.add(mesh);
    meshes.push(mesh);
    placeMesh(i, pos[i]);
    popIn(mesh, { delay: 60 + i * 40 });
  });

  function centerFor(i, p) {
    const car = cars[i];
    if (car.h) return { x: colX(p + (car.len - 1) / 2), y: rowY(car.r) };
    return { x: colX(car.c), y: rowY(p + (car.len - 1) / 2) };
  }
  function placeMesh(i, p) {
    const { x, y } = centerFor(i, p);
    meshes[i].position.set(x, y, 0.08);
  }

  function occupancy(skip) {
    const g = new Uint8Array(N * N);
    cars.forEach((k, i) => {
      if (i === skip) return;
      for (let j = 0; j < k.len; j++) {
        if (k.h) g[k.r * N + pos[i] + j] = 1; else g[(pos[i] + j) * N + k.c] = 1;
      }
    });
    return g;
  }
  function range(i) {
    const k = cars[i];
    const g = occupancy(i);
    const cell = (x) => (k.h ? k.r * N + x : x * N + k.c);
    let lo = pos[i], hi = pos[i];
    while (lo - 1 >= 0 && !g[cell(lo - 1)]) lo--;
    while (hi + k.len < N && !g[cell(hi + k.len)]) hi++;
    return { lo, hi };
  }

  // drag
  let drag = null;
  const canvas = stage.renderer.domElement;
  function carIndexFromHit(hit) {
    let o = hit && hit.object;
    while (o && o.userData.carIndex === undefined) o = o.parent;
    return o ? o.userData.carIndex : -1;
  }
  function onPointerDown(e) {
    if (finished || busy || drag) return;
    const hit = stage.pick(e.clientX, e.clientY, meshes);
    const i = carIndexFromHit(hit);
    if (i < 0) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0.2);
    if (!p) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const { lo, hi } = range(i);
    drag = { i, id: e.pointerId, start: pos[i], cur: pos[i], lo, hi, sx: p.x, sy: p.y, moved: false };
    meshes[i].position.z = 0.22;
    api.sound.click();
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0.2);
    if (!p) return;
    const car = cars[drag.i];
    const delta = car.h ? (p.x - drag.sx) / CELL : -(p.y - drag.sy) / CELL;
    if (Math.abs(delta) > 0.15) drag.moved = true;
    drag.cur = Math.max(drag.lo, Math.min(drag.hi, drag.start + delta));
    const { x, y } = centerFor(drag.i, drag.cur);
    meshes[drag.i].position.x = x;
    meshes[drag.i].position.y = y;
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const snap = Math.round(d.cur);
    const i = d.i;
    const target = centerFor(i, snap);
    busy = true;
    cancels.push(tween(meshes[i].position, { x: target.x, y: target.y, z: 0.08 }, 140, Easing.outCubic, () => { busy = false; afterMove(); }));
    if (snap !== d.start) {
      pos[i] = snap;
      moves++;
      movesEl.textContent = moves;
      api.sound.move();
    } else if (d.lo === d.hi) {
      api.sound.error();
      api.ui.shake(canvasHost);
      api.ui.toast('That one is boxed in - move something else first.');
    } else if (!d.moved && !tapTipShown) {
      tapTipShown = true;
      api.ui.toast(cars[i].h ? 'Press and drag it left or right.' : 'Press and drag it up or down.');
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function afterMove() {
    if (finished || pos[0] !== N - 2) return;
    finished = true;
    api.sound.match ? api.sound.match() : api.sound.click();
    const red = meshes[0];
    tween(red.material, { emissiveIntensity: 1.1 }, 200, Easing.outCubic);
    cancels.push(tween(red.position, { x: colX(N + 2) }, 650, (t) => t * t));
    later(() => {
      api.ui.burstFromElement(canvasHost);
      const stars = moves <= optimal + 2 ? 3 : moves <= Math.ceil(optimal * 1.5) + 5 ? 2 : 1;
      api.win(stars, { moves, best: optimal });
    }, 520);
  }

  let lastHint = null;
  function toClient(x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    stage.world.localToWorld(v);
    v.project(stage.camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  let ghost = null;
  function clearGhost() {
    if (!ghost) return;
    stage.world.remove(ghost);
    ghost.geometry.dispose(); ghost.material.dispose();
    ghost = null;
  }
  function hint() {
    if (finished || busy || drag) return;
    let path = null;
    try { path = solveBFS(cars, pos.slice()); } catch (err) { path = null; }
    if (!path || !path.length) { api.ui.toast(`${api.playerName}, slide the cars blocking the red car out of its row.`); return; }
    const [i, to] = path[0];
    lastHint = { from: toClient(centerFor(i, pos[i]).x, centerFor(i, pos[i]).y, 0.2), to: toClient(centerFor(i, to).x, centerFor(i, to).y, 0.2), remaining: path.length };
    const car = cars[i];
    const dir = car.h ? (to > pos[i] ? 'right' : 'left') : (to > pos[i] ? 'down' : 'up');
    const steps = Math.abs(to - pos[i]);
    const m = meshes[i];
    const restE = i === 0 ? 0.25 : 0;
    tween(m.material, { emissiveIntensity: 0.9 }, 180, Easing.outCubic, () => tween(m.material, { emissiveIntensity: restE }, 900, Easing.inOutQuad));
    tween(m.scale, { x: 1.12, y: 1.12, z: 1.12 }, 180, Easing.outBack, () => tween(m.scale, { x: 1, y: 1, z: 1 }, 260, Easing.outCubic));
    clearGhost();
    const long = car.len * CELL - 0.14;
    ghost = makeTile({ w: car.h ? long : 0.82, h: car.h ? 0.82 : long, depth: 0.1, radius: 0.22, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, opacity: 0.35 });
    ghost.castShadow = false;
    const g = centerFor(i, to);
    ghost.position.set(g.x, g.y, -0.05);
    stage.world.add(ghost);
    later(clearGhost, 1600);
    api.ui.toast(`${api.playerName}, slide the glowing ${car.len === 3 ? 'truck' : 'car'} ${dir} ${steps} space${steps > 1 ? 's' : ''}.`);
  }

  return {
    unmount: () => {
      finished = true;
      cancels.forEach((c) => c());
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      unsubPulse();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
    debug: () => ({ moves, finished, lastHint }),
  };
}

PC.Games.register('rushhour', { mount });
