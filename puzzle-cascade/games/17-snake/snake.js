/**
 * Game 17 - Snake (3D). Steer with arrow keys/WASD, swipe, tap the
 * board on the side you want to turn to, or the on-screen pad. The snake
 * waits for your first move before it starts. Eat food to grow; avoid the walls and your own tail.
 * Reach the target length to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 10, tickMs: 260, target: 10 },
  medium: { size: 14, tickMs: 170, target: 16 },
  hard: { size: 18, tickMs: 120, target: 22 },
};
const CELL = 0.62;
const HEAD_COLOR = 0x23d18b;
const BODY_COLOR = 0x17c3b2;
const FOOD_COLOR = 0xff4d8d;
const DIRS = { up: { r: -1, c: 0 }, down: { r: 1, c: 0 }, left: { r: 0, c: -1 }, right: { r: 0, c: 1 } };

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
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
  const size = cfg.size;
  let snake = [{ r: Math.floor(size / 2), c: Math.floor(size / 2) }];
  let dir = DIRS.right;
  const queue = []; // buffered turns (max 2) so quick double-swipes aren't lost
  let food = null;
  let finished = false, started = false;
  let startedAt = 0;
  let intervalId = null;
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sk-meta">Length: <span id="sk-length">1</span> / ${cfg.target}</div>
    <div class="pc-canvas3d" id="sk-canvas">
      <div class="pc-overlay-top"><span class="pc-chip" id="sk-chip">Swipe or tap an arrow to start!</span></div>
    </div>
    <div class="sk-dpad" id="sk-dpad">
      <button type="button" class="sk-dbtn sk-dbtn--up" data-dir="up" aria-label="Up">\u2B06\uFE0F</button>
      <button type="button" class="sk-dbtn sk-dbtn--left" data-dir="left" aria-label="Left">\u2B05\uFE0F</button>
      <button type="button" class="sk-dbtn sk-dbtn--right" data-dir="right" aria-label="Right">\u27A1\uFE0F</button>
      <button type="button" class="sk-dbtn sk-dbtn--down" data-dir="down" aria-label="Down">\u2B07\uFE0F</button>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#sk-canvas');
  const lengthEl = wrap.querySelector('#sk-length');
  const chipEl = wrap.querySelector('#sk-chip');

  const boardHalf = (size * CELL) / 2 + 0.25;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, boardHalf, boardHalf + 0.5) });

  // floor plate + glowing rim so the deadly walls are easy to see
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a1f74, roughness: 0.9 });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(size * CELL + 0.1, size * CELL + 0.1), floorMat);
  floorMesh.position.z = -0.16;
  floorMesh.receiveShadow = true;
  stage.world.add(floorMesh);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xa259ff, emissive: 0xa259ff, emissiveIntensity: 0.35, roughness: 0.5 });
  const span = size * CELL + 0.3;
  [[0, span / 2, span, 0.14], [0, -span / 2, span, 0.14], [span / 2, 0, 0.14, span], [-span / 2, 0, 0.14, span]].forEach(([x, y, w, h]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), rimMat);
    bar.position.set(x, y, -0.05);
    stage.world.add(bar);
  });

  const segMeshes = [];
  function makeSeg(isHead) {
    const m = makeTile({ w: CELL * 0.9, h: CELL * 0.9, depth: 0.22, radius: 0.12, color: isHead ? HEAD_COLOR : BODY_COLOR });
    stage.world.add(m);
    return m;
  }
  segMeshes.push(makeSeg(true));
  popIn(segMeshes[0], { duration: 220 });

  let foodMesh = null;
  function placeFood() {
    const occupied = new Set(snake.map((s) => `${s.r},${s.c}`));
    const free = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!occupied.has(`${r},${c}`)) free.push({ r, c });
    if (!free.length) return;
    food = free[Math.floor(Math.random() * free.length)];
    if (!foodMesh) {
      foodMesh = new THREE.Mesh(new THREE.SphereGeometry(CELL * 0.36, 16, 12), new THREE.MeshStandardMaterial({ color: FOOD_COLOR, emissive: FOOD_COLOR, emissiveIntensity: 0.45, roughness: 0.3 }));
      foodMesh.castShadow = true;
      stage.world.add(foodMesh);
    }
    const { x, y } = cellXY(food.r, food.c, size);
    foodMesh.position.set(x, y, 0.2);
    popIn(foodMesh, { duration: 200 });
  }
  placeFood();

  function syncMeshes() {
    while (segMeshes.length < snake.length) segMeshes.push(makeSeg(false));
    while (segMeshes.length > snake.length) {
      const m = segMeshes.pop();
      stage.world.remove(m);
      m.geometry.dispose(); m.material.dispose();
    }
    snake.forEach((seg, i) => {
      const { x, y } = cellXY(seg.r, seg.c, size);
      const mesh = segMeshes[i];
      mesh.position.set(x, y, 0);
      mesh.material.color.set(i === 0 ? HEAD_COLOR : BODY_COLOR);
    });
  }
  syncMeshes();

  function setDir(name) {
    if (finished) return;
    const next = DIRS[name];
    if (!next) return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (next === last) { if (!started) begin(); return; }
    // ignore reversing straight back into the body
    if (next.r === -last.r && next.c === -last.c && snake.length > 1) return;
    if (queue.length >= 2) queue.shift();
    queue.push(next);
    if (!started) begin();
  }

  function begin() {
    started = true;
    startedAt = Date.now();
    chipEl.parentNode.hidden = true;
    intervalId = setInterval(tick, cfg.tickMs);
  }

  function onKey(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    if (map[e.key]) { e.preventDefault(); setDir(map[e.key]); }
  }
  window.addEventListener('keydown', onKey);
  wrap.querySelectorAll('.sk-dbtn').forEach((btn) => btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setDir(btn.dataset.dir);
  }));

  // Swipes steer as soon as the finger has travelled far enough (no need to
  // lift), and a plain tap steers toward the tapped side of the head.
  const canvas = stage.renderer.domElement;
  let touch = null;
  function onDown(e) {
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, swiped: false };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onMove(e) {
    if (!touch || e.pointerId !== touch.id) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
    touch.x = e.clientX; touch.y = e.clientY; touch.swiped = true;
  }
  function onUp(e) {
    if (!touch || e.pointerId !== touch.id) return;
    const wasSwipe = touch.swiped;
    touch = null;
    if (wasSwipe) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!p) return;
    const head = cellXY(snake[0].r, snake[0].c, size);
    const dx = p.x - head.x, dy = p.y - head.y;
    const moving = queue.length ? queue[queue.length - 1] : dir;
    if (!started) {
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left'); else setDir(dy > 0 ? 'up' : 'down');
      return;
    }
    if (moving.c !== 0) { if (Math.abs(dy) > CELL * 0.5) setDir(dy > 0 ? 'up' : 'down'); }
    else if (Math.abs(dx) > CELL * 0.5) setDir(dx > 0 ? 'right' : 'left');
  }
  function onCancel() { touch = null; }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  function tick() {
    if (finished) return;
    if (queue.length) dir = queue.shift();
    const head = snake[0];
    const nr = head.r + dir.r, nc = head.c + dir.c;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) { endGame(false, 'you hit the wall'); return; }
    const ateFood = food && nr === food.r && nc === food.c;
    // the tail moves out of the way this tick unless we're growing
    const bodyToCheck = ateFood ? snake : snake.slice(0, -1);
    if (bodyToCheck.some((s) => s.r === nr && s.c === nc)) { endGame(false, 'you bumped into your tail'); return; }
    snake.unshift({ r: nr, c: nc });
    if (ateFood) {
      api.sound.click();
      lengthEl.textContent = snake.length;
      if (snake.length >= cfg.target) { syncMeshes(); endGame(true); return; }
      placeFood();
    } else {
      snake.pop();
    }
    syncMeshes();
  }

  function endGame(won, why) {
    finished = true;
    clearInterval(intervalId);
    if (won) {
      const elapsed = Date.now() - startedAt;
      const expected = cfg.target * cfg.tickMs * 2.4;
      const stars = elapsed <= expected * 0.7 ? 3 : elapsed <= expected * 1.1 ? 2 : 1;
      api.ui.burstFromElement(canvasHost);
      timers.later(() => api.win(stars, { length: snake.length }), 250);
    } else {
      segMeshes[0].material.color.set(0xff5c5c);
      api.ui.shake(canvasHost);
      timers.later(() => api.lose(`${why} at length ${snake.length}! Try again.`), 250);
    }
  }

  function hint() {
    if (finished || !food) return;
    if (!started) { api.ui.toast(`${api.playerName}, swipe or tap an arrow to start moving!`); return; }
    const head = snake[0];
    const cur = queue.length ? queue[queue.length - 1] : dir;
    const options = Object.keys(DIRS).map((name) => ({ name, ...DIRS[name] }))
      .filter((o) => !(o.r === -cur.r && o.c === -cur.c && snake.length > 1));
    let best = null, bestDist = Infinity;
    options.forEach((o) => {
      const nr = head.r + o.r, nc = head.c + o.c;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) return;
      if (snake.slice(0, -1).some((s) => s.r === nr && s.c === nc)) return;
      const dist = Math.abs(nr - food.r) + Math.abs(nc - food.c);
      if (dist < bestDist) { bestDist = dist; best = o; }
    });
    if (!best) { api.ui.toast(`${api.playerName}, careful - tight spot!`); return; }
    const arrow = { up: '\u2B06\uFE0F', down: '\u2B07\uFE0F', left: '\u2B05\uFE0F', right: '\u27A1\uFE0F' }[best.name];
    api.ui.toast(`${api.playerName}, head ${best.name}! ${arrow}`);
    const btn = wrap.querySelector(`.sk-dbtn[data-dir="${best.name}"]`);
    if (btn) { btn.classList.add('sk-dbtn--hint'); timers.later(() => btn.classList.remove('sk-dbtn--hint'), 1200); }
  }

  return {
    unmount: () => {
      finished = true;
      clearInterval(intervalId);
      timers.clear();
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('snake', { mount: guardMount(mount, { retry: true }) });
