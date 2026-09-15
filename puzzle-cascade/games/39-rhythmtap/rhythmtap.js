/**
 * Game 39 - Rhythm Tap. Colored tiles scroll down 3-4 lanes toward a
 * hit-line; tap the lane the moment a tile crosses it. Hit the target
 * accuracy across the whole sequence to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { lanes: 3, travelMs: 1500, beatMs: 780, length: 18, windowMs: 260, targetAcc: 0.6 },
  medium: { lanes: 4, travelMs: 1150, beatMs: 580, length: 26, windowMs: 210, targetAcc: 0.7 },
  hard: { lanes: 4, travelMs: 900, beatMs: 440, length: 34, windowMs: 165, targetAcc: 0.8 },
};

const LANE_W = 0.95;
const TRACK_LEN = 7.5;
const TOP_Y = TRACK_LEN / 2;
const HIT_Y = -TRACK_LEN / 2 + 0.9;
const TILE_H = 0.55;

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const lanes = cfg.lanes;
  const notes = Array.from({ length: cfg.length }, (_, i) => ({ lane: Math.floor(Math.random() * lanes), spawnAt: i * cfg.beatMs, spawned: false, resolved: false, mesh: null, y: TOP_Y }));
  const worldSpeed = (TOP_Y - HIT_Y) / (cfg.travelMs / 1000);
  const tolDist = (worldSpeed * cfg.windowMs) / 1000;

  let hits = 0, misses = 0, combo = 0, maxCombo = 0, finished = false, elapsed = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="rt-meta"><span>Combo: <span id="rt-combo">0</span></span><span>Hits: <span id="rt-hits">0</span>/${cfg.length}</span></div>
    <div class="pc-canvas3d" id="rt-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a lane the instant a tile crosses the line</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#rt-canvas');
  const comboEl = wrap.querySelector('#rt-combo');
  const hitsEl = wrap.querySelector('#rt-hits');

  const totalW = lanes * LANE_W, totalH = TRACK_LEN;
  const halfW = totalW / 2 + 0.5, halfH = totalH / 2 + 0.5;
  const distance = Math.max(halfH / 0.42, halfW / (0.42 * 0.5));
  const stage = createStage(canvasHost, { distance });

  function laneX(l) { return (l - (lanes - 1) / 2) * LANE_W; }

  // lane backgrounds + hit line
  for (let l = 0; l < lanes; l++) {
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 0.92, TRACK_LEN), new THREE.MeshStandardMaterial({ color: l % 2 === 0 ? 0x241247 : 0x2c1656, roughness: 0.8 }));
    bg.position.set(laneX(l), 0, -0.15);
    stage.world.add(bg);
  }
  const hitLine = new THREE.Mesh(new THREE.PlaneGeometry(totalW, 0.06), new THREE.MeshBasicMaterial({ color: 0xffd93d }));
  hitLine.position.set(0, HIT_Y, -0.05);
  stage.world.add(hitLine);
  const laneFlashes = [];
  for (let l = 0; l < lanes; l++) {
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 0.92, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    flash.position.set(laneX(l), HIT_Y, -0.04);
    stage.world.add(flash);
    laneFlashes.push(flash);
  }

  function spawnNote(note) {
    const mesh = makeTile({ w: LANE_W * 0.8, h: TILE_H, depth: 0.22, radius: 0.1, color: PALETTE[note.lane % PALETTE.length] });
    mesh.position.set(laneX(note.lane), TOP_Y, 0);
    stage.world.add(mesh);
    popIn(mesh, { duration: 150 });
    note.mesh = mesh;
    note.spawned = true;
  }

  function resolveMiss(note) {
    note.resolved = true;
    misses++;
    combo = 0;
    comboEl.textContent = combo;
    if (note.mesh) { tween(note.mesh.material, { opacity: 0 }, 200, Easing.outCubic); note.mesh.material.transparent = true; }
    checkDone();
  }

  function flashLane(l, color) {
    const f = laneFlashes[l];
    f.material.color.set(color);
    f.material.opacity = 0.5;
    tween(f.material, { opacity: 0 }, 220, Easing.outCubic);
  }

  function tapLane(l) {
    if (finished) return;
    const candidate = notes.find((n) => n.spawned && !n.resolved && n.lane === l && Math.abs(n.y - HIT_Y) <= tolDist);
    if (candidate) {
      candidate.resolved = true;
      hits++; combo++; maxCombo = Math.max(maxCombo, combo);
      hitsEl.textContent = hits;
      comboEl.textContent = combo;
      api.sound.click();
      flashLane(l, 0x23d18b);
      if (candidate.mesh) {
        tween(candidate.mesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 120, Easing.outCubic);
        tween(candidate.mesh.material, { opacity: 0 }, 180, Easing.outCubic);
        candidate.mesh.material.transparent = true;
      }
      checkDone();
    } else {
      flashLane(l, 0xff4d8d);
      combo = 0;
      comboEl.textContent = combo;
      api.sound.error();
    }
  }

  function onTap(e) {
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!world) return;
    let best = 0, bestD = Infinity;
    for (let l = 0; l < lanes; l++) { const d = Math.abs(world.x - laneX(l)); if (d < bestD) { bestD = d; best = l; } }
    tapLane(best);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onTap);

  function checkDone() {
    if (notes.every((n) => n.resolved)) finishGame();
  }

  function finishGame() {
    if (finished) return;
    finished = true;
    const acc = hits / cfg.length;
    if (acc >= cfg.targetAcc) {
      api.ui.burstFromElement(canvasHost);
      api.sound.win();
      const stars = acc >= 0.95 ? 3 : acc >= cfg.targetAcc + 0.1 ? 2 : 1;
      setTimeout(() => api.win(stars, { accuracy: Math.round(acc * 100), maxCombo }), 300);
    } else {
      setTimeout(() => api.lose(`only ${Math.round(acc * 100)}% accuracy - needed ${Math.round(cfg.targetAcc * 100)}%.`), 250);
    }
  }

  let lastTime = performance.now();
  const unsubTick = stage.onTick(() => {
    if (finished) return;
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;
    elapsed += dt;

    notes.forEach((n) => {
      if (!n.spawned && elapsed >= n.spawnAt) spawnNote(n);
      if (n.spawned && !n.resolved) {
        n.y -= (worldSpeed * dt) / 1000;
        n.mesh.position.y = n.y;
        if (n.y < HIT_Y - tolDist) resolveMiss(n);
      }
    });
  });

  function hint() {
    if (finished) return;
    const next = notes.find((n) => n.spawned && !n.resolved);
    if (!next) return;
    flashLane(next.lane, 0xffd93d);
    api.ui.toast(`${api.playerName}, watch lane ${next.lane + 1}!`);
  }

  return {
    unmount: () => {
      finished = true;
      unsubTick();
      stage.renderer.domElement.removeEventListener('pointerdown', onTap);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('rhythmtap', { mount });
