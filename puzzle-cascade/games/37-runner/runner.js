/**
 * Game 37 - Lane Runner. A top-down endless runner: your token
 * auto-runs while obstacles scroll toward you down 3 lanes. Tap left
 * or right (or the buttons) to switch lanes and dodge. Reach the
 * target distance with lives to spare to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { speed: 4.2, spawnMs: 1150, targetDistance: 380, lives: 4 },
  medium: { speed: 5.8, spawnMs: 880, targetDistance: 580, lives: 3 },
  hard: { speed: 7.6, spawnMs: 680, targetDistance: 820, lives: 3 },
};

const LANE_W = 1.15;
const LANES = [-LANE_W, 0, LANE_W];
const VIEW_LEN = 10;
const PLAYER_Y = -VIEW_LEN / 2 + 1.4;
const SPAWN_Y = VIEW_LEN / 2 + 0.6;

// Fit a (halfW x halfH) world rectangle inside the canvas host, measured at
// mount time, leaving room for DOM overlays (reserve, in px) and a small
// safety margin so nothing crops on narrow phones.
function fitView(host, halfW, halfH, { margin = 1.04, reserveTop = 0, reserveBottom = 0 } = {}) {
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
  let lane = 1, distance = 0, lives = cfg.lives, finished = false, invuln = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="rn-meta"><span>Lives: <span id="rn-lives">${lives}</span></span><span>Dist: <span id="rn-dist">0</span>/${cfg.targetDistance}m</span></div>
    <div class="pc-canvas3d" id="rn-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap left or right side to change lanes</span></div>
    </div>
    <div class="rn-controls">
      <div class="rn-btn" role="button" aria-label="Left lane" data-dir="-1">⬅️</div>
      <div class="rn-btn" role="button" aria-label="Right lane" data-dir="1">➡️</div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#rn-canvas');
  const livesEl = wrap.querySelector('#rn-lives');
  const distEl = wrap.querySelector('#rn-dist');

  const totalW = LANE_W * 3, totalH = VIEW_LEN;
  const halfW = totalW / 2 + 0.35, halfH = totalH / 2 + 0.1;
  const stage = createStage(canvasHost, fitView(canvasHost, halfW, halfH, { reserveBottom: 46 }));

  // track
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x24123f, roughness: 0.7 });
  const track = new THREE.Mesh(new THREE.PlaneGeometry(totalW + 0.4, totalH + 1), trackMat);
  track.position.z = -0.15;
  track.receiveShadow = true;
  stage.world.add(track);
  // lane divider dashes (scrolling)
  const dashGroup = new THREE.Group();
  stage.world.add(dashGroup);
  const dashes = [];
  for (let laneEdge of [-LANE_W / 2, LANE_W / 2]) {
    for (let i = 0; i < 8; i++) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }));
      dash.position.set(laneEdge, -VIEW_LEN / 2 + i * (VIEW_LEN / 8), -0.1);
      dashGroup.add(dash);
      dashes.push(dash);
    }
  }

  const playerMesh = makeTile({ w: 0.7, h: 0.7, depth: 0.3, radius: 0.2, color: 0x3f8efc, emissive: 0x3f8efc, emissiveIntensity: 0.15 });
  playerMesh.position.set(LANES[lane], PLAYER_Y, 0);
  stage.world.add(playerMesh);
  popIn(playerMesh, { duration: 220 });

  const obstacles = [];
  function spawnObstacle() {
    const count = difficulty === 'hard' && Math.random() < 0.35 ? 2 : 1;
    const chosenLanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, Math.min(count, 2));
    chosenLanes.forEach((ln) => {
      const mesh = makeTile({ w: 0.72, h: 0.72, depth: 0.28, radius: 0.12, color: 0xff4d8d, emissive: 0xff4d8d, emissiveIntensity: 0.1 });
      mesh.position.set(LANES[ln], SPAWN_Y, 0);
      stage.world.add(mesh);
      obstacles.push({ mesh, lane: ln, y: SPAWN_Y, passed: false });
    });
  }
  let spawnTimer = 0;

  function moveLane(d) {
    if (finished) return;
    const next = Math.max(0, Math.min(2, lane + d));
    if (next === lane) { tween(playerMesh.position, { x: LANES[lane] + d * 0.15 }, 70, Easing.outCubic, () => tween(playerMesh.position, { x: LANES[lane] }, 90, Easing.outCubic)); return; }
    lane = next;
    tween(playerMesh.position, { x: LANES[lane] }, 140, Easing.outCubic);
    api.sound.move();
  }
  wrap.querySelectorAll('.rn-btn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); moveLane(Number(btn.dataset.dir)); });
  });
  const el = stage.renderer.domElement;
  function onTap(e) {
    if (finished) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    moveLane(relX < 0.5 ? -1 : 1);
  }
  el.addEventListener('pointerdown', onTap);
  function onKey(e) {
    if (e.key === 'ArrowLeft') moveLane(-1);
    else if (e.key === 'ArrowRight') moveLane(1);
  }
  window.addEventListener('keydown', onKey);

  function loseLife() {
    lives--;
    livesEl.textContent = lives;
    invuln = 1000;
    api.sound.error();
    api.ui.shake(canvasHost);
    tween(playerMesh.material, { emissiveIntensity: 0.9 }, 100, Easing.outCubic, () => tween(playerMesh.material, { emissiveIntensity: 0.15 }, 400));
    if (lives <= 0) {
      finished = true;
      later(() => {
        api.lose('you crashed! Try again.');
        const over = document.createElement('div');
        over.className = 'rn-over';
        over.innerHTML = `<div>Out of lives!<br>You ran ${Math.floor(distance)}m of ${cfg.targetDistance}m.</div><button class="pc-btn pc-btn--blue">Try again</button>`;
        over.querySelector('button').addEventListener('click', () => { api.sound.click(); restart(); });
        canvasHost.appendChild(over);
      }, 250);
    }
  }

  function winGame() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const stars = lives >= cfg.lives ? 3 : lives >= Math.ceil(cfg.lives / 2) ? 2 : 1;
    api.sound.win();
    later(() => api.win(stars, { lives }), 300);
  }

  // real frame time, clamped so a long pause never jumps obstacles forward
  let lastTime = performance.now();
  const unsubTick = stage.onTick(() => {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (finished) return;
    if (invuln > 0) invuln -= dt * 1000;

    distance += cfg.speed * dt * 4;
    distEl.textContent = Math.floor(distance);
    if (distance >= cfg.targetDistance) { winGame(); return; }

    spawnTimer += dt * 1000;
    if (spawnTimer >= cfg.spawnMs) { spawnTimer = 0; spawnObstacle(); }

    dashes.forEach((d) => {
      d.position.y -= cfg.speed * dt;
      if (d.position.y < -VIEW_LEN / 2 - 0.4) d.position.y += VIEW_LEN + 0.8;
    });

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.y -= cfg.speed * dt;
      o.mesh.position.y = o.y;
      if (!o.passed && Math.abs(o.y - PLAYER_Y) < 0.42 && o.lane === lane && invuln <= 0) {
        o.passed = true;
        loseLife();
      }
      if (o.y < -VIEW_LEN / 2 - 1) {
        stage.world.remove(o.mesh);
        o.mesh.geometry.dispose(); o.mesh.material.dispose();
        obstacles.splice(i, 1);
      }
    }
  });

  function hint() {
    if (finished) return;
    const upcoming = obstacles.filter((o) => o.y > PLAYER_Y).sort((a, b) => a.y - b.y);
    const dangerLanes = new Set(upcoming.slice(0, 2).map((o) => o.lane));
    const safeLane = [0, 1, 2].find((l) => !dangerLanes.has(l));
    if (safeLane === undefined) { api.ui.toast(`${api.playerName}, all lanes are tight - time it carefully!`); return; }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 0.95, VIEW_LEN), new THREE.MeshBasicMaterial({ color: 0x23d18b, transparent: true, opacity: 0.35, toneMapped: false }));
    glow.position.set(LANES[safeLane], 0, -0.12);
    stage.world.add(glow);
    tween(glow.material, { opacity: 0 }, 1400, Easing.inOutQuad, () => { if (!alive) return; stage.world.remove(glow); glow.geometry.dispose(); glow.material.dispose(); });
    const where = safeLane === lane ? 'stay in your lane - the green one is safe' : `move ${safeLane < lane ? 'left' : 'right'} to the green lane`;
    api.ui.toast(`${api.playerName}, ${where}!`);
    tween(playerMesh.material, { emissiveIntensity: 0.8 }, 150, Easing.outCubic, () => tween(playerMesh.material, { emissiveIntensity: 0.15 }, 500));
  }

  return {
    unmount: () => {
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      unsubTick();
      el.removeEventListener('pointerdown', onTap);
      window.removeEventListener('keydown', onKey);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('runner', { mount });
