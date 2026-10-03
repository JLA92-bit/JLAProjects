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
const ROW_V_SPACING = CARD_H * 0.66; // rows overlap like a real pyramid deal
const COL_SPACING = CARD_W * 1.04;
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

// Fit a (halfW x halfH) world rectangle inside the canvas host, measured at
// mount time, leaving room for DOM overlays (reserve, in px) and a small
// safety margin so nothing crops on narrow phones.
function fitView(host, halfW, halfH, { margin = 1.08, reserveTop = 0, reserveBottom = 0 } = {}) {
  const w = host.clientWidth || 320, h = host.clientHeight || 480;
  const aspect = Math.max(0.3, w / h);
  const f = Math.max(0.5, (h - reserveTop - reserveBottom) / h);
  const halfVis = Math.max(halfH / f, halfW / aspect) * margin;
  return { distance: halfVis / 0.42, lookAtY: -halfVis * (reserveBottom - reserveTop) / h };
}

// Raycasts can land on a card's text label (a child mesh), so walk up to
// the object that carries the card's userData.
function cardRoot(obj) {
  while (obj && !(obj.userData && obj.userData.source)) obj = obj.parent;
  return obj;
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
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap two cards that add to 13. A King goes alone.</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ps-canvas');
  const leftEl = wrap.querySelector('#ps-left');
  const redealsEl = wrap.querySelector('#ps-redeals');

  const pyramidHalfW = (Math.max(depth, 4) * COL_SPACING) / 2 + 0.1;
  const STOCK_GAP = 0.45;
  const totalHeight = (depth - 1) * ROW_V_SPACING + CARD_H + STOCK_GAP + CARD_H;
  const halfH = totalHeight / 2 + 0.15;
  const stage = createStage(canvasHost, fitView(canvasHost, pyramidHalfW, halfH, { reserveBottom: 50 }));

  const topY = totalHeight / 2 - CARD_H / 2;
  function rowY(r) { return topY - r * ROW_V_SPACING; }
  function cardX(r, i) { return (i - r / 2) * COL_SPACING; }
  const bottomRowY = rowY(depth - 1);
  const stockWasteY = bottomRowY - CARD_H - STOCK_GAP;

  function rankLabel(rank) { return RANK_NAMES[rank - 1]; }
  function cardText(card) { return `${rankLabel(card.rank)}${SUITS[card.suit].sym}`; }

  function makeCardMesh(card, faceUp) {
    const mesh = makeTile({ w: CARD_W, h: CARD_H, depth: 0.1, radius: 0.08, color: faceUp ? CARD_FACE : CARD_BACK, roughness: 0.5 });
    if (faceUp) {
      const suit = SUITS[card.suit];
      const label = applyLabel(mesh, cardText(card), { size: 96, w: CARD_W * 0.92, h: CARD_W * 0.92, color: suit.red ? '#d13b5c' : '#241436' });
      // sit the rank in the top part of the card so it stays readable
      // while the row below overlaps the card's lower edge
      label.position.y = CARD_H * 0.17;
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
  let stockLabel = null;
  let stockLabelText = '';
  function setStockLabel(text, color) {
    if (text === stockLabelText) return;
    stockLabelText = text;
    if (stockLabel) { stockMesh.remove(stockLabel); stockLabel.geometry.dispose(); stockLabel.material.map.dispose(); stockLabel.material.dispose(); stockLabel = null; }
    if (text) stockLabel = applyLabel(stockMesh, text, { size: 96, w: CARD_W * 0.9, h: CARD_W * 0.9, color: color || '#ffffff' });
  }

  const wasteGroup = new THREE.Group();
  wasteGroup.position.set(CARD_W * 0.8, stockWasteY, 0);
  stage.world.add(wasteGroup);
  let wasteMesh = null;

  function refreshStockWaste() {
    // the stock stays tappable: it shows how many cards are left, or a
    // redeal arrow once it is empty
    const canRedeal = stock.length === 0 && redealsLeft > 0 && waste.length > 0;
    stockMesh.visible = stock.length > 0 || canRedeal;
    stockMesh.material.color.set(stock.length > 0 ? CARD_BACK : 0x23d18b);
    setStockLabel(stock.length > 0 ? String(stock.length) : canRedeal ? '↻' : '', '#ffffff');
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
    if (mesh) tween(mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 180, Easing.inOutQuad, () => { if (alive && mesh.parent) mesh.parent.remove(mesh); });
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
      later(() => api.win(stars, { redealsLeft }), 300);
      return true;
    }
    return false;
  }

  // Stuck when nothing pairs right now and no new card can ever come out of
  // the stock (it is empty and there is nothing / no redeal left to recycle).
  function checkLoseIfStuck() {
    if (stock.length === 0 && (redealsLeft === 0 || waste.length === 0) && !hasAnyMove()) {
      finished = true;
      later(() => {
        api.lose('no more moves left. Try a new deal!');
        showRetry('No more moves left.');
      }, 300);
      return true;
    }
    return false;
  }

  function showRetry(msg) {
    const over = document.createElement('div');
    over.className = 'ps-over';
    over.innerHTML = `<div class="ps-over-msg"></div><button class="pc-btn pc-btn--blue">New deal</button>`;
    over.querySelector('.ps-over-msg').textContent = msg;
    over.querySelector('button').addEventListener('click', () => { api.sound.click(); restart(); });
    canvasHost.appendChild(over);
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
    clearHighlight();
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
      checkLoseIfStuck();
    } else {
      api.sound.error();
      api.ui.shake(canvasHost);
      api.ui.toast(`${api.playerName}, no redeals left - pair up what you can!`);
      checkLoseIfStuck();
    }
  }

  function onPointerDown(e) {
    if (finished) return;
    const pickable = [...pyramidMeshes.flat().filter(Boolean), stockMesh, ...(wasteMesh ? [wasteMesh] : [])];
    const hit = stage.pick(e.clientX, e.clientY, pickable.filter((m) => m.visible));
    const root = hit ? cardRoot(hit.object) : null;
    if (!root) return;
    const ud = root.userData;
    if (ud.source === 'stock') { drawStock(); return; }
    if (ud.source === 'pyramid' && !isAvailable(ud.r, ud.i)) { api.sound.error(); api.ui.shake(canvasHost); return; }
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
    if (stock.length === 0 && !(redealsLeft > 0 && waste.length)) { api.ui.toast(`${api.playerName}, no moves are left - try a new deal!`); return; }
    api.ui.toast(stock.length ? `${api.playerName}, no pair yet - tap the deck to draw a card!` : `${api.playerName}, tap the green arrow to redeal the deck!`);
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
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('pyramidsolitaire', { mount });
