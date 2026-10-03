/**
 * Game 49 - Tile Match (Mahjong solitaire). Tiles are stacked in small
 * layers. Tap two FREE tiles with the same picture to clear them. A tile is
 * free when nothing sits on top of it and its left or right side is open.
 * Layouts are filled by placing pairs in reverse removal order, so every
 * deal can be cleared. Shuffle (costs stars) rescues a stuck board.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const SYMBOLS = ['🍎', '🍋', '🍇', '🍓', '🌸', '🌙', '⭐', '🐟', '🍄', '🎈', '🔔', '🍀'];

function rect(c0, c1, r0, r1, z, skip = []) {
  const out = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!skip.some(([sc, sr]) => sc === c && sr === r)) out.push({ c, r, z });
  }
  return out;
}

const CONFIG = {
  easy: { cols: 4, rows: 5, kinds: 6, layout: () => [...rect(0, 3, 0, 4, 0), ...rect(1, 2, 1, 3, 1)] },
  medium: { cols: 5, rows: 6, kinds: 9, layout: () => [...rect(0, 4, 0, 5, 0, [[0, 0], [4, 0]]), ...rect(1, 3, 1, 4, 1), ...rect(2, 2, 2, 3, 2)] },
  hard: { cols: 6, rows: 7, kinds: 12, layout: () => [...rect(0, 5, 0, 6, 0, [[0, 0], [5, 0], [0, 6], [5, 6]]), ...rect(1, 4, 1, 5, 1), ...rect(2, 3, 2, 4, 2)] },
};
const SX = 0.92, SY = 1.2, TW = 0.86, TH = 1.12, DEPTH = 0.34;
const FREE_COLORS = [0xbda27a, 0xc2a984, 0xc8b08c];
const BLOCKED_COLOR = 0x5a4a78;
const SELECT_GLOW = 0xffd93d;
const HINT_GLOW = 0x23d18b;

function fitDistance(host, halfW, halfH, margin = 1.08) {
  const w = host.clientWidth, h = host.clientHeight;
  let aspect = w && h ? w / h : 0.5;
  aspect = Math.max(0.4, Math.min(1.6, aspect));
  return Math.max((halfH * margin) / 0.42, (halfW * margin) / (0.42 * aspect));
}

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const pk = (c, r, z) => `${c},${r},${z}`;

/* Free test for a tile at p against a set of occupied keys. */
function isFree(p, occ) {
  if (occ.has(pk(p.c, p.r, p.z + 1))) return false;
  return !occ.has(pk(p.c - 1, p.r, p.z)) || !occ.has(pk(p.c + 1, p.r, p.z));
}

/*
 * Build a removal order for the positions: returns an array of pairs
 * [[i, j], ...] in REVERSE removal order (first pair placed = last removed).
 * Rows grow as contiguous runs so a placed tile always keeps one open side.
 */
