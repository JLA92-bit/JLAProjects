/**
 * Game 43 - Block Fit (3D). Three pieces wait in the tray under an 8x8
 * board. Drag a piece onto the board; any row or column that becomes
 * completely full clears away for bonus points. Reach the target score to
 * win. If none of the pieces in the tray fit anywhere, the round is over.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const line = (n, h) => Array.from({ length: n }, (_, i) => (h ? [0, i] : [i, 0]));
const square = (n) => { const o = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) o.push([r, c]); return o; };
const SHAPES = {
  dot: [[0, 0]],
  h2: line(2, true), v2: line(2, false), h3: line(3, true), v3: line(3, false),
  h4: line(4, true), v4: line(4, false), h5: line(5, true), v5: line(5, false),
  sq2: square(2), sq3: square(3),
  l1: [[0, 0], [1, 0], [1, 1]], l2: [[0, 0], [0, 1], [1, 0]], l3: [[0, 0], [0, 1], [1, 1]], l4: [[0, 1], [1, 0], [1, 1]],
  L1: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], L2: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],
  L3: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], L4: [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0]],
};
const SHAPE_COLOR = {
  dot: 0xff4d8d, h2: 0xff9f43, v2: 0xff9f43, h3: 0xffd93d, v3: 0xffd93d, h4: 0x17c3b2, v4: 0x17c3b2,
  h5: 0xff5c5c, v5: 0xff5c5c, sq2: 0x23d18b, sq3: 0x3f8efc,
  l1: 0xa259ff, l2: 0xa259ff, l3: 0xa259ff, l4: 0xa259ff, L1: 0x3f8efc, L2: 0x3f8efc, L3: 0x3f8efc, L4: 0x3f8efc,
};
const CONFIG = {
  easy: { target: 80, prefill: 0, stars: [17, 23], weights: { dot: 3, h2: 3, v2: 3, h3: 3, v3: 3, h4: 1, v4: 1, sq2: 3, l1: 2, l2: 2, l3: 2, l4: 2 } },
  medium: { target: 120, prefill: 0, stars: [21, 28], weights: { dot: 3, h2: 3, v2: 3, h3: 3, v3: 3, h4: 2, v4: 2, h5: 1, v5: 1, sq2: 3, sq3: 1, l1: 2, l2: 2, l3: 2, l4: 2, L1: 1, L2: 1, L3: 1, L4: 1 } },
  hard: { target: 180, prefill: 6, stars: [27, 35], weights: { dot: 2, h2: 2, v2: 2, h3: 3, v3: 3, h4: 2, v4: 2, h5: 1, v5: 1, sq2: 3, sq3: 1, l1: 2, l2: 2, l3: 2, l4: 2, L1: 2, L2: 2, L3: 2, L4: 2 } },
};
const N = 8;
const CELL = 0.78;
const BOARD_W = N * CELL + 0.3;
const TRAY_H = 2.3, GAP = 0.35;
const VIEW_W = BOARD_W + 0.1, VIEW_H = BOARD_W + GAP + TRAY_H;
const BOARD_CY = VIEW_H / 2 - BOARD_W / 2;
const TRAY_CY = -VIEW_H / 2 + TRAY_H / 2;
const SLOT_W = BOARD_W / 3;
const TRAY_SCALE = 0.5;
const ROCK = 0x6c5a92;

function fitView(host, w, h, bottomPx) {
  const cw = host.clientWidth || 360, ch = host.clientHeight || 640;
  const aspect = cw / ch || 0.5;
  const usable = Math.max(0.6, (ch - bottomPx) / ch);
  const halfH = Math.max((h * 1.06) / (2 * usable), (w * 1.06) / (2 * aspect));
  return { halfH, shiftY: halfH * (1 - usable) };
}

function shapeSize(cells) {
  let rows = 0, cols = 0;
  cells.forEach(([r, c]) => { rows = Math.max(rows, r + 1); cols = Math.max(cols, c + 1); });
  return { rows, cols };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  let grid, score, pieces, finished, offer;
  const timeouts = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bf-meta"><span>Score: <span class="bf-score">0</span> / ${cfg.target}</span><span>Pieces: <span class="bf-pieces">0</span></span></div>
    <div class="pc-canvas3d bf-canvas">
      <div class="pc-overlay-bottom"><button type="button" class="bf-again" hidden>Try again</button></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.bf-canvas');
  const scoreEl = wrap.querySelector('.bf-score');
  const piecesEl = wrap.querySelector('.bf-pieces');
  const againBtn = wrap.querySelector('.bf-again');

  const fit0 = fitView(canvasHost, VIEW_W, VIEW_H, 8);
  const stage = createStage(canvasHost, { distance: fit0.halfH / 0.42 });
  const baseHalfH = fit0.halfH;
  function refit() {
    const f = fitView(canvasHost, VIEW_W, VIEW_H, 8);
    stage.camera.zoom = baseHalfH / f.halfH;
    stage.camera.updateProjectionMatrix();
    stage.world.position.y = f.shiftY;
  }
  refit();
  const ro = new ResizeObserver(refit);
  ro.observe(canvasHost);

  const boardLeft = -(N * CELL) / 2, boardTop = BOARD_CY + (N * CELL) / 2;
  const cellX = (c) => boardLeft + (c + 0.5) * CELL;
  const cellY = (r) => boardTop - (r + 0.5) * CELL;

  const boardBase = makeTile({ w: BOARD_W, h: BOARD_W, depth: 0.2, radius: 0.28, color: 0x24123f, roughness: 0.7 });
  boardBase.position.set(0, BOARD_CY, -0.32);
  stage.world.add(boardBase);
  const slotMeshes = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const slot = makeTile({ w: CELL - 0.06, h: CELL - 0.06, depth: 0.05, radius: 0.1, color: 0x3a2266, roughness: 0.8 });
    slot.position.set(cellX(c), cellY(r), -0.2);
    slot.castShadow = false;
    stage.world.add(slot);
    slotMeshes.push(slot);
  }
  const tray = makeTile({ w: BOARD_W, h: TRAY_H, depth: 0.16, radius: 0.28, color: 0x2e1852, roughness: 0.7 });
  tray.position.set(0, TRAY_CY, -0.32);
  stage.world.add(tray);

  // ghost preview cells
  const ghosts = [];
  for (let i = 0; i < 9; i++) {
    const g = makeTile({ w: CELL - 0.08, h: CELL - 0.08, depth: 0.06, radius: 0.12, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, opacity: 0.4 });
    g.castShadow = false;
    g.visible = false;
    stage.world.add(g);
    ghosts.push(g);
  }
  function showGhost(shape, r0, c0, color) {
    const cells = SHAPES[shape];
    ghosts.forEach((g, i) => {
      if (i < cells.length) {
        g.visible = true;
        g.position.set(cellX(c0 + cells[i][1]), cellY(r0 + cells[i][0]), -0.1);
        g.material.color.set(color); g.material.emissive.set(color);
      } else g.visible = false;
    });
  }
  function hideGhost() { ghosts.forEach((g) => { g.visible = false; }); }

  function makeBlock(color) {
    return makeTile({ w: CELL - 0.08, h: CELL - 0.08, depth: 0.3, radius: 0.13, color, emissive: color, emissiveIntensity: 0.12 });
  }

  function pickShape() {
    const entries = Object.entries(cfg.weights);
    let s = entries.reduce((a, e) => a + e[1], 0) * Math.random();
    for (const [k, w] of entries) { s -= w; if (s < 0) return k; }
    return entries[0][0];
  }

  function fits(shape, r0, c0) {
    return SHAPES[shape].every(([dr, dc]) => {
      const r = r0 + dr, c = c0 + dc;
      return r >= 0 && r < N && c >= 0 && c < N && !grid[r][c];
    });
  }
  function linesIf(shape, r0, c0) {
    const filled = grid.map((row) => row.map((v) => !!v));
    SHAPES[shape].forEach(([dr, dc]) => { filled[r0 + dr][c0 + dc] = true; });
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      if (filled[i].every(Boolean)) rows.push(i);
      if (filled.every((row) => row[i])) cols.push(i);
    }
    return { rows, cols };
  }
  function anyFit() {
    return offer.some((p) => p && (() => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(p.shape, r, c)) return true; return false; })());
  }

  function slotX(i) { return -BOARD_W / 2 + SLOT_W * (i + 0.5); }
  function buildPiece(shape, slot) {
    const cells = SHAPES[shape];
    const { rows, cols } = shapeSize(cells);
    const color = SHAPE_COLOR[shape];
    const group = new THREE.Group();
    cells.forEach(([r, c]) => {
      const b = makeBlock(color);
      b.position.set((c - (cols - 1) / 2) * CELL, ((rows - 1) / 2 - r) * CELL, 0);
      group.add(b);
    });
    group.userData.slot = slot;
    group.position.set(slotX(slot), TRAY_CY, 0.05);
    stage.world.add(group);
    popIn(group, { delay: 80 * slot, scale: TRAY_SCALE });
    return { shape, group, rows, cols, color };
  }
  function refill() {
    offer = [0, 1, 2].map((i) => buildPiece(pickShape(), i));
  }

  function removeObj(o) {
    stage.world.remove(o);
    o.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
  }

  function reset() {
    if (grid) grid.forEach((row) => row.forEach((m) => { if (m) removeObj(m); }));
    if (offer) offer.forEach((p) => { if (p) removeObj(p.group); });
    grid = Array.from({ length: N }, () => Array(N).fill(null));
    score = 0; pieces = 0; finished = false;
    scoreEl.textContent = '0'; piecesEl.textContent = '0';
    againBtn.hidden = true;
    let placed = 0;
    while (placed < cfg.prefill) {
      const r = Math.floor(Math.random() * N), c = Math.floor(Math.random() * N);
      if (grid[r][c]) continue;
      const rock = makeTile({ w: CELL - 0.08, h: CELL - 0.08, depth: 0.3, radius: 0.13, color: ROCK, roughness: 0.8 });
      rock.position.set(cellX(c), cellY(r), 0.05);
      stage.world.add(rock);
      popIn(rock, { delay: placed * 40 });
      grid[r][c] = rock;
      placed++;
    }
    refill();
  }
  reset();

  // ---- drag ----
  const canvas = stage.renderer.domElement;
  let drag = null;
  const LIFT = 1.4; // keep the piece above the finger so it stays visible
  function anchorFor(p, x, y) {
    // (x, y) is the piece center; return the board cell of its top-left block
    const left = x - (p.cols * CELL) / 2, top = y + (p.rows * CELL) / 2;
    return { r0: Math.round((boardTop - top) / CELL), c0: Math.round((left - boardLeft) / CELL) };
  }
  function onPointerDown(e) {
    if (finished || drag) return;
    const groups = offer.filter(Boolean).map((p) => p.group);
    const hit = stage.pick(e.clientX, e.clientY, groups);
    let o = hit && hit.object;
    while (o && o.userData.slot === undefined) o = o.parent;
    let p = o ? offer[o.userData.slot] : null;
    if (!p) {
      // generous touch target: anywhere in a tray slot grabs that slot's piece
      const w = stage.pickPlane(e.clientX, e.clientY, 0);
      if (w && w.y - stage.world.position.y < TRAY_CY + TRAY_H / 2 + 0.2) {
        const slot = Math.max(0, Math.min(2, Math.floor((w.x + BOARD_W / 2) / SLOT_W)));
        p = offer[slot];
      }
    }
    if (!p) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    drag = { p, id: e.pointerId, anchor: null };
    tween(p.group.scale, { x: 1, y: 1, z: 1 }, 140, Easing.outBack);
    p.group.position.z = 0.6;
    api.sound.click();
    moveDrag(e);
  }
  function moveDrag(e) {
    const w = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!w) return;
    const x = w.x - stage.world.position.x;
    const y = w.y - stage.world.position.y + LIFT;
    drag.p.group.position.x = x;
    drag.p.group.position.y = y;
    const { r0, c0 } = anchorFor(drag.p, x, y);
    if (fits(drag.p.shape, r0, c0)) {
      drag.anchor = { r0, c0 };
      showGhost(drag.p.shape, r0, c0, drag.p.color);
    } else {
      drag.anchor = null;
      hideGhost();
    }
    drag.overBoard = y - (drag.p.rows * CELL) / 2 < boardTop && y + (drag.p.rows * CELL) / 2 > boardTop - N * CELL;
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    moveDrag(e);
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const d = drag;
    drag = null;
    hideGhost();
    if (d.anchor) { placePiece(d.p, d.anchor.r0, d.anchor.c0); return; }
    if (d.overBoard) {
      api.sound.error();
      api.ui.shake(canvasHost);
    }
    const p = d.p;
    tween(p.group.position, { x: slotX(p.group.userData.slot), y: TRAY_CY, z: 0.05 }, 220, Easing.outCubic);
    tween(p.group.scale, { x: TRAY_SCALE, y: TRAY_SCALE, z: TRAY_SCALE }, 220, Easing.outCubic);
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  function placePiece(p, r0, c0) {
    const cells = SHAPES[p.shape];
    const { rows: clearRows, cols: clearCols } = linesIf(p.shape, r0, c0);
    removeObj(p.group);
    offer[p.group.userData.slot] = null;
    cells.forEach(([dr, dc], i) => {
      const b = makeBlock(p.color);
      b.position.set(cellX(c0 + dc), cellY(r0 + dr), 0.05);
      stage.world.add(b);
      popIn(b, { delay: i * 15, duration: 200 });
      grid[r0 + dr][c0 + dc] = b;
    });
    pieces++;
    piecesEl.textContent = pieces;
    score += cells.length;
    api.sound.move();

    const n = clearRows.length + clearCols.length;
    if (n > 0) {
      score += (10 * n * (n + 1)) / 2;
      const doomed = new Set();
      clearRows.forEach((r) => { for (let c = 0; c < N; c++) doomed.add(r * N + c); });
      clearCols.forEach((c) => { for (let r = 0; r < N; r++) doomed.add(r * N + c); });
      const meshesToClear = [];
      doomed.forEach((k) => {
        const r = Math.floor(k / N), c = k % N;
        if (grid[r][c]) { meshesToClear.push({ m: grid[r][c], k }); grid[r][c] = null; }
      });
      later(() => {
        api.sound.match ? api.sound.match() : api.sound.click();
        meshesToClear.forEach(({ m, k }, i) => {
          if (m.material) { m.material.emissive.set(0xffffff); m.material.emissiveIntensity = 0.9; }
          later(() => tween(m.scale, { x: 0.01, y: 0.01, z: 0.01 }, 200, Easing.outCubic, () => removeObj(m)), (k % N + Math.floor(k / N)) * 12);
        });
        const rect = canvasHost.getBoundingClientRect();
        api.ui.burst(rect.left + rect.width / 2, rect.top + rect.height * 0.35);
        if (n >= 2) api.ui.toast(n >= 3 ? 'Amazing combo!' : 'Double clear!');
      }, 200);
    }
    scoreEl.textContent = score;

    if (score >= cfg.target) {
      finished = true;
      later(() => {
        api.ui.burstFromElement(canvasHost);
        const [s3, s2] = cfg.stars;
        api.win(pieces <= s3 ? 3 : pieces <= s2 ? 2 : 1, { score, pieces });
      }, 600);
      return;
    }
    if (offer.every((x) => !x)) refill();
    if (!anyFit()) {
      finished = true;
      later(() => {
        api.lose(`no piece fits - you reached ${score} of ${cfg.target}. Try again.`);
        againBtn.hidden = false;
      }, 500);
    }
  }

  function onAgain() { api.sound.click(); reset(); }
  againBtn.addEventListener('click', onAgain);

  let hintCancel = [];
  function hint() {
    if (finished || drag || !offer) return;
    let best = null;
    offer.forEach((p) => {
      if (!p) return;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!fits(p.shape, r, c)) continue;
        const { rows, cols } = linesIf(p.shape, r, c);
        const v = (rows.length + cols.length) * 100 + SHAPES[p.shape].length + Math.random();
        if (!best || v > best.v) best = { v, p, r, c, lines: rows.length + cols.length };
      }
    });
    if (!best) return;
    showGhost(best.p.shape, best.r, best.c, 0xffd93d);
    hintCancel.forEach((f) => f());
    hintCancel = [];
    ghosts.forEach((g) => { g.material.opacity = 0.75; });
    later(() => { if (!drag) hideGhost(); ghosts.forEach((g) => { g.material.opacity = 0.4; }); }, 1800);
    const g = best.p.group;
    hintCancel.push(tween(g.scale, { x: TRAY_SCALE * 1.3, y: TRAY_SCALE * 1.3, z: TRAY_SCALE * 1.3 }, 180, Easing.outBack, () => tween(g.scale, { x: TRAY_SCALE, y: TRAY_SCALE, z: TRAY_SCALE }, 260, Easing.outCubic)));
    api.ui.toast(best.lines
      ? `${api.playerName}, drag the bouncing piece to the yellow spot - it clears a line!`
      : `${api.playerName}, the bouncing piece fits in the yellow spot.`);
  }

  return {
    unmount: () => {
      finished = true;
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      hintCancel.forEach((f) => f());
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      againBtn.removeEventListener('click', onAgain);
      stage.dispose();
      wrap.remove();
    },
    hint,
    debug: () => {
      const rect = canvas.getBoundingClientRect();
      const toClient = (x, y) => {
        const v = new THREE.Vector3(x, y, 0);
        stage.world.localToWorld(v); v.project(stage.camera);
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      };
      // a move suggestion for test harnesses: grab point and drop point
      let move = null;
      offer.forEach((p) => {
        if (!p || move) return;
        for (let r = 0; r < N && !move; r++) for (let c = 0; c < N && !move; c++) {
          if (!fits(p.shape, r, c)) continue;
          const cx = cellX(c) + ((p.cols - 1) * CELL) / 2, cy = cellY(r) - ((p.rows - 1) * CELL) / 2 - LIFT;
          move = { from: toClient(slotX(p.group.userData.slot), TRAY_CY), to: toClient(cx, cy) };
        }
      });
      return { finished, score, pieces, move };
    },
  };
}

PC.Games.register('blockfit', { mount });
