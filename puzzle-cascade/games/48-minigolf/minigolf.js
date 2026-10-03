/**
 * Game 48 - Mini Golf. Top-down putting course. Pull back anywhere on the
 * screen and let go to putt: the arrow shows direction and power. The ball
 * rolls with friction and bounces off walls, blocks and bumpers. Sink every
 * hole in as few strokes as you can; stars come from total strokes vs par.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, disposeObject } from '../../shared/js/three-stage.js';

const W = 2.6, H = 4.6; // half extents of the standard course box
const RECT = [[-W, -H], [W, -H], [W, H], [-W, H]];
const HOLES = [
  { name: 'Warm Up', par: 2, tier: 0, poly: RECT, tee: [0, -3.6], cup: [0, 3.4], bumpers: [[1.3, 0.4, 0.35]] },
  { name: 'The Wall', par: 3, tier: 0, poly: RECT, tee: [0, -3.6], cup: [0, 3.4], blocks: [[0, 0.3, 3.2, 0.45]] },
  { name: 'Dogleg', par: 3, tier: 0, poly: [[-W, -H], [-0.2, -H], [-0.2, 1.8], [W, 1.8], [W, H], [-W, H]], tee: [-1.4, -3.6], cup: [1.5, 3.3] },
  { name: 'Bumper Alley', par: 3, tier: 1, poly: RECT, tee: [0, -3.7], cup: [0, 3.5], bumpers: [[-1.1, 0.8, 0.38], [1.1, 0.8, 0.38], [0, -0.7, 0.38], [0, 2.2, 0.3]] },
  { name: 'Zigzag', par: 4, tier: 1, poly: RECT, tee: [-1.6, -3.7], cup: [1.6, 3.5], walls: [[[-W, -1.4], [1.2, -1.4]], [[-1.2, 1.4], [W, 1.4]]] },
  { name: 'Sand Trap', par: 3, tier: 1, poly: [[-W, -H], [W, -H], [W, 0], [1.0, 2.0], [1.0, H], [-1.0, H], [-1.0, 2.0], [-W, 0]], tee: [0, -3.7], cup: [0, 3.7], sand: [[0, 2.7, 1.6, 0.9]], blocks: [[0, -0.6, 1.6, 0.4]] },
  { name: 'Slider', par: 3, tier: 2, poly: RECT, tee: [0, -3.7], cup: [0, 3.5], walls: [[[-W, 0.6], [-0.7, 0.6]], [[0.7, 0.6], [W, 0.6]]], movers: [{ cx: 0, cy: 1.8, w: 1.3, h: 0.35, range: 1.5, speed: 1.3 }] },
  { name: 'The Island', par: 4, tier: 2, poly: RECT, tee: [-1.8, -3.8], cup: [1.8, 3.6], blocks: [[0.7, -1.6, 3.4, 0.4], [-0.7, 1.3, 3.4, 0.4]], bumpers: [[1.7, -0.1, 0.3]], sand: [[-1.5, 3.3, 1.6, 1.2]] },
];
const CONFIG = {
  easy: { pick: () => [0, 1, 2] },
  medium: { pick: () => [...shuffleArr([0, 1, 2]).slice(0, 1), ...shuffleArr([3, 4, 5])] },
  hard: { pick: () => [...shuffleArr([3, 4, 5]), ...shuffleArr([6, 7])] },
};
const BALL_R = 0.15, CUP_R = 0.25, WALL_T = 0.08;
const MAX_SPEED = 11, DRAG_FULL = 2.4;
const ROLL_K = 0.85, ROLL_C = 0.55, SAND_K = 4.5;
const STOP_SPEED = 0.07, SINK_SPEED = 4.6;

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function fitDistance(host, halfW, halfH, margin = 1.06) {
  const w = host.clientWidth, h = host.clientHeight;
  let aspect = w && h ? w / h : 0.5;
  aspect = Math.max(0.4, Math.min(1.6, aspect));
  return Math.max((halfH * margin) / 0.42, (halfW * margin) / (0.42 * aspect));
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function rectSegs(cx, cy, w, h) {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  return [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]];
}

/* Mirror a hole left-right for variety. */
function buildHole(def, mirror) {
  const mx = (p) => [mirror ? -p[0] : p[0], p[1]];
  const hole = {
    name: def.name, par: def.par,
    poly: def.poly.map(mx), tee: mx(def.tee), cup: mx(def.cup),
    walls: (def.walls || []).map(([a, b]) => [mx(a), mx(b)]),
    blocks: (def.blocks || []).map(([x, y, w, h]) => [mirror ? -x : x, y, w, h]),
    bumpers: (def.bumpers || []).map(([x, y, r]) => [mirror ? -x : x, y, r]),
    sand: (def.sand || []).map(([x, y, w, h]) => [mirror ? -x : x, y, w, h]),
    movers: (def.movers || []).map((m) => ({ ...m, cx: mirror ? -m.cx : m.cx, phase: mirror ? Math.PI : 0 })),
  };
  if (mirror) hole.poly.reverse();
  hole.segs = [];
  hole.poly.forEach((p, i) => hole.segs.push([p, hole.poly[(i + 1) % hole.poly.length]]));
  hole.walls.forEach((s) => hole.segs.push(s));
  hole.blocks.forEach(([x, y, w, h]) => rectSegs(x, y, w, h).forEach((s) => hole.segs.push(s)));
  return hole;
}

