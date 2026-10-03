/**
 * Game 34 - Air Hockey vs AI. Drag your paddle (bottom half of the
 * table) to strike the puck past the AI at the top. First to the
 * target number of goals wins.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { aiSpeed: 2.6, aiReaction: 0.055, puckSpeed: 3.1, target: 5 },
  medium: { aiSpeed: 3.6, aiReaction: 0.09, puckSpeed: 4.0, target: 5 },
  hard: { aiSpeed: 4.8, aiReaction: 0.14, puckSpeed: 5.1, target: 7 },
};

const FIELD_W = 5, FIELD_H = 8.4;
const HALF_W = FIELD_W / 2, HALF_H = FIELD_H / 2;
const GOAL_HALF = 1.05;
const PUCK_R = 0.24;
const PADDLE_R = 0.5;

const MAX_PUCK_SPEED = 11;

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
  let game = null;
  const start = () => { game = play(container, difficulty, api, restart); };
  function restart() { if (game) game.unmount(); start(); }
  start();
  return {
    unmount: () => { if (game) game.unmount(); game = null; },
    hint: () => { if (game) game.hint(); },
  };
}

function play(container, difficulty, api, restart) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  let alive = true;
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
    timers.add(id);
  }
  let scorePlayer = 0, scoreAI = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ah-meta"><span>You: <span id="ah-you">0</span></span><span>Target: ${cfg.target}</span><span>AI: <span id="ah-ai">0</span></span></div>
    <div class="pc-canvas3d" id="ah-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Slide your finger anywhere to move your blue paddle</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ah-canvas');
  const youEl = wrap.querySelector('#ah-you');
  const aiEl = wrap.querySelector('#ah-ai');

  const halfWNeed = HALF_W + 0.3, halfHNeed = HALF_H + 0.3;
  const stage = createStage(canvasHost, fitView(canvasHost, halfWNeed, halfHNeed, { reserveBottom: 50 }));

  // table
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x1c1044, roughness: 0.5 });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_H), tableMat);
  table.position.z = -0.15;
  table.receiveShadow = true;
  stage.world.add(table);
  const midLine = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
  midLine.position.z = -0.13;
  stage.world.add(midLine);

  // side walls + goal posts (visual)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3f2a7c, roughness: 0.6 });
  [-HALF_W - 0.12, HALF_W + 0.12].forEach((x) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.24, FIELD_H, 0.4), wallMat);
    wall.position.set(x, 0, 0);
    stage.world.add(wall);
  });
  [-1, 1].forEach((sign) => {
    [HALF_H, -HALF_H].forEach((y) => {
      const postW = HALF_W - GOAL_HALF;
      const post = new THREE.Mesh(new THREE.BoxGeometry(postW, 0.24, 0.4), wallMat);
      post.position.set(sign * (GOAL_HALF + postW / 2), y, 0);
      stage.world.add(post);
    });
  });

  function makePaddle(color) {
    const geo = new THREE.CylinderGeometry(PADDLE_R, PADDLE_R, 0.3, 24);
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.7, emissive: color, emissiveIntensity: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    return mesh;
  }
  const playerPaddle = makePaddle(0x3f8efc);
  const aiPaddle = makePaddle(0xff4d8d);
  let px = 0, py = -HALF_H + 1.1;
  let ax = 0, ay = HALF_H - 1.1;
  playerPaddle.position.set(px, py, 0.1);
  aiPaddle.position.set(ax, ay, 0.1);
  stage.world.add(playerPaddle, aiPaddle);
  popIn(playerPaddle, { duration: 220 });
  popIn(aiPaddle, { duration: 220 });

  const puckMesh = new THREE.Mesh(new THREE.CylinderGeometry(PUCK_R, PUCK_R, 0.2, 20), new THREE.MeshPhysicalMaterial({ color: 0xffd93d, roughness: 0.25, clearcoat: 0.8 }));
  puckMesh.rotation.x = Math.PI / 2;
  puckMesh.castShadow = true;
  stage.world.add(puckMesh);
  let puck = { x: 0, y: 0, vx: 0, vy: 0, serving: true };

  function serve(towardPlayer) {
    puck.x = 0; puck.y = 0;
    const angle = (Math.random() * 0.6 - 0.3) + (towardPlayer ? -Math.PI / 2 : Math.PI / 2);
    puck.vx = Math.cos(angle) * cfg.puckSpeed * 0.5;
    puck.vy = Math.sin(angle) * cfg.puckSpeed;
    puck.serving = false;
    puckMesh.position.set(0, 0, 0.05);
  }
  later(() => serve(Math.random() < 0.5), 700);

  // Target position from the finger; the paddle chases it in the tick so
  // its real velocity can be passed on to the puck.
  let targetPX = px, targetPY = py;
  let pvx = 0, pvy = 0;
  function movePlayerTo(x, y) {
    targetPX = Math.max(-HALF_W + PADDLE_R, Math.min(HALF_W - PADDLE_R, x));
    targetPY = Math.max(-HALF_H + PADDLE_R, Math.min(-0.15, y));
  }
  // Relative drag: the finger can be anywhere (it does not have to cover
  // the paddle); the paddle moves by however far the finger moves.
  let dragId = null, offX = 0, offY = 0;
  const el = stage.renderer.domElement;
  function onDown(e) {
    if (finished) return;
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!world) return;
    dragId = e.pointerId;
    // touching on/near your own paddle grabs it directly; elsewhere drags relatively
    if (Math.hypot(world.x - px, world.y - py) < PADDLE_R * 2.2) { offX = 0; offY = 0; movePlayerTo(world.x, world.y); }
    else { offX = px - world.x; offY = py - world.y; }
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onMove(e) {
    if (dragId !== e.pointerId) return;
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (world) movePlayerTo(world.x + offX, world.y + offY);
  }
  function onUp(e) { if (dragId === e.pointerId) dragId = null; }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  function resetPositions() {
    px = 0; py = -HALF_H + 1.1; ax = 0; ay = HALF_H - 1.1;
    targetPX = px; targetPY = py; pvx = 0; pvy = 0; offX = 0; offY = 0; dragId = null;
    puckMesh.position.set(0, 0, 0.05);
    playerPaddle.position.set(px, py, 0.1);
    aiPaddle.position.set(ax, ay, 0.1);
  }

  function goalScored(byPlayer) {
    if (byPlayer) { scorePlayer++; api.sound.win(); } else { scoreAI++; api.sound.error(); }
    youEl.textContent = scorePlayer; aiEl.textContent = scoreAI;
    api.ui.burstFromElement(canvasHost);
    puck.serving = true;
    resetPositions();
    if (scorePlayer >= cfg.target) { winGame(); return; }
    if (scoreAI >= cfg.target) { loseGame(); return; }
    later(() => serve(!byPlayer), 900);
  }

  function winGame() {
    finished = true;
    const margin = scorePlayer - scoreAI;
    const stars = margin >= 3 ? 3 : margin >= 1 ? 2 : 1;
    later(() => api.win(stars, { scorePlayer, scoreAI }), 300);
  }
  function loseGame() {
    finished = true;
    later(() => {
      api.lose('the AI won this match! Try again.');
      const over = document.createElement('div');
      over.className = 'ah-over';
      over.innerHTML = `<div>The AI won ${scoreAI} to ${scorePlayer}.</div><button class="pc-btn pc-btn--blue">Play again</button>`;
      over.querySelector('button').addEventListener('click', () => { api.sound.click(); restart(); });
      canvasHost.appendChild(over);
    }, 300);
  }

  // Frame-rate independent: real elapsed time, clamped so a long pause
  // (app in the background) never teleports anything, then split into
  // small sub-steps so a fast puck cannot pass through a paddle.
  let lastT = performance.now();
  const unsubTick = stage.onTick(() => {
    const now = performance.now();
    const frameDt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    if (finished || frameDt <= 0) return;
    const steps = Math.max(1, Math.ceil(frameDt / (1 / 120)));
    for (let i = 0; i < steps && !finished; i++) step(frameDt / steps);
  });

  function step(dt) {
    const k = dt * 60; // lerp factors were tuned per 60fps frame

    // player paddle chases the finger quickly; its velocity is kept for hits
    const nx = px + (targetPX - px) * Math.min(1, 0.6 * k);
    const ny = py + (targetPY - py) * Math.min(1, 0.6 * k);
    pvx = (nx - px) / dt; pvy = (ny - py) / dt;
    px = nx; py = ny;
    playerPaddle.position.set(px, py, 0.1);

    // AI moves toward the puck, with a reaction lag and a top speed
    const targetX = Math.max(-HALF_W + PADDLE_R, Math.min(HALF_W - PADDLE_R, puck.x));
    const targetY = puck.vy > 0 ? Math.max(0.5, Math.min(HALF_H - PADDLE_R, puck.y)) : HALF_H - 1.1;
    let dax = (targetX - ax) * Math.min(1, cfg.aiReaction * 2 * k);
    let day = (targetY - ay) * Math.min(1, cfg.aiReaction * k);
    const maxStep = cfg.aiSpeed * dt;
    const mag = Math.hypot(dax, day);
    if (mag > maxStep) { dax *= maxStep / mag; day *= maxStep / mag; }
    ax = Math.max(-HALF_W + PADDLE_R, Math.min(HALF_W - PADDLE_R, ax + dax));
    ay = Math.max(0.15, Math.min(HALF_H - PADDLE_R, ay + day));
    const avx = dax / dt, avy = day / dt;
    aiPaddle.position.set(ax, ay, 0.1);

    if (puck.serving) return;

    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    if (puck.x - PUCK_R < -HALF_W) { puck.x = -HALF_W + PUCK_R; puck.vx *= -1; }
    if (puck.x + PUCK_R > HALF_W) { puck.x = HALF_W - PUCK_R; puck.vx *= -1; }

    // goal or wall bounce at top/bottom
    if (puck.y + PUCK_R > HALF_H) {
      if (Math.abs(puck.x) < GOAL_HALF) { goalScored(true); return; }
      puck.y = HALF_H - PUCK_R; puck.vy *= -1;
    }
    if (puck.y - PUCK_R < -HALF_H) {
      if (Math.abs(puck.x) < GOAL_HALF) { goalScored(false); return; }
      puck.y = -HALF_H + PUCK_R; puck.vy *= -1;
    }

    // paddle collisions (circle-circle)
    [{ x: px, y: py, vx: pvx, vy: pvy }, { x: ax, y: ay, vx: avx, vy: avy }].forEach((p) => {
      const dx = puck.x - p.x, dy = puck.y - p.y;
      const dist = Math.hypot(dx, dy);
      const minDist = PUCK_R + PADDLE_R;
      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist, ny = dy / dist;
        puck.x = p.x + nx * minDist; puck.y = p.y + ny * minDist;
        // bounce off the paddle, plus a push from the paddle's own motion
        const pushV = Math.max(0, p.vx * nx + p.vy * ny);
        const speed = Math.max(Math.hypot(puck.vx, puck.vy), cfg.puckSpeed * 0.7) * 1.03 + pushV * 0.5;
        puck.vx = nx * speed; puck.vy = ny * speed;
        if (Math.abs(puck.vy) < 0.8) puck.vy = (ny >= 0 ? 1 : -1) * 0.8; // never stall sideways
        api.sound.click();
      }
    });

    // keep the puck gliding: never too slow (no stalls) or too fast
    const sp = Math.hypot(puck.vx, puck.vy);
    const minSp = cfg.puckSpeed * 0.45;
    if (sp > MAX_PUCK_SPEED) { puck.vx *= MAX_PUCK_SPEED / sp; puck.vy *= MAX_PUCK_SPEED / sp; }
    else if (sp < minSp && sp > 0.0001) { puck.vx *= minSp / sp; puck.vy *= minSp / sp; }

    puckMesh.position.set(puck.x, puck.y, 0.05);
  }

  function hint() {
    if (finished) return;
    tween(playerPaddle.material, { emissiveIntensity: 0.8 }, 150, Easing.outCubic, () => tween(playerPaddle.material, { emissiveIntensity: 0.15 }, 400));
    const dir = puck.vy < 0 ? 'move under the puck to block/hit it' : 'get ready to intercept the rebound';
    api.ui.toast(`${api.playerName}, ${dir}!`);
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

PC.Games.register('airhockey', { mount });
