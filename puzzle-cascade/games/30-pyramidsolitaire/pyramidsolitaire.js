/**
 * Game 30 - Pyramid Solitaire (3D). Tap two uncovered cards that add up
 * to 13 (King counts alone) to clear them. Tap the stock to draw a new
 * waste card. Clear the whole pyramid before you run out of redeals.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { depth: 5, redeals: 3 },
  medium: { depth: 6, redeals: 2 },
  hard: { depth: 7, redeals: 1 },
};
const CARD_W = 0.62, CARD_H = 0.86;
const ROW_V_SPACING = CARD_H * 1.05;
const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = [{ sym: '♥', red: true }, { sym: '♦', red: true }, { sym: '♣', red: false }, { sym: '♠', red: false }];
const CARD_FACE = 0xc9bfe0;
const CARD_BACK = 0x3d2e63;
const COVERED_TINT = 0x766a95;

function buildDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  return deck;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const depth = cfg.depth;
  let redealsLeft = cfg.redeals;
  const deck = buildDeck();
  const pyramidCount = (depth * (depth + 1)) / 2;
  const pyramidCards = deck.splice(0, pyramidCount);
  let stock = deck; // remaining cards, draw from end
  let waste = [];
  let finished = false;

  // pyramid[row][idx] = card object or null once removed
  const pyramid = [];
  let cursor = 0;
  for (let r = 0; r < depth; r++) {
    const row = [];
    for (let i = 0; i <= r; i++) row.push(pyramidCards[cursor++]);
    pyramid.push(row);
  }

  function isAvailable(r, i) {
    if (!pyramid[r][i]) return false;
    if (r === depth - 1) return true;
    return !pyramid[r + 1][i] && !pyramid[r + 1][i + 1];
  }

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ps-meta">
      <span>Cards left: <span id="ps-left">${pyramidCount}</span></span>
      <span>Redeals: <span id="ps-redeals">${redealsLeft}</span></span>
    </div>
    <div class="pc-canvas3d" id="ps-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap two cards that sum to 13 (K alone)</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ps-canvas');
  const leftEl = wrap.querySelector('#ps-left');
  const redealsEl = wrap.querySelector('#ps-redeals');

  const pyramidHalfW = (depth * CARD_W * 1.05) / 2 + 0.4;
  const totalHeight = depth * ROW_V_SPACING + 1.0 + CARD_H + 0.6;
  const halfH = totalHeight / 2 + 0.3;
  const aspectMin = 0.46;
  const distance = Math.max(pyramidHalfW / (0.42 * aspectMin), halfH / 0.42) * 1.05;
  const stage = createStage(canvasHost, { distance });

  const topY = halfH - CARD_H * 0.7;
  function rowY(r) { return topY - r * ROW_V_SPACING; }
  function cardX(r, i) { return (i - r / 2) * CARD_W * 1.05; }
  const bottomRowY = rowY(depth - 1);
  const stockWasteY = bottomRowY - ROW_V_SPACING - 0.7;

  function rankLabel(rank) { return RANK_NAMES[rank - 1]; }
  function cardText(card) { return `${rankLabel(card.rank)}${SUITS[card.suit].sym}`; }

  function makeCardMesh(card, faceUp) {
    const mesh = makeTile({ w: CARD_W, h: CARD_H, depth: 0.1, radius: 0.08, color: faceUp ? CARD_FACE : CARD_BACK, roughness: 0.5 });
    if (faceUp) {
      const suit = SUITS[card.suit];
      applyLabel(mesh, cardText(card), { size: 96, w: CARD_W * 0.85, h: CARD_H * 0.55, color: suit.red ? '#d13b5c' : '#241436' });
    }
    return mesh;
  }

  const pyramidMeshes = pyramid.map((row) => row.map(() => null));
  pyramid.forEach((row, r) => {
    row.forEach((card, i) => {
      const mesh = makeCardMesh(card, true);
      mesh.position.set(cardX(r, i), rowY(r), r * 0.01);
      mesh.userData = { source: 'pyramid', r, i };
      stage.world.add(mesh);
      popIn(mesh, { delay: (r * (r + 1)) * 8, duration: 180 });
      pyramidMeshes[r][i] = mesh;
    });
  });

  function refreshAvailability() {
    for (let r = 0; r < depth; r++) for (let i = 0; i <= r; i++) {
      const mesh = pyramidMeshes[r][i];
      if (!mesh || !pyramid[r][i]) continue;
      const avail = isAvailable(r, i);
      mesh.material.color.set(avail ? CARD_FACE : COVERED_TINT);
      mesh.material.opacity = avail ? 1 : 0.85;
      mesh.material.transparent = !avail;
    }
  }
  refreshAvailability();

  // stock pile visual (stack of face-down cards)
  const stockGroup = new THREE.Group();
  stockGroup.position.set(-CARD_W * 0.8, stockWasteY, 0);
  stage.world.add(stockGroup);
  const stockMesh = makeTile({ w: CARD_W, h: CARD_H, depth: 0.1, radius: 0.08, color: CARD_BACK, roughness: 0.5 });
  stockMesh.userData = { source: 'stock' };
  stockGroup.add(stockMesh);

  const wasteGroup = new THREE.Group();
  wasteGroup.position.set(CARD_W * 0.8, stockWasteY, 0);
  stage.world.add(wasteGroup);
  let wasteMesh = null;

  function refreshStockWaste() {
    stockMesh.visible = stock.length > 0;
    if (wasteMesh) { wasteGroup.remove(wasteMesh); wasteMesh = null; }
    const top = waste[waste.length - 1];
    if (top) {
      wasteMesh = makeCardMesh(top, true);
      wasteMesh.userData = { source: 'waste' };
      wasteGroup.add(wasteMesh);
    }
    leftEl.textContent = pyramid.flat().filter(Boolean).length;
    redealsEl.textContent = redealsLeft;
  }
  refreshStockWaste();

  let selected = null; // {source, r, i, mesh, card}

  function cardAt(sel) {
    if (sel.source === 'pyramid') return pyramid[sel.r][sel.i];
    if (sel.source === 'waste') return waste[waste.length - 1];
    return null;
  }
  function meshAt(sel) {
    if (sel.source === 'pyramid') return pyramidMeshes[sel.r][sel.i];
    if (sel.source === 'waste') return wasteMesh;
    return null;
  }

  function clearHighlight() {
    if (selected) { const m = meshAt(selected); if (m) { m.material.emissiveIntensity = 0; } }
    selected = null;
  }

  function removeCard(sel) {
    const mesh = meshAt(sel);
    if (mesh) tween(mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 180, Easing.inOutQuad, () => mesh.parent && mesh.parent.remove(mesh));
    if (sel.source === 'pyramid') { pyramid[sel.r][sel.i] = null; pyramidMeshes[sel.r][sel.i] = null; }
    else if (sel.source === 'waste') { waste.pop(); wasteMesh = null; }
  }

  function availablePyramidList() {
    const out = [];
    for (let r = 0; r < depth; r++) for (let i = 0; i <= r; i++) if (isAvailable(r, i)) out.push({ source: 'pyramid', r, i, card: pyramid[r][i] });
    return out;
  }

  function candidateList() {
    const list = availablePyramidList();
    if (waste.length) list.push({ source: 'waste', card: waste[waste.length - 1] });
    return list;
  }

  function hasAnyMove() {
    const list = candidateList();
    if (list.some((c) => c.card.rank === 13)) return true;
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (list[a].card.rank + list[b].card.rank === 13) return true;
    }
    return false;
  }

  function checkWin() {
    if (pyramid.flat().every((c) => !c)) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const stars = redealsLeft >= Math.ceil(cfg.redeals * 0.6) ? 3 : redealsLeft > 0 ? 2 : 1;
      setTimeout(() => api.win(stars, { redealsLeft }), 300);
      return true;
    }
    return false;
  }

  function checkLoseIfStuck() {
    if (stock.length === 0 && redealsLeft === 0 && !hasAnyMove()) {
      finished = true;
      setTimeout(() => api.lose('no more moves and the stock ran dry. Try again.'), 300);
      return true;
    }
    return false;
  }

  function tryPair(a, b) {
    if (a.card.rank + b.card.rank !== 13) return false;
    api.sound.match();
    api.ui.burstFromElement(canvasHost, { count: 12 });
    removeCard(a);
    removeCard(b);
    refreshAvailability();
    refreshStockWaste();
    return true;
  }

  function onSelect(sel) {
    if (finished) return;
    const card = cardAt(sel);
    if (!card) return;
    if (card.rank === 13) {
      api.sound.click();
      removeCard(sel);
      refreshAvailability();
      refreshStockWaste();
      if (checkWin()) return;
      checkLoseIfStuck();
      return;
    }
    if (!selected) {
      selected = sel;
      const mesh = meshAt(sel);
      mesh.material.emissive.set(0xffd93d);
      mesh.material.emissiveIntensity = 0.6;
      api.sound.click();
      return;
    }
    if (selected.source === sel.source && selected.r === sel.r && selected.i === sel.i) { clearHighlight(); return; }
    const a = selected, b = sel;
    clearHighlight();
    if (tryPair({ ...a, card: cardAt(a) }, { ...b, card: cardAt(b) })) {
      if (checkWin()) return;
      checkLoseIfStuck();
    } else {
      api.sound.error();
      api.ui.shake(canvasHost);
    }
  }

  function drawStock() {
    if (finished) return;
    if (stock.length > 0) {
      const card = stock.pop();
      waste.push(card);
      refreshStockWaste();
      api.sound.move();
      checkLoseIfStuck();
      return;
    }
    if (redealsLeft > 0 && waste.length) {
      redealsLeft--;
      stock = waste.reverse();
      waste = [];
      refreshStockWaste();
      api.sound.click();
    } else {
      api.sound.error();
    }
  }

  function onPointerDown(e) {
    if (finished) return;
    const pickable = [...pyramidMeshes.flat().filter(Boolean), stockMesh, ...(wasteMesh ? [wasteMesh] : [])];
    const hit = stage.pick(e.clientX, e.clientY, pickable);
    if (!hit) return;
    const ud = hit.object.userData;
    if (ud.source === 'stock') { drawStock(); return; }
    if (ud.source === 'pyramid' && !isAvailable(ud.r, ud.i)) { api.sound.error(); return; }
    onSelect(ud);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished) return;
    const list = candidateList();
    const king = list.find((c) => c.card.rank === 13);
    if (king) { glow(king); api.ui.toast(`${api.playerName}, that King clears itself!`); return; }
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (list[a].card.rank + list[b].card.rank === 13) {
        glow(list[a]); glow(list[b]);
        api.ui.toast(`${api.playerName}, those two glowing cards add up to 13!`);
        return;
      }
    }
    api.ui.toast(`${api.playerName}, no pair available - draw from the stock!`);
    tween(stockMesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 180, Easing.outBack, () => tween(stockMesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
  }
  function glow(sel) {
    const mesh = meshAt(sel);
    if (!mesh) return;
    mesh.material.emissive.set(0xffd93d);
    mesh.material.emissiveIntensity = 0.6;
    tween(mesh.scale, { x: 1.15, y: 1.15, z: 1.15 }, 160, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic, () => { mesh.material.emissiveIntensity = 0; }));
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

PC.Games.register('pyramidsolitaire', { mount });
