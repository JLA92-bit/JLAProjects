/**
 * Game 39 - Rhythm Tap. Colored tiles scroll down 3-4 lanes toward a
 * hit-line; tap the lane the moment a tile crosses it. Hit the target
 * accuracy across the whole sequence to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  // windowMs: how early a tap still counts; late taps get 1.3x that, since
  // touch input always arrives a little after the finger lands.
  easy: { lanes: 3, travelMs: 1600, beatMs: 800, length: 18, windowMs: 300, targetAcc: 0.6 },
  medium: { lanes: 4, travelMs: 1250, beatMs: 600, length: 26, windowMs: 240, targetAcc: 0.65 },
  hard: { lanes: 4, travelMs: 1000, beatMs: 460, length: 34, windowMs: 190, targetAcc: 0.75 },
};

const LANE_W = 0.95;
const TRACK_LEN = 7.5;
const TOP_Y = TRACK_LEN / 2;
const HIT_Y = -TRACK_LEN / 2 + 0.9;
const TILE_H = 0.55;

const LEAD_IN_MS = 900;
const LATE_FACTOR = 1.3;

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
  const lanes = cfg.lanes;
  // each note is judged by time: it reaches the line at hitAt (game ms)
  const notes = Array.from({ length: cfg.length }, (_, i) => {
    const spawnAt = LEAD_IN_MS + i * cfg.beatMs;
    return { lane: Math.floor(Math.random() * lanes), spawnAt, hitAt: spawnAt + cfg.travelMs, spawned: false, resolved: false, mesh: null, y: TOP_Y };
  });
  const worldSpeed = (TOP_Y - HIT_Y) / (cfg.travelMs / 1000);
  const earlyMs = cfg.windowMs, lateMs = cfg.windowMs * LATE_FACTOR;

  let hits = 0, misses = 0, combo = 0, maxCombo = 0, finished = false, elapsed = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="rt-meta"><span>Combo: <span id="rt-combo">0</span></span><span>Hits: <span id="rt-hits">0</span>/${cfg.length}</span></div>
    <div class="pc-canvas3d" id="rt-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap the lane as a tile reaches the yellow line</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#rt-canvas');
  const comboEl = wrap.querySelector('#rt-combo');
  const hitsEl = wrap.querySelector('#rt-hits');

  const totalW = lanes * LANE_W, totalH = TRACK_LEN;
  const halfW = totalW / 2 + 0.2, halfH = totalH / 2 + 0.1;
  const stage = createStage(canvasHost, fitView(canvasHost, halfW, halfH, { reserveBottom: 50 }));

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
  // soft band showing the whole "counts as a hit" zone around the line
  const zoneTop = HIT_Y + (worldSpeed * earlyMs) / 1000, zoneBottom = HIT_Y - (worldSpeed * lateMs) / 1000;
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(totalW, zoneTop - zoneBottom), new THREE.MeshBasicMaterial({ color: 0xffd93d, transparent: true, opacity: 0.07, toneMapped: false }));
  zone.position.set(0, (zoneTop + zoneBottom) / 2, -0.07);
  stage.world.add(zone);
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

  function tapLane(l, tapMs) {
    if (finished) return;
    // the closest unresolved note in this lane whose timing is in the window
    let candidate = null, bestD = Infinity;
    notes.forEach((n) => {
      if (!n.spawned || n.resolved || n.lane !== l) return;
      const d = tapMs - n.hitAt; // negative = early, positive = late
      if (d < -earlyMs || d > lateMs) return;
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); candidate = n; }
    });
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
    if (finished) return;
    e.preventDefault();
    // game time right now (between frames), not as of the last frame
    const tapMs = elapsed + Math.min(50, performance.now() - lastTime);
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!world) return;
    let best = 0, bestD = Infinity;
    for (let l = 0; l < lanes; l++) { const d = Math.abs(world.x - laneX(l)); if (d < bestD) { bestD = d; best = l; } }
    tapLane(best, tapMs);
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
      later(() => api.win(stars, { accuracy: Math.round(acc * 100), maxCombo }), 300);
    } else {
      later(() => {
        api.lose(`only ${Math.round(acc * 100)}% accuracy - needed ${Math.round(cfg.targetAcc * 100)}%.`);
        const over = document.createElement('div');
        over.className = 'rt-over';
        over.innerHTML = `<div>You hit ${hits} of ${cfg.length}.<br>Need ${Math.ceil(cfg.targetAcc * cfg.length)} to win.</div><button class="pc-btn pc-btn--blue">Try again</button>`;
        over.querySelector('button').addEventListener('click', () => { api.sound.click(); restart(); });
        canvasHost.appendChild(over);
      }, 250);
    }
  }

  // Game clock advances by real frame time, clamped: if the app is paused
  // or backgrounded the song simply pauses instead of skipping notes.
  let lastTime = performance.now();
  const unsubTick = stage.onTick(() => {
    const now = performance.now();
    const dt = Math.min(50, Math.max(0, now - lastTime));
    lastTime = now;
    if (finished) return;
    elapsed += dt;

    notes.forEach((n) => {
      if (!n.spawned && elapsed >= n.spawnAt) spawnNote(n);
      if (n.spawned && !n.resolved) {
        n.y = HIT_Y + ((n.hitAt - elapsed) / 1000) * worldSpeed;
        n.mesh.position.y = n.y;
        if (elapsed - n.hitAt > lateMs) resolveMiss(n);
      }
    });
  });

  function hint() {
    if (finished) return;
    const next = notes.find((n) => !n.resolved);
    if (!next) return;
    flashLane(next.lane, 0xffd93d);
    api.ui.toast(`${api.playerName}, tap when a tile sits inside the yellow band - not too early!`);
  }

  return {
    unmount: () => {
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      unsubTick();
      stage.renderer.domElement.removeEventListener('pointerdown', onTap);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('rhythmtap', { mount });