function moverX(m, t) { return m.cx + Math.sin(t * m.speed + m.phase) * m.range; }

/* One physics substep. Returns 'sunk', 'hit' (bumper), 'wall' or null. */
function stepBall(b, hole, dt, t) {
  let event = null;
  const inSand = hole.sand.some(([x, y, w, h]) => Math.abs(b.x - x) < w / 2 && Math.abs(b.y - y) < h / 2);
  const speed = Math.hypot(b.vx, b.vy);
  if (speed > 0) {
    const k = inSand ? SAND_K : ROLL_K;
    let ns = speed * Math.exp(-k * dt) - ROLL_C * dt;
    if (ns < 0) ns = 0;
    b.vx *= ns / speed; b.vy *= ns / speed;
  }
  // gentle pull toward the cup lip
  const dcx = hole.cup[0] - b.x, dcy = hole.cup[1] - b.y;
  const dCup = Math.hypot(dcx, dcy);
  if (dCup < CUP_R * 1.6 && dCup > 0.001) { b.vx += (dcx / dCup) * 2.2 * dt; b.vy += (dcy / dCup) * 2.2 * dt; }
  b.x += b.vx * dt; b.y += b.vy * dt;

  const collide = (segs, rest, moverVx = 0) => {
    for (const [[ax, ay], [bx, by]] of segs) {
      const ex = bx - ax, ey = by - ay;
      const len2 = ex * ex + ey * ey || 1e-9;
      let u = ((b.x - ax) * ex + (b.y - ay) * ey) / len2;
      u = Math.max(0, Math.min(1, u));
      const px = ax + ex * u, py = ay + ey * u;
      let nx = b.x - px, ny = b.y - py;
      const d = Math.hypot(nx, ny);
      const minD = BALL_R + WALL_T;
      if (d < minD) {
        if (d < 1e-6) { nx = -ey; ny = ex; } // dead center: use segment normal
        const nl = Math.hypot(nx, ny) || 1;
        nx /= nl; ny /= nl;
        b.x = px + nx * minD; b.y = py + ny * minD;
        const vn = (b.vx - moverVx) * nx + b.vy * ny;
        if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; event = event || 'wall'; }
      }
    }
  };
  collide(hole.segs, 0.72);
  hole.movers.forEach((m) => {
    const x = moverX(m, t);
    const vx = Math.cos(t * m.speed + m.phase) * m.range * m.speed;
    collide(rectSegs(x, m.cy, m.w, m.h), 0.75, vx);
  });
  hole.bumpers.forEach((bp, i) => {
    const [x, y, r] = bp;
    let nx = b.x - x, ny = b.y - y;
    const d = Math.hypot(nx, ny), minD = r + BALL_R;
    if (d < minD && d > 1e-6) {
      nx /= d; ny /= d;
      b.x = x + nx * minD; b.y = y + ny * minD;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) {
        b.vx -= 2.15 * vn * nx; b.vy -= 2.15 * vn * ny;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
        event = 'bump' + i;
      }
    }
  });
  const sp = Math.hypot(b.vx, b.vy);
  if (Math.hypot(hole.cup[0] - b.x, hole.cup[1] - b.y) < CUP_R && sp < SINK_SPEED) return 'sunk';
  if (sp < STOP_SPEED && dCup > CUP_R * 1.6) { b.vx = 0; b.vy = 0; }
  return event;
}

