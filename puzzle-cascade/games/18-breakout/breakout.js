/**
 * Game 18 - Breakout (3D). Drag the paddle (or use arrow keys / the
 * on-screen buttons) to bounce the ball and clear every brick.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { rows: 3, cols: 6, speed: 3.4, paddleW: 1.8, lives: 5 },
  medium: { rows: 4, cols: 7, speed: 4.6, paddleW: 1.4, lives: 3 },
  hard: { rows: 5, cols: 8, speed: 5.8, paddleW: 1.1, lives: 3 },
};
const FIELD_W = 6.4, FIELD_H = 9.2;
const HALF_W = FIELD_W / 2, HALF_H = FIELD_H / 2;
const PADDLE_Y = -HALF_H + 0.6;
const BALL_R = 0.16;
const PADDLE_H = 0.32;
const BRICK_TOP = HALF_H - 0.8;

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
  let lives = cfg.lives, finished = false, launched = false;
  let bricksLeft = cfg.rows * cfg.cols;
  const totalBricks = bricksLeft;
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bo-meta"><span>Lives: <span id="bo-lives">${lives}</span></span><span>Bricks: <span id="bo-bricks">${bricksLeft}</span></span></div>
    <div class="pc-canvas3d" id="bo-canvas">
      <div class="bo-tip" id="bo-tip"><span class="pc-chip">Tap to launch, then drag to move the paddle</span></div>
    </div>
    <div class="bo-controls" id="bo-controls">
      <button type="button" class="bo-btn bo-btn--left" data-dir="-1" aria-label="Left">\u2B05\uFE0F</button>
      <button type="button" class="bo-btn bo-btn--right" data-dir="1" aria-label="Right">\u27A1\uFE0F</button>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bo-canvas');
  const livesEl = wrap.querySelector('#bo-lives');
  const bricksEl = wrap.querySelector('#bo-bricks');
  const tipEl = wrap.querySelector('#bo-tip');

  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, HALF_W + 0.35, HALF_H + 0.35, 1.04) });

  // side walls (visual)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3f2a7c, roughness: 0.6 });
  [-HALF_W - 0.15, HALF_W + 0.15].forEach((x) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, FIELD_H, 0.4), wallMat);
    wall.position.set(x, 0, 0);
    stage.world.add(wall);
  });
  const topWall = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 0.6, 0.3, 0.4), wallMat);
  topWall.position.set(0, HALF_H + 0.15, 0);
  stage.world.add(topWall);

  // paddle
  let paddleX = 0;
  const paddleMesh = makeTile({ w: cfg.paddleW, h: PADDLE_H, depth: 0.24, radius: 0.1, color: 0x3f8efc, emissive: 0x3f8efc, emissiveIntensity: 0 });
  paddleMesh.position.set(0, PADDLE_Y, 0);
  stage.world.add(paddleMesh);
  popIn(paddleMesh, { duration: 200 });

  // ball
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 0.3, roughness: 0.2 }));
  ballMesh.castShadow = true;
  stage.world.add(ballMesh);
  popIn(ballMesh, { duration: 180 });
  let ball = { x: 0, y: PADDLE_Y + PADDLE_H / 2 + BALL_R + 0.02, vx: 0, vy: 0 };

  // bricks
  const bricks = [];
  const brickW = FIELD_W / cfg.cols - 0.08;
  const brickH = 0.42;
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const x = -HALF_W + brickW / 2 + 0.04 + c * (FIELD_W / cfg.cols);
      const y = BRICK_TOP - r * (brickH + 0.1);
      const mesh = makeTile({ w: brickW, h: brickH, depth: 0.26, radius: 0.08, color: PALETTE[r % PALETTE.length] });
      mesh.position.set(x, y, 0);
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * cfg.cols + c) * 12 });
      bricks.push({ mesh, x, y, w: brickW, h: brickH, alive: true });
    }
  }

  function resetBall(onPaddle) {
    ball.x = paddleX;
    ball.y = PADDLE_Y + PADDLE_H / 2 + BALL_R + 0.02;
    ball.vx = 0; ball.vy = 0;
    launched = false;
    ballMesh.position.set(ball.x, ball.y, 0);
  }
  resetBall(true);

  function launchBall() {
    if (launched || finished) return;
    launched = true;
    tipEl.hidden = true;
    const angle = (Math.random() * 0.5 - 0.25) + Math.PI / 2; // mostly upward
    ball.vx = Math.cos(angle) * cfg.speed * 0.6;
    ball.vy = Math.sin(angle) * cfg.speed;
  }

  function movePaddleTo(x) {
    const maxX = HALF_W - cfg.paddleW / 2;
    paddleX = Math.max(-maxX, Math.min(maxX, x));
    paddleMesh.position.x = paddleX;
    if (!launched) { ball.x = paddleX; ballMesh.position.x = paddleX; }
  }

  function onPointerMove(e) {
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (world) movePaddleTo(world.x);
  }
  // The paddle follows your finger anywhere on the board (pointer capture
  // keeps the drag alive even if the finger slides off the canvas).
  const canvas = stage.renderer.domElement;
  let dragId = null;
  function onDown(e) {
    if (finished) return;
    dragId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    onPointerMove(e);
    if (!launched) launchBall();
  }
  function onMove(e) { if (dragId === e.pointerId && !finished) onPointerMove(e); }
  function onPointerUp(e) { if (e.pointerId === dragId) dragId = null; }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  let keyDir = 0;
  function onKey(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a') { keyDir = -1; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keyDir = 1; e.preventDefault(); }
    else if (e.key === ' ') { launchBall(); e.preventDefault(); }
  }
  function onKeyUp(e) {
    if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) keyDir = 0;
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);

  wrap.querySelectorAll('.bo-btn').forEach((btn) => {
    const dir = Number(btn.dataset.dir);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      keyDir = dir;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!launched) launchBall();
    });
    const stop = () => { if (keyDir === dir) keyDir = 0; };
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('lostpointercapture', stop);
  });

  let lastTime = performance.now();
  const unsubTick = stage.onTick(() => {
    if (finished) return;
    const now = performance.now();
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    if (keyDir !== 0) movePaddleTo(paddleX + keyDir * cfg.speed * 1.6 * dt);

    if (!launched) return;

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - BALL_R < -HALF_W) { ball.x = -HALF_W + BALL_R; ball.vx *= -1; api.sound.move(); }
    if (ball.x + BALL_R > HALF_W) { ball.x = HALF_W - BALL_R; ball.vx *= -1; api.sound.move(); }
    if (ball.y + BALL_R > HALF_H) { ball.y = HALF_H - BALL_R; ball.vy *= -1; api.sound.move(); }

    // paddle collision
    if (ball.vy < 0 && ball.y - BALL_R < PADDLE_Y + PADDLE_H / 2 && ball.y + BALL_R > PADDLE_Y - PADDLE_H / 2 &&
        ball.x > paddleX - cfg.paddleW / 2 - BALL_R - 0.08 && ball.x < paddleX + cfg.paddleW / 2 + BALL_R + 0.08) {
      ball.y = PADDLE_Y + PADDLE_H / 2 + BALL_R;
      const offset = Math.max(-1, Math.min(1, (ball.x - paddleX) / (cfg.paddleW / 2)));
      const speed = Math.hypot(ball.vx, ball.vy);
      const angle = Math.PI / 2 + offset * 0.9;
      ball.vx = Math.cos(angle) * speed;
      ball.vy = Math.abs(Math.sin(angle) * speed);
      api.sound.click();
    }

    // brick collisions
    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (Math.abs(ball.x - brick.x) < brick.w / 2 + BALL_R && Math.abs(ball.y - brick.y) < brick.h / 2 + BALL_R) {
        brick.alive = false;
        bricksLeft--;
        bricksEl.textContent = bricksLeft;
        const overlapX = (brick.w / 2 + BALL_R) - Math.abs(ball.x - brick.x);
        const overlapY = (brick.h / 2 + BALL_R) - Math.abs(ball.y - brick.y);
        if (overlapX < overlapY) ball.vx *= -1; else ball.vy *= -1;
        api.sound.match();
        tween(brick.mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 160, Easing.outCubic, () => {
          stage.world.remove(brick.mesh);
          brick.mesh.geometry.dispose(); brick.mesh.material.dispose();
        });
        if (bricksLeft <= 0) { winGame(); return; }
        break;
      }
    }

    if (ball.y - BALL_R < -HALF_H) {
      lives--;
      livesEl.textContent = lives;
      api.sound.error();
      api.ui.shake(canvasHost);
      if (lives <= 0) { loseGame(); return; }
      resetBall(true);
      tipEl.hidden = false;
      tipEl.firstElementChild.textContent = lives === 1 ? 'Last ball! Tap to launch' : `${lives} balls left - tap to launch`;
      return;
    }

    ballMesh.position.set(ball.x, ball.y, 0);
    paddleMesh.position.x = paddleX;
  });

  function winGame() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const stars = lives >= cfg.lives ? 3 : lives >= Math.ceil(cfg.lives / 2) ? 2 : 1;
    timers.later(() => api.win(stars, { lives }), 300);
  }
  function loseGame() {
    finished = true;
    timers.later(() => api.lose('you ran out of lives! Try again.'), 250);
  }

  function hint() {
    if (finished) return;
    if (!launched) { api.ui.toast(`${api.playerName}, tap the board to launch the ball!`); return; }
    // simple straight-line projection of the ball's x at paddle height
    let x = ball.x, vx = ball.vx;
    let y = ball.y, vy = ball.vy;
    let steps = 0;
    while (y > PADDLE_Y && steps < 400) {
      x += vx * 0.02; y += vy * 0.02;
      if (x < -HALF_W || x > HALF_W) vx *= -1;
      steps++;
    }
    x = Math.max(-HALF_W, Math.min(HALF_W, x));
    tween(paddleMesh.material, { emissiveIntensity: 0.6 }, 160, Easing.outCubic, () => tween(paddleMesh.material, { emissiveIntensity: 0 }, 300, Easing.outCubic));
    api.ui.toast(`${api.playerName}, move under where the ball is heading!`);
  }

  return {
    unmount: () => {
      finished = true;
      unsubTick();
      timers.clear();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('breakout', { mount: guardMount(mount, { retry: true }) });
