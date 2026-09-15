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
const PAD_SIZE = 0.9;

function starsForRound(round, target) {
  if (round >= target) return 3;
  if (round >= target * 0.6) return 2;
  return 1;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const n = cfg.pads;
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
  const radius = 1.7;

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
      setTimeout(step, delay);
    }
    setTimeout(step, 400);
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
    setTimeout(() => litDown(i), 140);
    api.sound.select();
    if (sequence[inputIndex] === i) {
      inputIndex++;
      if (inputIndex === sequence.length) {
        accepting = false;
        api.sound.match();
        api.ui.burstFromElement(canvasHost, { count: 12 });
        if (round >= cfg.targetRounds) {
          finished = true;
          const stars = starsForRound(round, cfg.targetRounds);
          setTimeout(() => api.win(stars, { round }), 350);
        } else {
          setTimeout(nextRound, 500);
        }
      }
    } else {
      accepting = false;
      finished = true;
      api.sound.error();
      api.ui.shake(canvasHost);
      statusEl.textContent = 'Wrong pad! Try again.';
      api.lose('Sequence broken - try again!');
    }
  }

  function onPointerDown(e) {
    const hit = stage.pick(e.clientX, e.clientY, pads);
    if (!hit) return;
    onPad(pads.indexOf(hit.object));
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  nextRound();

  function hint() {
    if (!accepting || finished) return;
    const nextPad = sequence[inputIndex];
    litUp(nextPad, 0.9, 1.3, 260);
    setTimeout(() => litDown(nextPad), 550);
    api.ui.toast(`${api.playerName}, that glowing pad is next!`);
  }

  return {
    unmount: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('simon', { mount });