function buildPairs(positions) {
  const all = new Set(positions.map((p) => pk(p.c, p.r, p.z)));
  const runOf = (p) => {
    const run = [];
    let c = p.c; while (all.has(pk(c - 1, p.r, p.z))) c--;
    while (all.has(pk(c, p.r, p.z))) { run.push(pk(c, p.r, p.z)); c++; }
    return run;
  };
  const runs = positions.map(runOf);
  for (let attempt = 0; attempt < 300; attempt++) {
    const placed = new Set();
    const pairs = [];
    const canPlace = (i) => {
      const p = positions[i];
      const key = pk(p.c, p.r, p.z);
      if (placed.has(key)) return false;
      if (p.z > 0 && all.has(pk(p.c, p.r, p.z - 1)) && !placed.has(pk(p.c, p.r, p.z - 1))) return false;
      const L = placed.has(pk(p.c - 1, p.r, p.z)), R = placed.has(pk(p.c + 1, p.r, p.z));
      if (L && R) return false;
      if (L || R) return true;
      return !runs[i].some((k) => placed.has(k));
    };
    let ok = true;
    while (placed.size < positions.length) {
      const c1 = positions.map((_, i) => i).filter(canPlace);
      if (c1.length < 2) { ok = false; break; }
      const a = c1[Math.floor(Math.random() * c1.length)];
      const pa = positions[a];
      placed.add(pk(pa.c, pa.r, pa.z));
      const c2 = shuffleArr(positions.map((_, i) => i).filter(canPlace));
      let b = -1;
      for (const j of c2) {
        const pb = positions[j];
        placed.add(pk(pb.c, pb.r, pb.z));
        if (isFree(pa, placed) && isFree(pb, placed)) { b = j; break; }
        placed.delete(pk(pb.c, pb.r, pb.z));
      }
      if (b < 0) { ok = false; break; }
      pairs.push([a, b]);
    }
    if (ok) return pairs;
  }
  return null;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const positions = cfg.layout();
  let solutionPairs = []; // removal order (first = remove first), as tile objects
  let selected = null, hinted = null, finished = false;
  let shuffles = 0, hintsUsed = 0, mismatches = 0;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="mj-meta">
      <span>Pairs left: <span class="mj-left">0</span></span>
      <button class="mj-shuffle" type="button">🔀 Shuffle</button>
    </div>
    <div class="pc-canvas3d mj-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap 2 bright tiles that match</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.mj-canvas');
  const leftEl = wrap.querySelector('.mj-left');
  const shuffleBtn = wrap.querySelector('.mj-shuffle');

  // extra room at the bottom keeps the last row clear of the hint chip
  const CHIP_PAD = 0.7;
  const halfW = (cfg.cols * SX) / 2 + 0.1, halfH = (cfg.rows * SY) / 2 + 0.1 + CHIP_PAD / 2;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, halfW, halfH) });
  stage.world.position.y = CHIP_PAD / 2;
  const worldXY = (p) => ({
    x: (p.c - (cfg.cols - 1) / 2) * SX - p.z * 0.09,
    y: ((cfg.rows - 1) / 2 - p.r) * SY + p.z * 0.13,
  });

  const tiles = positions.map((p, i) => {
    const mesh = makeTile({ w: TW, h: TH, depth: DEPTH, radius: 0.12, color: FREE_COLORS[p.z] || FREE_COLORS[0], roughness: 0.5 });
    const { x, y } = worldXY(p);
    mesh.position.set(x, y, p.z * (DEPTH + 0.04));
    stage.world.add(mesh);
    const t = { ...p, idx: i, kind: -1, mesh, label: null, alive: true };
    mesh.userData.tile = t;
    return t;
  });

  function setKind(t, kind) {
    t.kind = kind;
    if (t.label) {
      t.mesh.remove(t.label);
      t.label.geometry.dispose(); if (t.label.material.map) t.label.material.map.dispose(); t.label.material.dispose();
    }
    t.label = applyLabel(t.mesh, SYMBOLS[kind], { size: 128, w: 0.74, h: 0.74, fontFamily: "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif" });
    // stacked tiles must hide the pictures underneath them
    t.label.material.depthTest = true;
    t.label.position.z = DEPTH / 2 + 0.06;
    t.label.renderOrder = 0;
  }

  // deal kinds onto positions using a reverse-built removal order
  function deal(list, kindPool) {
    const pairs = buildPairs(list.map((t) => ({ c: t.c, r: t.r, z: t.z })));
    const pool = shuffleArr(kindPool);
    if (!pairs) {
      // extremely unlikely fallback: random deal
      const flat = shuffleArr(list);
      for (let i = 0; i < flat.length; i += 2) { const k = pool[i / 2]; setKind(flat[i], k); setKind(flat[i + 1], k); }
      solutionPairs = [];
      return;
    }
    pairs.forEach(([a, b], i) => { setKind(list[a], pool[i]); setKind(list[b], pool[i]); });
    solutionPairs = pairs.map(([a, b]) => [list[a], list[b]]).reverse();
  }

  const initialPool = Array.from({ length: positions.length / 2 }, (_, i) => i % cfg.kinds);
  deal(tiles, initialPool);
  tiles.forEach((t, i) => popIn(t.mesh, { delay: t.z * 180 + i * 8 }));

  const occupied = () => new Set(tiles.filter((t) => t.alive).map((t) => pk(t.c, t.r, t.z)));
  const freeTile = (t, occ = occupied()) => t.alive && isFree(t, occ);

  function refresh() {
    const occ = occupied();
    tiles.forEach((t) => {
      if (!t.alive) return;
      const free = isFree(t, occ);
      t.mesh.material.color.set(free ? (FREE_COLORS[t.z] || FREE_COLORS[0]) : BLOCKED_COLOR);
      if (t.label) t.label.material.opacity = free ? 1 : 0.5;
      let glow = 0, gcol = SELECT_GLOW;
      if (selected === t) { glow = 0.45; }
      else if (hinted && hinted.includes(t)) { glow = 0.35; gcol = HINT_GLOW; }
      t.mesh.material.emissive.set(gcol);
      t.mesh.material.emissiveIntensity = glow;
    });
    leftEl.textContent = tiles.filter((t) => t.alive).length / 2;
  }

  function findPair() {
    const occ = occupied();
    // prefer the next pair from the known clear order so hints never dead-end
    for (const pair of solutionPairs) {
      if (pair[0].alive && pair[1].alive && pair[0].kind === pair[1].kind && isFree(pair[0], occ) && isFree(pair[1], occ)) return pair;
    }
    const byKind = new Map();
    for (const t of tiles) {
      if (!t.alive || !isFree(t, occ)) continue;
      if (byKind.has(t.kind)) return [byKind.get(t.kind), t];
      byKind.set(t.kind, t);
    }
    return null;
  }

  function removePair(a, b) {
    a.alive = false; b.alive = false;
    selected = null; hinted = null;
    [a, b].forEach((t) => {
      tween(t.mesh.position, { z: t.mesh.position.z + 1.2 }, 260, Easing.outCubic);
      tween(t.mesh.scale, { x: 1.25, y: 1.25, z: 1.25 }, 140, Easing.outBack, () => tween(t.mesh.scale, { x: 0.001, y: 0.001, z: 0.001 }, 200, Easing.inOutQuad, () => { t.mesh.visible = false; }));
      t.mesh.material.emissive.set(SELECT_GLOW);
      t.mesh.material.emissiveIntensity = 0.6;
    });
    api.sound.move();
    refresh();
    const left = tiles.filter((t) => t.alive).length;
    if (left === 0) {
      finished = true;
      api.ui.burstFromElement(canvasHost);
      const penalty = shuffles * 2 + hintsUsed + Math.floor(mismatches / 3);
      const stars = penalty <= 1 ? 3 : penalty <= 5 ? 2 : 1;
      later(() => api.win(stars, { shuffles, hints: hintsUsed }), 500);
      return;
    }
    if (!findPair()) {
      later(() => {
        if (finished) return;
        api.ui.toast('No more matches - tap Shuffle to mix the tiles!');
        shuffleBtn.classList.add('mj-shuffle--pulse');
      }, 450);
    }
  }

  function onPointerDown(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, tiles.filter((t) => t.alive).map((t) => t.mesh), false);
    if (!hit) { if (selected) { selected = null; refresh(); } return; }
    const t = hit.object.userData.tile;
    if (!freeTile(t)) {
      api.sound.error(); api.ui.shake(canvasHost);
      api.ui.toast('That tile is stuck - pick a bright one with an open side.');
      tween(t.mesh.position, { x: t.mesh.position.x + 0.06 }, 60, Easing.linear, () => tween(t.mesh.position, { x: worldXY(t).x }, 120));
      return;
    }
    if (!selected) {
      selected = t; api.sound.click(); refresh();
      tween(t.mesh.scale, { x: 1.1, y: 1.1, z: 1.1 }, 140, Easing.outBack);
      return;
    }
    if (selected === t) {
      selected = null; api.sound.click(); refresh();
      tween(t.mesh.scale, { x: 1, y: 1, z: 1 }, 140);
      return;
    }
    if (selected.kind === t.kind) { removePair(selected, t); return; }
    mismatches++;
    api.sound.error(); api.ui.shake(canvasHost);
    tween(selected.mesh.scale, { x: 1, y: 1, z: 1 }, 140);
    selected = t; refresh();
    tween(t.mesh.scale, { x: 1.1, y: 1.1, z: 1.1 }, 140, Easing.outBack);
  }
  const el = stage.renderer.domElement;
  el.addEventListener('pointerdown', onPointerDown);

  function doShuffle() {
    if (finished) return;
    const alive = tiles.filter((t) => t.alive);
    shuffles++;
    shuffleBtn.classList.remove('mj-shuffle--pulse');
    selected = null; hinted = null;
    const counts = new Map();
    alive.forEach((t) => counts.set(t.kind, (counts.get(t.kind) || 0) + 1));
    const pool = [];
    counts.forEach((n, k) => { for (let i = 0; i < n / 2; i++) pool.push(k); });
    alive.forEach((t) => {
      tween(t.mesh.scale, { x: 0.05, y: 1, z: 1 }, 150, Easing.inOutQuad, () => tween(t.mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outBack));
    });
    later(() => { if (!finished) { deal(alive, pool); refresh(); } }, 160);
    api.sound.click();
    api.ui.toast('Tiles shuffled!');
  }
  shuffleBtn.addEventListener('click', doShuffle);

  function hint() {
    if (finished) return;
    // asking twice for the same pair: clear it for them
    if (hinted && hinted.every((t) => t.alive && freeTile(t))) {
      hintsUsed++;
      api.ui.toast(`${api.playerName}, I matched that pair for you!`);
      removePair(hinted[0], hinted[1]);
      return;
    }
    const pair = findPair();
    if (!pair) {
      // stuck: shuffle for them (the new deal always has a way out)
      doShuffle();
      api.ui.toast(`${api.playerName}, no matches were open, so I shuffled the tiles!`);
      return;
    }
    hintsUsed++;
    hinted = pair;
    if (selected && !pair.includes(selected)) { tween(selected.mesh.scale, { x: 1, y: 1, z: 1 }, 140); selected = null; }
    refresh();
    pair.forEach((t) => tween(t.mesh.scale, { x: 1.22, y: 1.22, z: 1.22 }, 180, Easing.outBack, () => tween(t.mesh.scale, { x: 1, y: 1, z: 1 }, 260)));
    api.ui.toast(`${api.playerName}, these two glowing tiles match!`);
  }

  refresh();

  return {
    unmount: () => {
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      el.removeEventListener('pointerdown', onPointerDown);
      shuffleBtn.removeEventListener('click', doShuffle);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('mahjong', { mount });
