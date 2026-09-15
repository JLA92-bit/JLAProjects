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

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
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
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap an open cell near the path to build (cost ${cfg.towerCost})</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#td-canvas');
  const livesEl = wrap.querySelector('#td-lives');
  const budgetEl = wrap.querySelector('#td-budget');
  const waveEl = wrap.querySelector('#td-wave');

  const totalW = cols * CELL, totalH = rows * CELL;
  const halfW = totalW / 2 + 0.6, halfH = totalH / 2 + 0.6;
  const distance = Math.max(halfH / 0.42, halfW / (0.42 * 0.5));
  const stage = createStage(canvasHost, { distance });

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
    if (pathSet.has(key) || towers.has(key)) return;
    if (budget < cfg.towerCost) { api.ui.toast(`${api.playerName}, not enough coins yet!`); return; }
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
    api.ui.toast(`Wave ${wave} incoming!`);
  }
  setTimeout(startWave, 900);

  function winGame() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const stars = lives >= cfg.lives * 0.8 ? 3 : lives >= cfg.lives * 0.4 ? 2 : 1;
    api.sound.win();
    setTimeout(() => api.win(stars, { lives }), 300);
  }
  function loseGame() {
    finished = true;
    setTimeout(() => api.lose('your base was overrun! Try again.'), 250);
  }

  let lastTime = performance.now();
  const unsubTick = stage.onTick(() => {
    if (finished) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
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
      setTimeout(startWave, 1400);
    }
  });

  function hint() {
    if (finished) return;
    // find first path cell without an adjacent tower, suggest an open neighbor
    for (const [r, c] of path) {
      const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const key = nr * cols + nc;
        if (!pathSet.has(key) && !towers.has(key)) {
          const mesh = cellMeshes.get(key);
          tween(mesh.material, { emissiveIntensity: 0.7 }, 150, Easing.outCubic, () => tween(mesh.material, { emissiveIntensity: 0 }, 500));
          api.ui.toast(`${api.playerName}, that glowing cell covers the path well!`);
          return;
        }
      }
    }
    api.ui.toast(`${api.playerName}, you've covered the path nicely already!`);
  }

  return {
    unmount: () => {
      finished = true;
      unsubTick();
      stage.renderer.domElement.removeEventListener('pointerdown', onCanvasTap);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('towerdefense', { mount });
