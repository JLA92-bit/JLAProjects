/**
 * Game 40 - Domino Match. A spread of face-up dominoes; tap two that
 * share a matching number on either half to clear them, mahjong-pairs
 * style. Clear the whole board to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { count: 12, cols: 3, maxPip: 3 },
  medium: { count: 16, cols: 4, maxPip: 4 },
  hard: { count: 20, cols: 4, maxPip: 5 },
};

const TILE_W = 1.15, TILE_H = 0.62, GAP = 0.16;

function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function shareValue(a, b) { return a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b; }

function hasAnyMatch(tiles) {
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) if (shareValue(tiles[i], tiles[j])) return true;
  return false;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const cols = cfg.cols;
  const rows = Math.ceil(cfg.count / cols);

  const all = [];
  for (let a = 0; a <= cfg.maxPip; a++) for (let b = a; b <= cfg.maxPip; b++) all.push({ a, b });
  let deck = shuffle(all);
  while (deck.length < cfg.count) deck = deck.concat(shuffle(all));
  const tiles = shuffle(deck).slice(0, cfg.count).map((d, i) => ({ ...d, id: i, cleared: false }));

  let selected = null, mistakes = 0, cleared = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="dm-meta">Cleared: <span id="dm-cleared">0</span>/${cfg.count} &nbsp; Mistakes: <span id="dm-mistakes">0</span></div>
    <div class="pc-canvas3d" id="dm-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap two dominoes that share a number</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#dm-canvas');
  const clearedEl = wrap.querySelector('#dm-cleared');
  const mistakesEl = wrap.querySelector('#dm-mistakes');

  const totalW = cols * (TILE_W + GAP) - GAP;
  const totalH = rows * (TILE_H + GAP) - GAP;
  const halfW = totalW / 2 + 0.5, halfH = totalH / 2 + 0.5;
  const distance = Math.max(halfH / 0.42, halfW / (0.42 * 0.5));
  const stage = createStage(canvasHost, { distance });

  function slotPos(i) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = -(totalW - TILE_W) / 2 + c * (TILE_W + GAP);
    const y = (totalH - TILE_H) / 2 - r * (TILE_H + GAP);
    return { x, y };
  }

  tiles.forEach((t, i) => {
    const { x, y } = slotPos(i);
    const mesh = makeTile({ w: TILE_W, h: TILE_H, depth: 0.22, radius: 0.1, color: 0x5a3fa8, emissive: 0xffd93d, emissiveIntensity: 0, roughness: 0.55, metalness: 0.05 });
    mesh.position.set(x, y, 0);
    const labelA = applyLabel(mesh, String(t.a), { size: 80, w: TILE_W * 0.32, h: TILE_H * 0.7, color: '#ffffff' });
    labelA.position.x = -TILE_W * 0.24;
    const labelB = applyLabel(mesh, String(t.b), { size: 80, w: TILE_W * 0.32, h: TILE_H * 0.7, color: '#ffffff' });
    labelB.position.x = TILE_W * 0.24;
    const divider = new THREE.Mesh(new THREE.PlaneGeometry(0.03, TILE_H * 0.7), new THREE.MeshBasicMaterial({ color: 0xffd93d }));
    divider.position.z = 0.12;
    mesh.add(divider);
    mesh.userData = { id: t.id };
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 20 });
    t.mesh = mesh;
  });

  function visibleTiles() { return tiles.filter((t) => !t.cleared); }

  function setSelected(t, on) {
    t.mesh.material.emissiveIntensity = on ? 0.7 : 0;
    tween(t.mesh.scale, { x: on ? 1.1 : 1, y: on ? 1.1 : 1, z: on ? 1.1 : 1 }, 140, Easing.outBack);
  }

  function removeTile(t) {
    t.cleared = true;
    tween(t.mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 220, Easing.outCubic, () => {
      stage.world.remove(t.mesh);
    });
  }

  function checkEnd() {
    const remaining = visibleTiles();
    if (remaining.length === 0) { winGame(); return; }
    if (!hasAnyMatch(remaining)) {
      // deadlock safety net: bonus-clear the rest so the round always finishes fairly
      api.ui.toast('No more matches - bonus clearing the rest!');
      remaining.forEach((t) => { removeTile(t); cleared++; });
      clearedEl.textContent = cfg.count;
      setTimeout(winGame, 300);
    }
  }

  function winGame() {
    if (finished) return;
    finished = true;
    api.ui.burstFromElement(canvasHost);
    api.sound.win();
    const stars = mistakes === 0 ? 3 : mistakes <= 3 ? 2 : 1;
    setTimeout(() => api.win(stars, { mistakes }), 300);
  }

  function tapTile(t) {
    if (finished || t.cleared) return;
    if (selected && selected.id === t.id) { setSelected(t, false); selected = null; return; }
    if (!selected) { selected = t; setSelected(t, true); api.sound.click(); return; }
    if (shareValue(selected, t)) {
      api.sound.match();
      removeTile(selected); removeTile(t);
      cleared += 2;
      clearedEl.textContent = cleared;
      const prev = selected;
      selected = null;
      setTimeout(checkEnd, 260);
    } else {
      mistakes++;
      mistakesEl.textContent = mistakes;
      api.sound.error();
      api.ui.shake(canvasHost);
      const prev = selected;
      setSelected(prev, false);
      selected = null;
    }
  }

  function onPointerDown(e) {
    const hit = stage.pick(e.clientX, e.clientY, tiles.filter((t) => !t.cleared).map((t) => t.mesh));
    if (!hit) return;
    const t = tiles.find((tt) => tt.id === hit.object.userData.id);
    if (t) tapTile(t);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished) return;
    const remaining = visibleTiles();
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        if (shareValue(remaining[i], remaining[j])) {
          [remaining[i], remaining[j]].forEach((t) => {
            tween(t.mesh.material, { emissiveIntensity: 0.9 }, 150, Easing.outCubic, () => tween(t.mesh.material, { emissiveIntensity: 0 }, 500));
          });
          api.ui.toast(`${api.playerName}, those two glowing tiles share a number!`);
          return;
        }
      }
    }
  }

  return {
    unmount: () => {
      finished = true;
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('dominoes', { mount });
