/**
 * Game 31 - Tangram. Seven classic geometric pieces (2 big triangles, 1
 * medium triangle, 2 small triangles, 1 square, 1 parallelogram) start
 * in a tray under the board. Tap a piece to rotate it in place, drag
 * it to move it - drop it near a matching faint outline (turned the
 * right way) to snap it into the silhouette. Fill the
 * whole silhouette to win.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const SQ2 = Math.SQRT2;

// Solved layout, defined directly as absolute polygons in "slot space" -
// a compact, portrait-friendly stacked arrangement (not a single square,
// but a valid non-overlapping tiling that reads as one connected
// silhouette / little skyline).
const RAW_PIECES = [
  { id: 'big1', color: 0xff4d8d, pts: [[0, 0], [2, 0], [0, 2]] },
  { id: 'big2', color: 0xff9f43, pts: [[2, 0], [2, 2], [0, 2]] },
  { id: 'medium', color: 0xffd93d, pts: [[2.3, 0], [2.3 + SQ2, 0], [2.3, SQ2]] },
  { id: 'small1', color: 0x23d18b, pts: [[0, 2.3], [1, 2.3], [0, 3.3]] },
  { id: 'small2', color: 0x17c3b2, pts: [[1.3, 2.3], [2.3, 2.3], [1.3, 3.3]] },
  { id: 'square', color: 0x3f8efc, pts: [[2.6, 2.3], [3.6, 2.3], [3.6, 3.3], [2.6, 3.3]] },
  { id: 'parallelogram', color: 0xa259ff, pts: [[0, 3.6], [1, 3.6], [1.5, 4.6], [0.5, 4.6]] },
];

function centroidOf(pts) {
  let cx = 0, cy = 0;
  pts.forEach(([x, y]) => { cx += x; cy += y; });
  return [cx / pts.length, cy / pts.length];
}

// overall bounding-box center, so the whole silhouette sits at world origin
function overallCenter() {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  RAW_PIECES.forEach((p) => p.pts.forEach(([x, y]) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

const CONFIG = {
  easy: { rotStep: 90, posTol: 0.6, ghostOpacity: 0.26, shuffleRot: [0, 90, 180, 270] },
  medium: { rotStep: 45, posTol: 0.45, ghostOpacity: 0.16, shuffleRot: [0, 45, 90, 135, 180, 225, 270, 315] },
  hard: { rotStep: 45, posTol: 0.35, ghostOpacity: 0.1, shuffleRot: [45, 90, 135, 180, 225, 270, 315] },
};

function makePolyMesh(localPts, color, opacity = 1) {
  const shape = new THREE.Shape();
  shape.moveTo(localPts[0][0], localPts[0][1]);
  for (let i = 1; i < localPts.length; i++) shape.lineTo(localPts[i][0], localPts[i][1]);
  shape.closePath();
  const depth = 0.24;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -depth / 2);
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.4, metalness: 0.08, clearcoat: 0.6, clearcoatRoughness: 0.22,
    transparent: opacity < 1, opacity, emissive: color, emissiveIntensity: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = opacity >= 1;
  mesh.receiveShadow = true;
  return mesh;
}

function angleNorm(deg) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function rotatePts(pts, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

// Same polygon (as a vertex set) - lets symmetric pieces (the square, the
// parallelogram turned 180) and identical twins (the two big / two small
// triangles) snap into any matching outline.
function sameShape(a, b) {
  if (a.length !== b.length) return false;
  return a.every(([x, y]) => b.some(([u, v]) => Math.hypot(x - u, y - v) < 0.08));
}

// Fit a (halfW x halfH) world rectangle inside the canvas host, measured at
// mount time, leaving room for DOM overlays (reserve, in px) and a small
// safety margin so nothing crops on narrow phones.
function fitView(host, halfW, halfH, { margin = 1.06, reserveTop = 0, reserveBottom = 0 } = {}) {
  const w = host.clientWidth || 320, h = host.clientHeight || 480;
  const aspect = Math.max(0.3, w / h);
  const f = Math.max(0.5, (h - reserveTop - reserveBottom) / h);
  const halfVis = Math.max(halfH / f, halfW / aspect) * margin;
  return { distance: halfVis / 0.42, lookAtY: -halfVis * (reserveBottom - reserveTop) / h };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const oc = overallCenter();
  let alive = true;
  const timers = new Set();
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
    timers.add(id);
  }

  // Slots are the target outlines; pieces are the movable shapes. A piece
  // may fill any free slot with the same shape.
  const slots = RAW_PIECES.map((def) => {
    const [ccx, ccy] = centroidOf(def.pts);
    return { localPts: def.pts.map(([x, y]) => [x - ccx, y - ccy]), x: ccx - oc.cx, y: 0, rawY: ccy - oc.cy, filled: false };
  });
  const pieces = RAW_PIECES.map((def, i) => ({ id: def.id, color: def.color, localPts: slots[i].localPts, placed: false, x: 0, y: 0, rot: 0, spin: 0 }));

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="tg-meta">Placed: <span id="tg-count">0</span>/7 &nbsp; Moves: <span id="tg-actions">0</span></div>
    <div class="pc-canvas3d" id="tg-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a piece to turn it. Drag it onto the outline.</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#tg-canvas');
  const countEl = wrap.querySelector('#tg-count');
  const actionsEl = wrap.querySelector('#tg-actions');

  // Layout: silhouette on top, a tray of loose pieces below it. Pick the
  // tray column count that lets everything appear largest on this screen.
  const SLOT_W = 1.95, SLOT_H = 1.8, GAP = 0.35, CHIP_PAD = 0.75;
  let best = null;
  [2, 3, 4].forEach((cols) => {
    const trayRows = Math.ceil(pieces.length / cols);
    const halfW = Math.max(oc.w, cols * SLOT_W) / 2 + 0.1;
    const halfH = (oc.h + GAP + trayRows * SLOT_H + CHIP_PAD) / 2 + 0.1;
    const view = fitView(canvasHost, halfW, halfH, { reserveBottom: 50 });
    if (!best || view.distance < best.view.distance) best = { cols, trayRows, halfH, view };
  });
  const stage = createStage(canvasHost, best.view);
  const silTop = best.halfH - 0.1;
  const silCenterY = silTop - oc.h / 2;
  slots.forEach((sl) => { sl.y = sl.rawY + silCenterY; });
  const trayTop = silTop - oc.h - GAP;

  // ghost target outlines
  const ghosts = slots.map((sl) => {
    const mesh = makePolyMesh(sl.localPts, 0xffffff, cfg.ghostOpacity);
    mesh.position.set(sl.x, sl.y, -0.05);
    mesh.castShadow = false;
    stage.world.add(mesh);
    return mesh;
  });

  // tray spots, shuffled so the order differs each game
  const traySpots = [];
  for (let i = 0; i < pieces.length; i++) {
    const r = Math.floor(i / best.cols), c = i % best.cols;
    const inRow = Math.min(best.cols, pieces.length - r * best.cols);
    traySpots.push({ x: (c - (inRow - 1) / 2) * SLOT_W, y: trayTop - SLOT_H / 2 - r * SLOT_H });
  }
  for (let i = traySpots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [traySpots[i], traySpots[j]] = [traySpots[j], traySpots[i]]; }

  let actions = 0, placedCount = 0, finished = false;
  const meshes = pieces.map((p, i) => {
    const mesh = makePolyMesh(p.localPts, p.color);
    const spot = traySpots[i];
    p.x = spot.x; p.y = spot.y;
    p.rot = cfg.shuffleRot[Math.floor(Math.random() * cfg.shuffleRot.length)];
    p.spin = p.rot;
    mesh.position.set(p.x, p.y, 0);
    mesh.rotation.z = (p.spin * Math.PI) / 180;
    mesh.userData.pieceIdx = i;
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 60 });
    return mesh;
  });

  function updateCount() {
    countEl.textContent = placedCount;
    actionsEl.textContent = actions;
  }

  function matchingSlot(idx, needPos) {
    const p = pieces[idx];
    const shape = rotatePts(p.localPts, p.rot);
    let bestSlot = -1, bestD = Infinity;
    slots.forEach((sl, si) => {
      if (sl.filled || !sameShape(shape, sl.localPts)) return;
      const d = Math.hypot(p.x - sl.x, p.y - sl.y);
      if (needPos && d > cfg.posTol) return;
      if (d < bestD) { bestD = d; bestSlot = si; }
    });
    return bestSlot;
  }

  function checkSnap(idx) {
    const si = matchingSlot(idx, true);
    if (si === -1) return false;
    const p = pieces[idx], sl = slots[si];
    p.placed = true; sl.filled = true;
    p.x = sl.x; p.y = sl.y;
    const mesh = meshes[idx];
    tween(mesh.position, { x: sl.x, y: sl.y, z: 0 }, 220, Easing.outBack);
    mesh.material.emissiveIntensity = 0.6;
    tween(mesh.material, { emissiveIntensity: 0 }, 450, Easing.outCubic);
    ghosts[si].visible = false;
    placedCount++;
    api.sound.match ? api.sound.match() : api.sound.click();
    updateCount();
    if (placedCount >= pieces.length) winGame();
    return true;
  }

  function winGame() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const idealActions = pieces.length * 2;
    const stars = actions <= idealActions + 4 ? 3 : actions <= idealActions + 12 ? 2 : 1;
    later(() => api.win(stars, { actions }), 300);
  }

  // ---- interaction ----
  let dragIdx = -1, dragOffsetX = 0, dragOffsetY = 0, downX = 0, downY = 0, moved = false, dragPointer = null;
  const el = stage.renderer.domElement;

  // Generous grabbing: an exact hit, or else the nearest loose piece whose
  // centre is within reach of the finger.
  function pieceAt(clientX, clientY) {
    const hit = stage.pick(clientX, clientY, meshes.filter((m, i) => !pieces[i].placed));
    if (hit) return hit.object.userData.pieceIdx;
    const w = stage.pickPlane(clientX, clientY, 0);
    if (!w) return -1;
    let bestIdx = -1, bestD = 0.85;
    pieces.forEach((p, i) => {
      if (p.placed) return;
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d < bestD) { bestD = d; bestIdx = i; }
    });
    return bestIdx;
  }

  function viewBounds() {
    const cam = stage.camera;
    return { minX: cam.left + 0.3, maxX: cam.right - 0.3, minY: cam.bottom + 0.3, maxY: cam.top - 0.3 };
  }

  function onDown(e) {
    if (finished || dragIdx !== -1) return;
    const idx = pieceAt(e.clientX, e.clientY);
    if (idx === -1) return;
    dragIdx = idx; moved = false; dragPointer = e.pointerId;
    downX = e.clientX; downY = e.clientY;
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    dragOffsetX = world ? pieces[idx].x - world.x : 0;
    dragOffsetY = world ? pieces[idx].y - world.y : 0;
    meshes[idx].position.z = 0.2;
    tween(meshes[idx].scale, { x: 1.06, y: 1.06, z: 1.06 }, 100, Easing.outCubic);
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onMove(e) {
    if (dragIdx === -1 || e.pointerId !== dragPointer) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 10) moved = true;
    if (!moved) return;
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!world) return;
    const p = pieces[dragIdx];
    const b = viewBounds();
    p.x = Math.max(b.minX, Math.min(b.maxX, world.x + dragOffsetX));
    p.y = Math.max(b.minY, Math.min(b.maxY, world.y + dragOffsetY));
    meshes[dragIdx].position.set(p.x, p.y, 0.2);
  }
  function onUp(e) {
    if (dragIdx === -1 || e.pointerId !== dragPointer) return;
    const idx = dragIdx; dragIdx = -1; dragPointer = null;
    const p = pieces[idx];
    const mesh = meshes[idx];
    mesh.position.z = 0;
    tween(mesh.scale, { x: 1, y: 1, z: 1 }, 120, Easing.outCubic);
    if (finished) return;
    if (!moved) {
      // tap: rotate (spin keeps growing so the turn always animates forward)
      p.rot = angleNorm(p.rot + cfg.rotStep);
      p.spin += cfg.rotStep;
      tween(mesh.rotation, { z: (p.spin * Math.PI) / 180 }, 200, Easing.outBack);
      actions++;
      api.sound.click();
      updateCount();
      checkSnap(idx);
    } else {
      actions++;
      updateCount();
      if (!checkSnap(idx)) api.sound.move();
    }
  }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  let hintTimer = null;
  let hintGhost = -1;
  function hint() {
    if (finished) return;
    const idx = pieces.findIndex((p) => !p.placed);
    if (idx === -1) return;
    // find the free outline this piece belongs to and how many taps it needs
    let slotIdx = -1, taps = 0;
    for (let t = 0; t < 360 / cfg.rotStep && slotIdx === -1; t++) {
      const shape = rotatePts(pieces[idx].localPts, pieces[idx].rot + t * cfg.rotStep);
      const si = slots.findIndex((sl) => !sl.filled && sameShape(shape, sl.localPts));
      if (si !== -1) { slotIdx = si; taps = t; }
    }
    const mat = meshes[idx].material;
    mat.emissiveIntensity = 0.7;
    tween(mat, { emissiveIntensity: 0 }, 900, Easing.outCubic);
    tween(meshes[idx].scale, { x: 1.15, y: 1.15, z: 1.15 }, 160, Easing.outBack, () => tween(meshes[idx].scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
    if (hintGhost !== -1 && ghosts[hintGhost]) { ghosts[hintGhost].material.opacity = cfg.ghostOpacity; ghosts[hintGhost].material.color.set(0xffffff); }
    if (slotIdx !== -1) {
      hintGhost = slotIdx;
      ghosts[slotIdx].material.opacity = 0.65;
      ghosts[slotIdx].material.color.set(pieces[idx].color);
    }
    const turnText = taps === 0 ? 'it is already turned the right way' : `tap it ${taps} time${taps > 1 ? 's' : ''} to turn it`;
    api.ui.toast(`${api.playerName}, ${turnText}, then drag it onto the matching outline!`, { duration: 2600 });
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintTimer = null;
      if (!alive || hintGhost === -1) return;
      ghosts[hintGhost].material.opacity = cfg.ghostOpacity;
      ghosts[hintGhost].material.color.set(0xffffff);
      hintGhost = -1;
    }, 3200);
  }

  return {
    unmount: () => {
      alive = false;
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      if (hintTimer) clearTimeout(hintTimer);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('tangram', { mount });
