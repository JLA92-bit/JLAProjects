/**
 * Game 38 - Mini Tower Defense. Enemies march along a fixed winding
 * path; tap an open cell next to the path to place a tower (limited
 * budget, topped up as you earn coins). Survive every wave to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { cols: 5, rows: 8, waves: 5, startBudget: 8, enemyHp: 9, enemySpeed: 1.0, lives: 12, towerCost: 3 },
  medium: { cols: 5, rows: 9, waves: 7, startBudget: 7, enemyHp: 13, enemySpeed: 1.15, lives: 9, towerCost: 3 },
  hard: { cols: 6, rows: 10, waves: 9, startBudget: 6, enemyHp: 17, enemySpeed: 1.3, lives: 7, towerCost: 3 },
};

const CELL = 0.85;
const TOWER_RANGE = 1.55;
const TOWER_DMG = 4.5;
const TOWER_RATE = 480;

function buildPath(cols, rows) {
  // path occupies every OTHER row in full, connected by a single-cell
  // "chute" in the rows between - this leaves plenty of open cells on
  // the connector rows for towers, instead of filling the whole grid.
  const path = [];
  let dir = 1;
  for (let r = 0; r < rows; r += 2) {
    if (dir === 1) { for (let c = 0; c < cols; c++) path.push([r, c]); }
    else { for (let c = cols - 1; c >= 0; c--) path.push([r, c]); }
    if (r + 1 < rows) {
      const connCol = dir === 1 ? cols - 1 : 0;
      path.push([r + 1, connCol]);
    }
    dir *= -1;
  }
  return path;
}

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
  const { cols, rows } = cfg;
  const path = buildPath(cols, rows);
  const pathSet = new Set(path.map(([r, c]) => r * cols + c));

  let budget = cfg.startBudget, lives = cfg.lives, wave = 0, finished = false;
  let waveActive = false, enemiesToSpawn = 0, spawnTimer = 0;
  const towers = new Map(); // key -> {mesh, cooldown}
  const enemies = [];

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="td-meta">
      <span>❤️ <span id="td-lives">${lives}</span></span>
      <span>💰 <span id="td-budget">${budget}</span></span>
      <span>Wave <span id="td-wave">0</span>/${cfg.waves}</span>
    </div>
    <div class="pc-canvas3d" id="td-canvas">
      <div class="pc-overlay-top"><span class="pc-chip td-banner" id="td-banner" hidden></span></div>
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a dark square to build a tower (💰${cfg.towerCost})</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#td-canvas');
  const livesEl = wrap.querySelector('#td-lives');
  const budgetEl = wrap.querySelector('#td-budget');
  const waveEl = wrap.querySelector('#td-wave');
  const bannerEl = wrap.querySelector('#td-banner');
  // In-board messages (instead of page toasts, which sit over the header)
  let bannerTimer = null;
  function say(msg, ms = 1600) {
    bannerEl.textContent = msg;
    bannerEl.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { bannerTimer = null; if (alive) bannerEl.hidden = true; }, ms);
  }

  const totalW = cols * CELL, totalH = rows * CELL;
  const halfW = totalW / 2 + 0.15, halfH = totalH / 2 + 0.15;
  const stage = createStage(canvasHost, fitView(canvasHost, halfW, halfH, { reserveTop: 44, reserveBottom: 52 }));

  function cellPos(r, c) { return { x: (c - (cols - 1) / 2) * CELL, y: ((rows - 1) / 2 - r) * CELL }; }

  const cellMeshes = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const isPath = pathSet.has(r * cols + c);
    const { x, y } = cellPos(r, c);
    const cellColor = isPath ? 0x4a3d8f : 0x241247;
    const mesh = makeTile({ w: CELL * 0.92, h: CELL * 0.92, depth: 0.16, radius: 0.1, color: cellColor, emissive: cellColor, emissiveIntensity: 0 });
    mesh.position.set(x, y, -0.02);
    mesh.userData = { r, c, isPath };
    stage.world.add(mesh);
    cellMeshes.set(r * cols + c, mesh);
  }

  function buildTower(r, c) {
    const key = r * cols + c;
    if (pathSet.has(key)) { api.sound.error(); api.ui.shake(canvasHost); say('Enemies walk there - pick a dark square'); return; }
    if (towers.has(key)) { api.sound.error(); say('There is already a tower there'); return; }
    if (budget < cfg.towerCost) { api.sound.error(); api.ui.shake(canvasHost); say(`Not enough coins yet - each tower costs ${cfg.towerCost}`); return; }
    budget -= cfg.towerCost;
    budgetEl.textContent = budget;
    const { x, y } = cellPos(r, c);
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 8), new THREE.MeshPhysicalMaterial({ color: 0x3f8efc, emissive: 0x3f8efc, emissiveIntensity: 0.2, roughness: 0.3, clearcoat: 0.6 }));
    mesh.position.set(x, y, 0.05);
    mesh.castShadow = true;
    stage.world.add(mesh);
    popIn(mesh, { duration: 200 });
    towers.set(key, { mesh, x, y, cooldown: 0 });
    api.sound.click();
  }

  function onCanvasTap(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, [...cellMeshes.values()]);
    if (!hit) return;
    const { r, c } = hit.object.userData;
    buildTower(r, c);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onCanvasTap);

  const pathWorld = path.map(([r, c]) => cellPos(r, c));

  function spawnEnemy() {
    const hp = cfg.enemyHp * (1 + (wave - 1) * 0.18);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0xff4d8d, emissive: 0xff4d8d, emissiveIntensity: 0.15, roughness: 0.3 }));
    mesh.position.set(pathWorld[0].x, pathWorld[0].y, 0.1);
    mesh.castShadow = true;
    stage.world.add(mesh);
    enemies.push({ mesh, hp, maxHp: hp, segIdx: 0, segT: 0 });
  }

  function startWave() {
    wave++;
    waveEl.textContent = wave;
    waveActive = true;
    enemiesToSpawn = 4 + wave;
    spawnTimer = 0;
    say(`Wave ${wave} of ${cfg.waves} is coming!`);
  }
  say('Build towers next to the path!', 2400);
  later(startWave, 2600);

  function winGame() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const stars = lives >= cfg.lives * 0.8 ? 3 : lives >= cfg.lives * 0.4 ? 2 : 1;
    api.sound.win();
    later(() => api.win(stars, { lives }), 300);
  }
  function loseGame() {
    finished = true;
    later(() => {
      api.lose('your base was overrun! Try again.');
      const over = document.createElement('div');
      over.className = 'td-over';
      over.innerHTML = `<div>Too many got through on wave ${wave}.</div><button class="pc-btn pc-btn--blue">Try again</button>`;
      over.querySelector('button').addEventListener('click', () => { api.sound.click(); restart(); });
      canvasHost.appendChild(over);
    }, 250);
  }

  let lastTime = performance.now();
  const unsubTick = stage.onTick(() => {
    if (finished) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;

    if (waveActive && enemiesToSpawn > 0) {
      spawnTimer += dt * 1000;
      if (spawnTimer >= 550) { spawnTimer = 0; spawnEnemy(); enemiesToSpawn--; }
    }

    // move enemies along path
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      en.segT += (cfg.enemySpeed * dt) / 1;
      while (en.segT >= 1 && en.segIdx < pathWorld.length - 1) { en.segT -= 1; en.segIdx++; }
      if (en.segIdx >= pathWorld.length - 1) {
        stage.world.remove(en.mesh); en.mesh.geometry.dispose(); en.mesh.material.dispose();
        enemies.splice(i, 1);
        lives--;
        livesEl.textContent = lives;
        api.ui.shake(canvasHost);
        if (lives <= 0) { loseGame(); return; }
        continue;
      }
      const a = pathWorld[en.segIdx], b = pathWorld[Math.min(en.segIdx + 1, pathWorld.length - 1)];
      en.mesh.position.x = a.x + (b.x - a.x) * en.segT;
      en.mesh.position.y = a.y + (b.y - a.y) * en.segT;
    }

    // towers fire
    towers.forEach((t) => {
      t.cooldown -= dt * 1000;
      if (t.cooldown > 0) return;
      let target = null, bestDist = TOWER_RANGE;
      enemies.forEach((en) => {
        const d = Math.hypot(en.mesh.position.x - t.x, en.mesh.position.y - t.y);
        if (d <= bestDist) { bestDist = d; target = en; }
      });
      if (target) {
        t.cooldown = TOWER_RATE;
        target.hp -= TOWER_DMG;
        tween(target.mesh.material, { emissiveIntensity: 0.8 }, 80, Easing.outCubic, () => tween(target.mesh.material, { emissiveIntensity: 0.15 }, 200));
        tween(t.mesh.scale, { x: 1.25, y: 1.25, z: 1.25 }, 80, Easing.outCubic, () => tween(t.mesh.scale, { x: 1, y: 1, z: 1 }, 150));
        if (target.hp <= 0) {
          const idx = enemies.indexOf(target);
          if (idx !== -1) {
            stage.world.remove(target.mesh); target.mesh.geometry.dispose(); target.mesh.material.dispose();
            enemies.splice(idx, 1);
            budget += 1;
            budgetEl.textContent = budget;
            api.sound.match();
          }
        }
      }
    });

    if (waveActive && enemiesToSpawn <= 0 && enemies.length === 0) {
      waveActive = false;
      budget += 2;
      budgetEl.textContent = budget;
      if (wave >= cfg.waves) { winGame(); return; }
      say(wave + 1 < cfg.waves ? 'Wave cleared! +2 coins' : 'Last wave next! +2 coins');
      later(startWave, 1800);
    }
  });

  // Hint: the free square whose tower would cover the most path squares.
  function hint() {
    if (finished) return;
    let best = null, bestCover = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const key = r * cols + c;
      if (pathSet.has(key) || towers.has(key)) continue;
      const { x, y } = cellPos(r, c);
      const cover = pathWorld.filter((p) => Math.hypot(p.x - x, p.y - y) <= TOWER_RANGE).length;
      if (cover > bestCover) { bestCover = cover; best = { r, c, x, y }; }
    }
    if (!best) { say('Every good square already has a tower!'); return; }
    const mesh = cellMeshes.get(best.r * cols + best.c);
    mesh.material.emissive.set(0xffd93d);
    tween(mesh.material, { emissiveIntensity: 0.8 }, 150, Easing.outCubic, () => tween(mesh.material, { emissiveIntensity: 0 }, 900));
    const ring = new THREE.Mesh(new THREE.RingGeometry(TOWER_RANGE - 0.05, TOWER_RANGE, 40), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.7, toneMapped: false }));
    ring.position.set(best.x, best.y, 0.12);
    stage.world.add(ring);
    tween(ring.material, { opacity: 0 }, 1600, Easing.inOutQuad, () => { if (!alive) return; stage.world.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
    say(budget >= cfg.towerCost ? 'Build on the glowing square - it guards lots of path' : `Save up ${cfg.towerCost} coins, then build on the glowing square`, 2200);
  }

  return {
    unmount: () => {
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      if (bannerTimer) clearTimeout(bannerTimer);
      unsubTick();
      stage.renderer.domElement.removeEventListener('pointerdown', onCanvasTap);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('towerdefense', { mount });
