/**
 * Game 35 - Marble Maze. Drag anywhere on the board to tilt it (like a
 * virtual joystick) and roll the marble from the start to the goal,
 * avoiding dark pits along the way. Release to coast; tilt again to
 * steer.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { rows: 5, cols: 5, pits: 2, accel: 9, friction: 0.965 },
  medium: { rows: 7, cols: 6, pits: 4, accel: 10, friction: 0.965 },
  hard: { rows: 9, cols: 7, pits: 7, accel: 11, friction: 0.96 },
};

const CELL = 1.0;
const BALL_R = 0.26;
const WALL_T = 0.1;

function generateMaze(rows, cols) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ N: true, S: true, E: true, W: true, visited: false })));
  const stack = [[0, 0]];
  cells[0][0].visited = true;
  const dirs = [['N', 0, -1, 'S'], ['S', 0, 1, 'N'], ['E', 1, 0, 'W'], ['W', -1, 0, 'E']];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const options = dirs.filter(([, dc, dr]) => {
      const nr = r + dr, nc = c + dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].visited;
    });
    if (!options.length) { stack.pop(); continue; }
    const [dir, dc, dr, opp] = options[Math.floor(Math.random() * options.length)];
    const nr = r + dr, nc = c + dc;
    cells[r][c][dir] = false;
    cells[nr][nc][opp] = false;
    cells[nr][nc].visited = true;
    stack.push([nr, nc]);
  }
  return cells;
}

function bfsPath(cells, rows, cols, start, goal, blocked) {
  const key = (r, c) => r * cols + c;
  const prev = new Map();
  const q = [start];
  const seen = new Set([key(...start)]);
  while (q.length) {
    const [r, c] = q.shift();
    if (r === goal[0] && c === goal[1]) break;
    const cell = cells[r][c];
    const options = [];
    if (!cell.N) options.push([r - 1, c]);
    if (!cell.S) options.push([r + 1, c]);
    if (!cell.E) options.push([r, c + 1]);
    if (!cell.W) options.push([r, c - 1]);
    options.forEach(([nr, nc]) => {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
      const k = key(nr, nc);
      if (seen.has(k) || blocked.has(k)) return;
      seen.add(k);
      prev.set(k, [r, c]);
      q.push([nr, nc]);
    });
  }
  const gk = key(...goal);
  if (!seen.has(gk)) return null;
  const path = [goal];
  let cur = goal;
  while (cur[0] !== start[0] || cur[1] !== start[1]) {
    const p = prev.get(key(...cur));
    if (!p) break;
    path.push(p);
    cur = p;
  }
  return path.reverse();
}

// Fit a (halfW x halfH) world rectangle inside the canvas host, measured at
// mount time, leaving room for DOM overlays (reserve, in px) and a small
// safety margin so nothing crops on narrow phones.
function fitView(host, halfW, halfH, { margin = 1.06, reserveTop = 0, reserveBottom = 0 } = {}) {
  const w = host.clientWidth || 320, h = host.clientHeight || 480;
  const aspect = Math.max(0.3, w / h);
  const f = Math.max(0.5, (h - reserveTop - reserveBottom) / h);
  const halfVis = Math.max(halfH / f, halfW / aspect) * margin;
  return { distance: halfVis / 0.42, lookAtY: -halfVis * (reserveBottom - reserveTop) / h };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  let alive = true;
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
    timers.add(id);
  }
  const { rows, cols } = cfg;
  const cells = generateMaze(rows, cols);
  const start = [0, 0];
  const goal = [rows - 1, cols - 1];

  // Pick pit cells. The maze is "perfect" (exactly one route), so a pit on
  // that route would make the level impossible - pits only go in side
  // branches, never on the solution path or next to the start.
  const forbidden = new Set([start[0] * cols + start[1], goal[0] * cols + goal[1], 0 * cols + 1, 1 * cols + 0]);
  (bfsPath(cells, rows, cols, start, goal, new Set()) || []).forEach(([r, c]) => forbidden.add(r * cols + c));
  const candidates = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!forbidden.has(r * cols + c)) candidates.push([r, c]);
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  const pitSet = new Set(candidates.slice(0, cfg.pits).map(([r, c]) => r * cols + c));

  let finished = false, mistakes = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="mm-meta">Falls: <span id="mm-falls">0</span></div>
    <div class="pc-canvas3d" id="mm-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Drag to tilt - roll to the gold ring</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#mm-canvas');
  const fallsEl = wrap.querySelector('#mm-falls');

  const totalW = cols * CELL, totalH = rows * CELL;
  const halfW = totalW / 2 + 0.25, halfH = totalH / 2 + 0.25;
  const view = fitView(canvasHost, halfW, halfH, { reserveBottom: 52 });
  const stage = createStage(canvasHost, view);

  function cellCenter(r, c) { return { x: (c - (cols - 1) / 2) * CELL, y: ((rows - 1) / 2 - r) * CELL }; }

  // floor
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 0.3, totalH + 0.3), new THREE.MeshStandardMaterial({ color: 0x241247, roughness: 0.7 }));
  floorMesh.position.z = -0.2;
  floorMesh.receiveShadow = true;
  stage.world.add(floorMesh);

  // walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6c4fd0, roughness: 0.5 });
  const wallBoxes = [];
  function addWall(cx, cy, w, h) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.45), wallMat);
    mesh.position.set(cx, cy, 0.02);
    mesh.castShadow = true; mesh.receiveShadow = true;
    stage.world.add(mesh);
    wallBoxes.push({ x: cx, y: cy, w, h });
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, y } = cellCenter(r, c);
      const cell = cells[r][c];
      if (cell.N) addWall(x, y + CELL / 2, CELL + WALL_T, WALL_T);
      if (cell.W) addWall(x - CELL / 2, y, WALL_T, CELL + WALL_T);
      if (r === rows - 1 && cell.S) addWall(x, y - CELL / 2, CELL + WALL_T, WALL_T);
      if (c === cols - 1 && cell.E) addWall(x + CELL / 2, y, WALL_T, CELL + WALL_T);
    }
  }

  // pits
  pitSet.forEach((k) => {
    const r = Math.floor(k / cols), c = k % cols;
    const { x, y } = cellCenter(r, c);
    const pitMesh = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), new THREE.MeshBasicMaterial({ color: 0x0a0616 }));
    pitMesh.position.set(x, y, -0.05);
    stage.world.add(pitMesh);
  });

  // start / goal markers
  const startPos = cellCenter(...start);
  const goalPos = cellCenter(...goal);
  const goalMesh = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.9 }));
  goalMesh.position.set(goalPos.x, goalPos.y, -0.05);
  stage.world.add(goalMesh);
  popIn(goalMesh, { duration: 300 });

  // ball
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 18, 14), new THREE.MeshPhysicalMaterial({ color: 0x3f8efc, emissive: 0x3f8efc, emissiveIntensity: 0, roughness: 0.2, clearcoat: 0.8, metalness: 0.15 }));
  ballMesh.castShadow = true;
  stage.world.add(ballMesh);
  popIn(ballMesh, { duration: 220 });
  let ball = { x: startPos.x, y: startPos.y, vx: 0, vy: 0 };
  ballMesh.position.set(ball.x, ball.y, BALL_R);

  // tilt indicator
  const tiltArrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  tiltArrow.rotation.x = Math.PI / 2;
  tiltArrow.visible = false;
  stage.world.add(tiltArrow);

  let tiltX = 0, tiltY = 0, dragging = false, dragStart = null, dragId = null;
  const el = stage.renderer.domElement;
  function onDown(e) {
    if (finished || dragging) return;
    dragging = true;
    dragId = e.pointerId;
    dragStart = stage.pickPlane(e.clientX, e.clientY, 0);
    tiltArrow.visible = true;
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onMove(e) {
    if (!dragging || !dragStart || e.pointerId !== dragId) return;
    const cur = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!cur) return;
    let dx = cur.x - dragStart.x, dy = cur.y - dragStart.y;
    const mag = Math.hypot(dx, dy);
    const maxMag = 1.6;
    if (mag > maxMag) { dx = (dx / mag) * maxMag; dy = (dy / mag) * maxMag; }
    tiltX = dx / maxMag; tiltY = dy / maxMag;
    tiltArrow.position.set(ball.x + tiltX * 0.6, ball.y + tiltY * 0.6, 0.2);
    tiltArrow.rotation.z = Math.atan2(tiltX, tiltY) * -1 + Math.PI;
  }
  function onUp(e) {
    if (e && dragId !== null && e.pointerId !== dragId) return;
    dragging = false; dragId = null; tiltX = 0; tiltY = 0; tiltArrow.visible = false;
  }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  function respawn() {
    mistakes++;
    fallsEl.textContent = mistakes;
    api.sound.error();
    api.ui.shake(canvasHost);
    ball.x = startPos.x; ball.y = startPos.y; ball.vx = 0; ball.vy = 0;
    ballMesh.scale.set(0.01, 0.01, 0.01);
    tween(ballMesh.scale, { x: 1, y: 1, z: 1 }, 260, Easing.outBack);
    api.ui.toast(`${api.playerName}, oops - into a hole! Back to the start.`);
  }

  function winGame() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    api.sound.win();
    later(() => api.win(stars, { falls: mistakes }), 300);
  }

  // Real frame time, clamped (a long pause such as the app going to the
  // background must not fling the marble), split into sub-steps so the
  // marble can never tunnel through a thin wall.
  let lastT = performance.now();
  const unsubTick = stage.onTick(() => {
    const now = performance.now();
    const frameDt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (finished || frameDt <= 0) return;
    goalMesh.rotation.z += frameDt * 0.6;
    const steps = Math.max(1, Math.ceil(frameDt / (1 / 120)));
    for (let i = 0; i < steps && !finished; i++) { if (step(frameDt / steps)) break; }
    ballMesh.position.set(ball.x, ball.y, BALL_R);
    if (tiltArrow.visible) tiltArrow.position.set(ball.x + tiltX * 0.6, ball.y + tiltY * 0.6, 0.2);
  });

  // returns true when the step ended in a fall or the win
  function step(dt) {
    ball.vx += tiltX * cfg.accel * dt;
    ball.vy -= tiltY * cfg.accel * dt;
    const fr = Math.pow(cfg.friction, dt * 60);
    ball.vx *= fr; ball.vy *= fr;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;

    wallBoxes.forEach((wall) => {
      const halfW = wall.w / 2, halfH = wall.h / 2;
      const cx = Math.max(wall.x - halfW, Math.min(ball.x, wall.x + halfW));
      const cy = Math.max(wall.y - halfH, Math.min(ball.y, wall.y + halfH));
      const dx = ball.x - cx, dy = ball.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < BALL_R && dist > 0.0001) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = BALL_R - dist;
        ball.x += nx * overlap; ball.y += ny * overlap;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) { ball.vx -= vn * nx; ball.vy -= vn * ny; }
      }
    });

    // clamp to overall bounds as a safety net
    const bw = totalW / 2 - BALL_R, bh = totalH / 2 - BALL_R;
    ball.x = Math.max(-bw, Math.min(bw, ball.x));
    ball.y = Math.max(-bh, Math.min(bh, ball.y));


    // pit check
    const cr = Math.round((rows - 1) / 2 - ball.y / CELL);
    const cc = Math.round(ball.x / CELL + (cols - 1) / 2);
    if (cr >= 0 && cr < rows && cc >= 0 && cc < cols && pitSet.has(cr * cols + cc)) {
      const center = cellCenter(cr, cc);
      if (Math.hypot(ball.x - center.x, ball.y - center.y) < 0.3) { respawn(); return true; }
    }

    if (Math.hypot(ball.x - goalPos.x, ball.y - goalPos.y) < 0.32) { winGame(); return true; }
    return false;
  }

  function hint() {
    if (finished) return;
    const cr = Math.round((rows - 1) / 2 - ball.y / CELL);
    const cc = Math.round(ball.x / CELL + (cols - 1) / 2);
    const path = bfsPath(cells, rows, cols, [Math.max(0, Math.min(rows - 1, cr)), Math.max(0, Math.min(cols - 1, cc))], goal, pitSet);
    if (!path || path.length < 2) { api.ui.toast(`${api.playerName}, tilt toward the golden ring!`); return; }
    const next = cellCenter(...path[1]);
    const dx = next.x - ball.x, dy = next.y - ball.y;
    const dirLabel = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'up' : 'down');
    tween(ballMesh.material, { emissiveIntensity: 0.7 }, 150, Easing.outCubic, () => tween(ballMesh.material, { emissiveIntensity: 0 }, 400));
    // light up the next few cells of the route
    path.slice(1, 6).forEach((cell, i) => {
      const pos = cellCenter(...cell);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.9, toneMapped: false }));
      dot.position.set(pos.x, pos.y, -0.04);
      stage.world.add(dot);
      later(() => tween(dot.material, { opacity: 0 }, 500, Easing.outCubic, () => {
        if (!alive) return;
        stage.world.remove(dot); dot.geometry.dispose(); dot.material.dispose();
      }), 1600 + i * 120);
    });
    api.ui.toast(`${api.playerName}, tilt ${dirLabel} to head toward the goal!`);
  }

  return {
    unmount: () => {
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      unsubTick();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('marblemaze', { mount });
