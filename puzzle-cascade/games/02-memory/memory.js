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
  hard: { pairs: 12, cols: 6 },
};
const ICON_POOL = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍑', '🍍', '🥝', '🍒', '🫐', '🍐', '🍬', '🍩', '🍭', '🍪', '🥭', '🍮', '🍡'];
const CARD_SIZE = 0.92;
const SPACING = 1.02;

function starsForAttempts(pairs, attempts) {
  const perfect = pairs + 1;
  const good = Math.round(pairs * 1.6);
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

  let attempts = 0, matchedPairs = 0, lock = false, firstPick = null;

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

  function cellXY(idx) {
    const row = Math.floor(idx / cfg.cols), col = idx % cfg.cols;
    const halfC = (cfg.cols - 1) / 2, halfR = (rows - 1) / 2;
    return { x: (col - halfC) * SPACING, y: (halfR - row) * SPACING };
  }

  const meshes = [];
  deck.forEach((card, idx) => {
    const { x, y } = cellXY(idx);
    const mesh = makeTile({ w: CARD_SIZE, h: CARD_SIZE, depth: 0.16, radius: 0.14, color: 0x6a2dd6 });
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

  function flipVisual(mesh, showIcon, iconText) {
    tween(mesh.scale, { x: 0.03 }, 110, Easing.inOutQuad, () => {
      mesh.userData.label.setText(showIcon ? iconText : '?');
      mesh.material.color.set(showIcon ? 0xfffaf2 : 0x6a2dd6);
      tween(mesh.scale, { x: 1 }, 160, Easing.outBack);
    });
  }

  function onPointerDown(e) {
    if (lock) return;
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
      setTimeout(() => {
        api.ui.burstFromElement(canvasHost, { count: 16 });
        lock = false;
        if (matchedPairs === cfg.pairs) {
          const stars = starsForAttempts(cfg.pairs, attempts);
          setTimeout(() => api.win(stars, { attempts }), 250);
        }
      }, 120);
    } else {
      api.sound.error();
      setTimeout(() => {
        first.card.flipped = false; card.flipped = false;
        flipVisual(first.mesh, false); flipVisual(mesh, false);
        lock = false;
      }, 700);
    }
  }

  return () => {
    stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    stage.dispose();
    wrap.remove();
  };
}

PC.Games.register('memory', { mount });
