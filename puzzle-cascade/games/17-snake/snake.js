/**
 * Game 17 - Snake (3D). Steer with arrow keys/WASD, swipe, or the
 * on-screen pad. Eat food to grow; avoid the walls and your own tail.
 * Reach the target length to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 10, tickMs: 240, target: 10 },
  medium: { size: 14, tickMs: 160, target: 16 },
  hard: { size: 18, tickMs: 110, target: 22 },
};
const CELL = 0.62;
const HEAD_COLOR = 0x23d18b;
const BODY_COLOR = 0x17c3b2;
const FOOD_COLOR = 0xff4d8d;

function cellXY(r, c, size) {
  const half = (size - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  let snake = [{ r: Math.floor(size / 2), c: Math.floor(size / 2) }];
  let dir = { r: 0, c: 1 };
  let pendingDir = dir;
  let food = null;
  let finished = false;
  let startedAt = Date.now();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sk-meta">Length: <span id="sk-length">1</span> / ${cfg.target}</div>
    <div class="pc-canvas3d" id="sk-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Swipe, arrows/WASD, or the pad</span></div>
    </div>
    <div class="sk-dpad" id="sk-dpad">
      <div class="sk-dbtn sk-dbtn--up" data-dir="up">⬆️</div>
      <div class="sk-dbtn sk-dbtn--left" data-dir="left">⬅️</div>
      <div class="sk-dbtn sk-dbtn--right" data-dir="right">➡️</div>
      <div class="sk-dbtn sk-dbtn--down" data-dir="down">⬇️</div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#sk-canvas');
  const lengthEl = wrap.querySelector('#sk-length');

  const stage = createStage(canvasHost, { distance: size * 1.55 });

  // floor plate so the play area reads clearly
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b0f5c, roughness: 0.9 });
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(size * CELL + 0.3, size * CELL + 0.3), floorMat);
  floorMesh.position.z = -0.16;
  floorMesh.receiveShadow = true;
  stage.world.add(floorMesh);

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
      foodMesh = new THREE.Mesh(new THREE.SphereGeometry(CELL * 0.34, 16, 12), new THREE.MeshStandardMaterial({ color: FOOD_COLOR, emissive: FOOD_COLOR, emissiveIntensity: 0.35, roughness: 0.3 }));
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
    const map = { up: { r: -1, c: 0 }, down: { r: 1, c: 0 }, left: { r: 0, c: -1 }, right: { r: 0, c: 1 } };
    const next = map[name];
    if (!next) return;
    // ignore reversing directly into the body
    if (next.r === -dir.r && next.c === -dir.c && snake.length > 1) return;
    pendingDir = next;
  }

  function onKey(e) {
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    if (map[e.key]) { e.preventDefault(); setDir(map[e.key]); }
  }
  window.addEventListener('keydown', onKey);
  wrap.querySelectorAll('.sk-dbtn').forEach((btn) => btn.addEventListener('click', () => setDir(btn.dataset.dir)));

  let touchStart = null;
  stage.renderer.domElement.addEventListener('pointerdown', (e) => { touchStart = { x: e.clientX, y: e.clientY }; });
  stage.renderer.domElement.addEventListener('pointerup', (e) => {
    if (!touchStart) return;
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
  });

  function tick() {
    if (finished) return;
    dir = pendingDir;
    const head = snake[0];
    const nr = head.r + dir.r, nc = head.c + dir.c;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) { return endGame(false); }
    if (snake.some((s, i) => i !== snake.length - 1 && s.r === nr && s.c === nc)) { return endGame(false); }
    const ateFood = food && nr === food.r && nc === food.c;
    snake.unshift({ r: nr, c: nc });
    if (ateFood) {
      api.sound.click();
      lengthEl.textContent = snake.length;
      if (snake.length >= cfg.target) { syncMeshes(); return endGame(true); }
      placeFood();
    } else {
      snake.pop();
    }
    syncMeshes();
  }

  const intervalId = setInterval(tick, cfg.tickMs);

  function endGame(won) {
    finished = true;
    clearInterval(intervalId);
    if (won) {
      const elapsed = Date.now() - startedAt;
      const expected = cfg.target * cfg.tickMs * 2.4;
      const stars = elapsed <= expected * 0.7 ? 3 : elapsed <= expected * 1.1 ? 2 : 1;
      api.ui.burstFromElement(canvasHost);
      setTimeout(() => api.win(stars, { length: snake.length }), 250);
    } else {
      api.sound.error();
      api.ui.shake(canvasHost);
      setTimeout(() => api.lose(`you crashed at length ${snake.length}! Try again.`), 250);
    }
  }

  function hint() {
    if (finished || !food) return;
    const head = snake[0];
    const options = [
      { name: 'up', r: -1, c: 0 }, { name: 'down', r: 1, c: 0 },
      { name: 'left', r: 0, c: -1 }, { name: 'right', r: 0, c: 1 },
    ].filter((o) => !(o.r === -dir.r && o.c === -dir.c));
    let best = null, bestDist = Infinity;
    options.forEach((o) => {
      const nr = head.r + o.r, nc = head.c + o.c;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) return;
      if (snake.some((s) => s.r === nr && s.c === nc)) return;
      const dist = Math.abs(nr - food.r) + Math.abs(nc - food.c);
      if (dist < bestDist) { bestDist = dist; best = o; }
    });
    if (!best) { api.ui.toast(`${api.playerName}, careful - tight spot!`); return; }
    const arrow = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' }[best.name];
    api.ui.toast(`${api.playerName}, head ${best.name}! ${arrow}`);
  }

  return {
    unmount: () => {
      finished = true;
      clearInterval(intervalId);
      window.removeEventListener('keydown', onKey);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('snake', { mount });