function advance(b, hole, dt, t) {
  const speed = Math.hypot(b.vx, b.vy);
  const steps = Math.max(1, Math.min(24, Math.ceil((speed * dt) / (BALL_R * 0.4))));
  const h = dt / steps;
  let ev = null;
  for (let i = 0; i < steps; i++) {
    const px = b.x, py = b.y;
    const e = stepBall(b, hole, h, t + i * h);
    if (!pointInPoly(b.x, b.y, hole.poly)) { b.x = px; b.y = py; b.vx = -b.vx * 0.5; b.vy = -b.vy * 0.5; }
    if (e === 'sunk') return 'sunk';
    if (e) ev = e;
  }
  return ev;
}

let stripeTex = null;
function turfTexture() {
  if (stripeTex) return stripeTex.clone();
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#12703f'; ctx.fillRect(0, 0, 8, 32);
  ctx.fillStyle = '#17824a'; ctx.fillRect(0, 32, 8, 32);
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(1 / 1.3, 1 / 1.3);
  return stripeTex.clone();
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const order = cfg.pick().map((i) => buildHole(HOLES[i], Math.random() < 0.5));
  const totalPar = order.reduce((s, h) => s + h.par, 0);
  let holeIdx = 0, strokes = 0, total = 0, finished = false;
  let hole = null, course = null, ballMesh = null, cupGroup = null;
  const bumperMeshes = [], moverMeshes = [];
  const ball = { x: 0, y: 0, vx: 0, vy: 0, moving: false, sinking: false };
  let aiming = null, hintGhost = null, hintUntil = 0, lastSafe = { x: 0, y: 0 };
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const t0 = performance.now();
  const now = () => (performance.now() - t0) / 1000;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="mg-meta">
      <span>Hole <b class="mg-hole">1</b>/${order.length}</span>
      <span>Par <b class="mg-par">0</b></span>
      <span>Strokes <b class="mg-strokes">0</b></span>
      <span>Total <b class="mg-total">0</b></span>
    </div>
    <div class="pc-canvas3d mg-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Pull back, let go to putt</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.mg-canvas');
  const holeEl = wrap.querySelector('.mg-hole');
  const parEl = wrap.querySelector('.mg-par');
  const strokesEl = wrap.querySelector('.mg-strokes');
  const totalEl = wrap.querySelector('.mg-total');

  const CHIP_PAD = 0.7;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, W + 0.2, H + 0.2 + CHIP_PAD / 2) });
  stage.world.position.y = CHIP_PAD / 2;

  // aim arrow (shared across holes)
  const aimGroup = new THREE.Group();
  const aimMat = new THREE.MeshBasicMaterial({ color: 0x23d18b, transparent: true, opacity: 0.95, toneMapped: false });
  const aimBar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.11), aimMat);
  aimBar.position.x = 0.5;
  const aimHead = new THREE.Mesh(new THREE.CircleGeometry(0.2, 3), aimMat);
  aimGroup.add(aimBar, aimHead);
  aimGroup.position.z = 0.05;
  aimGroup.visible = false;
  stage.world.add(aimGroup);

  const ghostGroup = new THREE.Group();
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false });
  const ghostBar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.12), ghostMat);
  ghostBar.position.x = 0.5;
  const ghostHead = new THREE.Mesh(new THREE.CircleGeometry(0.18, 3), ghostMat);
  ghostGroup.add(ghostBar, ghostHead);
  ghostGroup.position.z = 0.04;
  ghostGroup.visible = false;
  stage.world.add(ghostGroup);

  function setArrow(group, bar, head, angle, len) {
    group.position.x = ball.x; group.position.y = ball.y;
    group.rotation.z = angle;
    bar.scale.x = len; bar.position.x = len / 2 + BALL_R;
    head.position.x = len + BALL_R + 0.08;
  }

  function buildCourse() {
    if (course) { stage.world.remove(course); disposeObject(course); }
    bumperMeshes.length = 0; moverMeshes.length = 0;
    course = new THREE.Group();
    stage.world.add(course);

    const shape = new THREE.Shape(hole.poly.map(([x, y]) => new THREE.Vector2(x, y)));
    const turf = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map: turfTexture(), roughness: 0.9 }));
    turf.position.z = -0.14;
    turf.receiveShadow = true;
    course.add(turf);

    const addWall = ([[ax, ay], [bx, by]], color) => {
      const len = Math.hypot(bx - ax, by - ay);
      const m = makeTile({ w: len + WALL_T * 2, h: WALL_T * 2, depth: 0.3, radius: WALL_T * 0.9, color, emissive: color, emissiveIntensity: 0.08 });
      m.position.set((ax + bx) / 2, (ay + by) / 2, 0.02);
      m.rotation.z = Math.atan2(by - ay, bx - ax);
      course.add(m);
      popIn(m, { delay: 40 });
    };
    hole.poly.forEach((p, i) => addWall([p, hole.poly[(i + 1) % hole.poly.length]], 0x7a3fe0));
    hole.walls.forEach((s) => addWall(s, 0xa259ff));
    hole.blocks.forEach(([x, y, w, h], i) => {
      const m = makeTile({ w: w + WALL_T * 2, h: h + WALL_T * 2, depth: 0.34, radius: 0.12, color: 0xff9f43, emissive: 0xff9f43, emissiveIntensity: 0.06 });
      m.position.set(x, y, 0.03);
      course.add(m);
      popIn(m, { delay: 120 + i * 60 });
    });
    hole.sand.forEach(([x, y, w, h]) => {
      const m = makeTile({ w, h, depth: 0.03, radius: Math.min(w, h) * 0.45, color: 0xe9c77d, roughness: 1 });
      m.material.clearcoat = 0;
      m.position.set(x, y, -0.12);
      m.castShadow = false;
      course.add(m);
    });
    hole.bumpers.forEach(([x, y, r], i) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.34, 32), new THREE.MeshPhysicalMaterial({ color: 0xff4d8d, emissive: 0xff4d8d, emissiveIntensity: 0.2, roughness: 0.3, clearcoat: 0.8 }));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, 0.03);
      m.castShadow = true;
      const cap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 24), new THREE.MeshBasicMaterial({ color: 0xffd1e3 }));
      cap.rotation.x = -Math.PI / 2; cap.position.y = 0.18;
      m.add(cap);
      course.add(m);
      popIn(m, { delay: 160 + i * 60 });
      bumperMeshes.push(m);
    });
    hole.movers.forEach((mv) => {
      const m = makeTile({ w: mv.w + WALL_T * 2, h: mv.h + WALL_T * 2, depth: 0.34, radius: 0.12, color: 0x17c3b2, emissive: 0x17c3b2, emissiveIntensity: 0.15 });
      m.position.set(moverX(mv, now()), mv.cy, 0.03);
      course.add(m);
      moverMeshes.push({ m, mv });
    });

    // tee and cup
    const tee = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24), new THREE.MeshStandardMaterial({ color: 0x9ff0c4, roughness: 0.8 }));
    tee.position.set(hole.tee[0], hole.tee[1], -0.13);
    course.add(tee);
    cupGroup = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.CircleGeometry(CUP_R + 0.05, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    const hollow = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 32), new THREE.MeshBasicMaterial({ color: 0x07030f }));
    hollow.position.z = 0.005;
    const flagShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.62, -0.2), new THREE.Vector2(0, -0.4)]);
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), new THREE.MeshStandardMaterial({ color: 0xff5c5c, emissive: 0xff5c5c, emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    flag.position.set(0.04, 0.62, 0.3);
    const pole = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.62), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pole.position.set(0.02, 0.31, 0.29);
    cupGroup.add(rim, hollow, pole, flag);
    cupGroup.userData.flag = flag;
    cupGroup.position.set(hole.cup[0], hole.cup[1], -0.125);
    course.add(cupGroup);
    popIn(cupGroup, { delay: 200 });

    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, emissive: 0xffffff, emissiveIntensity: 0.08 }));
    ballMesh.castShadow = true;
    course.add(ballMesh);
    ball.x = hole.tee[0]; ball.y = hole.tee[1]; ball.vx = 0; ball.vy = 0; ball.moving = false; ball.sinking = false;
    lastSafe = { x: ball.x, y: ball.y };
    ballMesh.position.set(ball.x, ball.y, 0.01);
    popIn(ballMesh, { delay: 260, duration: 380 });
  }

  function startHole() {
    hole = order[holeIdx];
    strokes = 0;
    holeEl.textContent = holeIdx + 1;
    parEl.textContent = hole.par;
    strokesEl.textContent = 0;
    totalEl.textContent = total;
    aimGroup.visible = false; ghostGroup.visible = false; hintUntil = 0;
    buildCourse();
    api.ui.toast(`Hole ${holeIdx + 1}: ${hole.name} - par ${hole.par}`);
  }

  function holeDone(penalty) {
    total += strokes + (penalty || 0);
    totalEl.textContent = total;
    holeIdx++;
    if (holeIdx >= order.length) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const stars = total <= totalPar ? 3 : total <= totalPar + order.length ? 2 : 1;
      later(() => api.win(stars, { strokes: total, par: totalPar }), 700);
      return;
    }
    later(() => { if (!finished) startHole(); }, 1300);
  }

  function sink() {
    ball.moving = false; ball.sinking = true;
    ball.vx = 0; ball.vy = 0;
    tween(ballMesh.position, { x: hole.cup[0], y: hole.cup[1], z: -0.2 }, 220, Easing.inOutQuad);
    tween(ballMesh.scale, { x: 0.6, y: 0.6, z: 0.6 }, 220);
    api.sound.win();
    const words = strokes === 1 ? 'Hole in one!' : strokes < hole.par ? 'Under par - amazing!' : strokes === hole.par ? 'Par - nice!' : `In the cup in ${strokes}!`;
    api.ui.toast(words);
    tween(cupGroup.scale, { x: 1.3, y: 1.3, z: 1.3 }, 180, Easing.outBack, () => tween(cupGroup.scale, { x: 1, y: 1, z: 1 }, 220));
    holeDone(0);
  }

  const maxStrokes = () => hole.par + 4;

  let lastT = now();
  const unsubTick = stage.onTick(() => {
    const t = now();
    const dt = Math.min(0.12, Math.max(0, t - lastT));
    lastT = t;
    if (cupGroup && cupGroup.userData.flag) cupGroup.userData.flag.rotation.y = Math.sin(t * 3) * 0.25;
    moverMeshes.forEach(({ m, mv }) => { m.position.x = moverX(mv, t); });
    if (hintUntil) {
      if (t > hintUntil || ball.moving) { ghostGroup.visible = false; hintUntil = 0; }
      else ghostMat.opacity = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(t * 8));
    }
    if (!ball.moving) return;
    // catch up in fixed chunks so slow phones don't play in slow motion
    let ev = null;
    for (let left = dt, tt = t - dt; left > 1e-6 && ev !== 'sunk'; left -= 1 / 30) {
      const step = Math.min(1 / 30, left);
      tt += step;
      const e = advance(ball, hole, step, tt);
      if (e && (ev === null || e === 'sunk')) ev = e;
      if (ball.vx === 0 && ball.vy === 0) break;
    }
    ballMesh.position.set(ball.x, ball.y, 0.01);
    ballMesh.rotation.x -= ball.vy * dt / BALL_R;
    ballMesh.rotation.y += ball.vx * dt / BALL_R;
    if (ev === 'sunk') { sink(); return; }
    if (ev === 'wall') api.sound.move();
    if (ev && ev.startsWith('bump')) {
      const m = bumperMeshes[Number(ev.slice(4))];
      if (m) {
        api.sound.click();
        m.material.emissiveIntensity = 0.9;
        tween(m.material, { emissiveIntensity: 0.2 }, 350);
        tween(m.scale, { x: 1.15, y: 1, z: 1.15 }, 90, Easing.outCubic, () => tween(m.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outBack));
      }
    }
    if (pointInPoly(ball.x, ball.y, hole.poly)) lastSafe = { x: ball.x, y: ball.y };
    else { ball.x = lastSafe.x; ball.y = lastSafe.y; }
    if (ball.vx === 0 && ball.vy === 0) {
      ball.moving = false;
      if (strokes >= maxStrokes()) {
        api.ui.toast("Let's move on to the next hole!");
        api.sound.error();
        holeDone(1);
      }
    }
  });

  const el = stage.renderer.domElement;
  function canAim() { return !finished && hole && !ball.moving && !ball.sinking; }
  function onDown(e) {
    if (!canAim()) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!p) return;
    aiming = { id: e.pointerId, sx: p.x, sy: p.y, angle: 0, power: 0 };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onMove(e) {
    if (!aiming || e.pointerId !== aiming.id) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!p) return;
    const dx = aiming.sx - p.x, dy = aiming.sy - p.y;
    const len = Math.hypot(dx, dy);
    aiming.power = Math.min(1, len / DRAG_FULL);
    aiming.angle = Math.atan2(dy, dx);
    if (aiming.power < 0.04) { aimGroup.visible = false; return; }
    aimGroup.visible = true;
    aimMat.color.setHSL((1 - aiming.power) * 0.33, 0.9, 0.55);
    setArrow(aimGroup, aimBar, aimHead, aiming.angle, 0.4 + aiming.power * 2.4);
  }
  function onUp(e) {
    if (!aiming || e.pointerId !== aiming.id) return;
    try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const a = aiming;
    aiming = null;
    aimGroup.visible = false;
    if (!canAim()) return;
    if (a.power < 0.06) return;
    const sp = a.power * MAX_SPEED;
    ball.vx = Math.cos(a.angle) * sp; ball.vy = Math.sin(a.angle) * sp;
    ball.moving = true;
    strokes++;
    strokesEl.textContent = strokes;
    api.sound.click();
  }
  function onCancel(e) {
    if (aiming && e.pointerId === aiming.id) { aiming = null; aimGroup.visible = false; }
  }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);

  // Try many putts in a sandbox copy of the physics and keep the best one.
  function bestShot() {
    const t = now();
    let best = null;
    const powers = [0.3, 0.42, 0.55, 0.68, 0.82, 0.96];
    for (let i = 0; i < 72; i++) {
      const ang = (i / 72) * Math.PI * 2;
      for (const pw of powers) {
        const b = { x: ball.x, y: ball.y, vx: Math.cos(ang) * pw * MAX_SPEED, vy: Math.sin(ang) * pw * MAX_SPEED };
        let sunk = false, time = 0;
        for (let s = 0; s < 480; s++) {
          const ev = advance(b, hole, 1 / 40, t + time);
          time += 1 / 40;
          if (ev === 'sunk') { sunk = true; break; }
          if (b.vx === 0 && b.vy === 0) break;
        }
        const d = sunk ? 0 : Math.hypot(b.x - hole.cup[0], b.y - hole.cup[1]);
        const score = sunk ? -10 + pw * 0.5 : d;
        if (!best || score < best.score) best = { score, ang, pw, sunk };
      }
    }
    return best;
  }

  function hint() {
    if (!canAim()) {
      if (!finished && ball.moving) api.ui.toast('Wait for the ball to stop rolling.');
      return;
    }
    const shot = bestShot();
    if (!shot) return;
    ghostGroup.visible = true;
    setArrow(ghostGroup, ghostBar, ghostHead, shot.ang, 0.4 + shot.pw * 2.4);
    hintUntil = now() + 3.5;
    const pct = Math.round(shot.pw * 10) * 10;
    api.ui.toast(`${api.playerName}, ${shot.sunk ? 'putt' : 'try'} along the blue arrow with about ${pct}% power - pull back the same length.`);
  }

  startHole();

  return {
    unmount: () => {
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      unsubTick();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('minigolf', { mount });
