/**
 * Game 2 - Memory Match (3D). Cards are tiles that "flip" via a quick
 * squash-and-swap (scale to 0 on X, swap the face texture, bounce back) -
 * reads as a flip without needing true backface geometry.
 */
import * as THREE from 'three';
import { createStage, makeTile, makeTextSprite, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { pairs: 6, cols: 4 },
  medium: { pairs: 8, cols: 4 },
  hard: { pairs: 12, cols: 4 }, // 4x6 - portrait phones
};
const ICON_POOL = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍑', '🍍', '🥝', '🍒', '🫐', '🍐', '🍬', '🍩', '🍭', '🍪', '🥭', '🍮', '🍡'];
const CARD_SIZE = 0.92;
const SPACING = 1.02;

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

function glow(mesh, color = 0xffffff) {
  if (!mesh || !mesh.material || !mesh.material.emissive) return;
  mesh.material.emissive.set(color);
  mesh.material.emissiveIntensity = 0.7;
  tween(mesh.material, { emissiveIntensity: 0 }, 900, Easing.inOutQuad);
  tween(mesh.scale, { x: 1.18, y: 1.18, z: 1.18 }, 160, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
}

function starsForAttempts(pairs, attempts) {
  // A player with perfect recall still averages ~1.6 attempts per pair.
  const perfect = Math.round(pairs * 1.6);
  const good = Math.round(pairs * 2.5);
  if (attempts <= perfect) return 3;
  if (attempts <= good) return 2;
  return 1;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const rows = Math.ceil((cfg.pairs * 2) / cfg.cols);
  const icons = shuffle(ICON_POOL).slice(0, cfg.pairs);
  const deck = shuffle(icons.concat(icons)).map((icon, i) => ({ id: i, icon, flipped: false, matched: false }));

  const life = lifecycle();
  let attempts = 0, matchedPairs = 0, lock = false, firstPick = null, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="mm-meta"><span>Attempts: <span id="mm-attempts">0</span></span><span>Pairs: <span id="mm-pairs">0</span>/${cfg.pairs}</span></div>
    <div class="pc-canvas3d" id="mm-canvas"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#mm-canvas');
  const attemptsEl = wrap.querySelector('#mm-attempts');
  const pairsEl = wrap.querySelector('#mm-pairs');

  const stage = createStage(canvasHost, { distance: Math.max(cfg.cols, rows) * 2.3 });
  fitBoard(stage, canvasHost, (cfg.cols - 1) * SPACING + CARD_SIZE, (rows - 1) * SPACING + CARD_SIZE);

  function cellXY(idx) {
    const row = Math.floor(idx / cfg.cols), col = idx % cfg.cols;
    const halfC = (cfg.cols - 1) / 2, halfR = (rows - 1) / 2;
    return { x: (col - halfC) * SPACING, y: (halfR - row) * SPACING };
  }

  const meshes = [];
  deck.forEach((card, idx) => {
    const { x, y } = cellXY(idx);
    const mesh = makeTile({ w: CARD_SIZE, h: CARD_SIZE, depth: 0.16, radius: 0.14, color: 0x6a2dd6 });
    mesh.material.envMapIntensity = 0.35; // keeps the pale card faces from blooming out
    mesh.position.set(x, y, 0);
    const label = makeFaceLabel(mesh, '?', 0xfff);
    mesh.userData = { id: card.id, label };
    stage.world.add(mesh);
    popIn(mesh, { delay: idx * 30 });
    meshes.push(mesh);
  });

  function makeFaceLabel(mesh, text, color) {
    const tex = makeTextSprite(text, { size: 128, color: '#ffffff' });
    tex.generateMipmaps = false;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
    const geo = new THREE.PlaneGeometry(CARD_SIZE * 0.6, CARD_SIZE * 0.6);
    const plane = new THREE.Mesh(geo, mat);
    plane.position.z = 0.16 / 2 + 0.02;
    plane.renderOrder = 10;
    mesh.add(plane);
    return { plane, setText: (t) => { plane.material.map.dispose(); const nt = makeTextSprite(t, { size: 160, color: '#ffffff' }); nt.generateMipmaps = false; plane.material.map = nt; plane.material.needsUpdate = true; } };
  }

  function flipVisual(mesh, showIcon, iconText, faceColor = 0xfffaf2) {
    tween(mesh.scale, { x: 0.03 }, 110, Easing.inOutQuad, () => {
      if (life.dead) return;
      mesh.userData.label.setText(showIcon ? iconText : '?');
      mesh.material.color.set(showIcon ? faceColor : 0x6a2dd6);
      tween(mesh.scale, { x: 1 }, 160, Easing.outBack);
    });
  }

  function onPointerDown(e) {
    if (lock || finished) return;
    const hit = stage.pick(e.clientX, e.clientY, meshes);
    if (!hit) return;
    onPick(hit.object);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function onPick(mesh) {
    const card = deck.find((c) => c.id === mesh.userData.id);
    if (!card || card.flipped || card.matched) return;
    card.flipped = true;
    api.sound.select();
    flipVisual(mesh, true, card.icon);

    if (!firstPick) { firstPick = { card, mesh }; return; }

    attempts++;
    attemptsEl.textContent = attempts;
    lock = true;
    const first = firstPick;
    firstPick = null;

    if (first.card.icon === card.icon) {
      first.card.matched = true; card.matched = true;
      matchedPairs++;
      pairsEl.textContent = matchedPairs;
      api.sound.match();
      life.later(() => {
        // matched pairs settle on a soft mint face so they read as "done"
        [first.mesh, mesh].forEach((m) => { m.material.color.set(0xc9f7df); });
        api.ui.burstFromElement(canvasHost, { count: 16 });
        lock = false;
        if (matchedPairs === cfg.pairs) {
          finished = true;
          const stars = starsForAttempts(cfg.pairs, attempts);
          life.later(() => api.win(stars, { attempts }), 250);
        }
      }, 300);
    } else {
      api.sound.error();
      life.later(() => {
        first.card.flipped = false; card.flipped = false;
        flipVisual(first.mesh, false); flipVisual(mesh, false);
        lock = false;
      }, 700);
    }
  }

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, you found them all!`); return; }
    if (lock) return;
    const candidates = deck.filter((c) => !c.matched && !c.flipped && (!firstPick || c.id !== firstPick.card.id));
    const byIcon = {};
    candidates.forEach((c) => { (byIcon[c.icon] = byIcon[c.icon] || []).push(c); });
    const pairEntry = Object.values(byIcon).find((arr) => arr.length >= 2);
    if (!pairEntry) { api.ui.toast(`${api.playerName}, no safe hint right now - keep going!`); return; }
    const [a, b] = pairEntry;
    const meshA = meshes.find((m) => m.userData.id === a.id);
    const meshB = meshes.find((m) => m.userData.id === b.id);
    flipVisual(meshA, true, a.icon);
    flipVisual(meshB, true, b.icon);
    api.ui.toast(`${api.playerName}, remember these two!`);
    life.later(() => {
      if (!a.matched && !a.flipped) flipVisual(meshA, false);
      if (!b.matched && !b.flipped) flipVisual(meshB, false);
    }, 1000);
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

PC.Games.register('memory', { mount });
