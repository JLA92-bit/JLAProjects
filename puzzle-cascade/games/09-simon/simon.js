/**
 * Game 9 - Pattern Memory / Simon (3D). Glowing pads play a growing,
 * speeding-up sequence; repeat it correctly to advance rounds.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { pads: 4, targetRounds: 8, baseDelay: 650, minDelay: 380, decrement: 22 },
  medium: { pads: 5, targetRounds: 12, baseDelay: 560, minDelay: 300, decrement: 20 },
  hard: { pads: 6, targetRounds: 16, baseDelay: 480, minDelay: 240, decrement: 18 },
};
const PAD_COLORS = [0xff4d8d, 0xff9f43, 0xffd93d, 0x23d18b, 0x3f8efc, 0xa259ff];
const PAD_SIZE = 1.2;
const RING_RADIUS = 1.75;

/* ---- per-game helpers (kept local so the module stands alone) ---- */

// Zoom/pan the ortho camera so a w x h world box centered on (cx, cy) fits
// the canvas with pixel padding (more at the bottom for the overlay chip).
// Re-checked every frame so it follows resizes and rotation.
function fitBoard(stage, host, w, h, { cx = 0, cy = 0, pad = 12, top = 12, bottom = 12 } = {}) {
  const cam = stage.camera;
  let lastW = 0, lastH = 0;
  function apply() {
    const cw = host.clientWidth, ch = host.clientHeight;
    if (!cw || !ch || (cw === lastW && ch === lastH)) return;
    lastW = cw; lastH = ch;
    const unitPx = ch / (cam.top - cam.bottom);
    const fit = Math.max(1, Math.min((cw - 2 * pad) / w, (ch - top - bottom) / h));
    cam.zoom = fit / unitPx;
    cam.position.x = cx;
    cam.position.y = cy - (bottom - top) / 2 / fit;
    cam.updateProjectionMatrix();
  }
  apply();
  return stage.onTick(apply);
}

// Timers that can never fire after unmount.
function lifecycle() {
  const timers = new Set();
  const life = {
    dead: false,
    later(fn, ms) { const id = setTimeout(() => { timers.delete(id); if (!life.dead) fn(); }, ms); timers.add(id); return id; },
    kill() { life.dead = true; timers.forEach(clearTimeout); timers.clear(); },
  };
  return life;
}

// A wrong tap just replays the pattern, so stars count the slips.
function starsForMistakes(mistakes) {
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const n = cfg.pads;
  const life = lifecycle();
  let mistakes = 0;
  let sequence = [];
  let inputIndex = 0;
  let round = 0;
  let playing = false;
  let finished = false;
  let accepting = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sm-meta"><span>Round: <span id="sm-round">0</span> / ${cfg.targetRounds}</span></div>
    <div class="pc-canvas3d" id="sm-canvas">
      <div class="pc-overlay-top"><span class="pc-chip" id="sm-status">Watch the pattern...</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#sm-canvas');
  const roundEl = wrap.querySelector('#sm-round');
  const statusEl = wrap.querySelector('#sm-status');

  const stage = createStage(canvasHost, { distance: 5.4 });
  const extent = (RING_RADIUS + PAD_SIZE / 2) * 2 + 0.3;
  fitBoard(stage, canvasHost, extent, extent, { top: 50, bottom: 16 });
  const radius = RING_RADIUS;

  const pads = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const mesh = makeTile({ w: PAD_SIZE, h: PAD_SIZE, depth: 0.26, radius: 0.18, color: PAD_COLORS[i], emissive: PAD_COLORS[i], emissiveIntensity: 0.05 });
    mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 40 });
    pads.push(mesh);
  }

  function litUp(i, intensity, scale, duration = 160) {
    tween(pads[i].material, { emissiveIntensity: intensity }, duration, Easing.outCubic);
    tween(pads[i].scale, { x: scale, y: scale, z: scale }, duration, Easing.outBack);
  }
  function litDown(i) { litUp(i, 0.05, 1, 160); }

  function currentDelay() { return Math.max(cfg.minDelay, cfg.baseDelay - round * cfg.decrement); }

  function playSequence() {
    playing = true; accepting = false;
    statusEl.textContent = 'Watch the pattern...';
    let i = 0;
    const delay = currentDelay();
    function step() {
      if (i > 0) litDown(sequence[i - 1]);
      if (i >= sequence.length) {
        playing = false; accepting = true; inputIndex = 0;
        statusEl.textContent = 'Your turn!';
        return;
      }
      const pad = sequence[i];
      litUp(pad, 0.9, 1.18, delay * 0.55);
      api.sound.select();
      i++;
      life.later(step, delay);
    }
    life.later(step, 500);
  }

  function nextRound() {
    round++;
    roundEl.textContent = round;
    sequence.push(Math.floor(Math.random() * n));
    playSequence();
  }

  function onPad(i) {
    if (!accepting || finished) return;
    litUp(i, 0.9, 1.15, 90);
    life.later(() => litDown(i), 160);
    api.sound.select();
    if (sequence[inputIndex] === i) {
      inputIndex++;
      if (inputIndex === sequence.length) {
        accepting = false;
        api.sound.match();
        api.ui.burstFromElement(canvasHost, { count: 12 });
        if (round >= cfg.targetRounds) {
          finished = true;
          statusEl.textContent = 'You did it!';
          const stars = starsForMistakes(mistakes);
          life.later(() => api.win(stars, { round, mistakes }), 350);
        } else {
          statusEl.textContent = 'Nice! Next round...';
          life.later(nextRound, 600);
        }
      }
    } else {
      // Forgiving: no game over - show the same pattern again.
      accepting = false;
      mistakes++;
      api.sound.error();
      api.ui.shake(canvasHost);
      statusEl.textContent = 'Oops! Watch again...';
      api.ui.toast(`${api.playerName}, not quite - watch the pattern once more!`);
      life.later(playSequence, 900);
    }
  }

  function onPointerDown(e) {
    if (!accepting || finished) return;
    // nearest pad within reach - more forgiving than an exact raycast
    const pt = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!pt) return;
    let best = -1, bestD = PAD_SIZE * 0.9;
    pads.forEach((m, i) => { const d = Math.hypot(m.position.x - pt.x, m.position.y - pt.y); if (d < bestD) { bestD = d; best = i; } });
    if (best >= 0) onPad(best);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  nextRound();

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, you finished every round!`); return; }
    if (!accepting) { api.ui.toast(`${api.playerName}, watch the pads light up first!`); return; }
    const nextPad = sequence[inputIndex];
    litUp(nextPad, 0.9, 1.3, 260);
    life.later(() => litDown(nextPad), 550);
    api.ui.toast(`${api.playerName}, that glowing pad is next!`);
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('simon', { mount });
