/**
 * Game 31 - Tangram. Seven classic geometric pieces (2 big triangles, 1
 * medium triangle, 2 small triangles, 1 square, 1 parallelogram) start
 * scattered around the board. Tap a piece to rotate it in place, drag
 * it to move it - drop it near its faint target outline (with a close
 * enough position + rotation) to snap it into the silhouette. Fill the
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
  easy: { rotStep: 90, posTol: 0.4, rotTol: 28, ghosts: 'always', shuffleRot: [0, 90, 180, 270] },
  medium: { rotStep: 45, posTol: 0.28, rotTol: 16, ghosts: 'dim', shuffleRot: [0, 45, 90, 135, 180, 225, 270, 315] },
  hard: { rotStep: 45, posTol: 0.2, rotTol: 10, ghosts: 'hint-only', shuffleRot: [45, 90, 135, 180, 225, 270, 315] },
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
function angleDiff(a, b) {
  const d = Math.abs(angleNorm(a) - angleNorm(b));
  return Math.min(d, 360 - d);
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const oc = overallCenter();

  // build canonical pieces: local shape (centered at its own centroid),
  // target world position/rotation(0), and per-piece live state.
  const pieces = RAW_PIECES.map((def) => {
    const [ccx, ccy] = centroidOf(def.pts);
    const localPts = def.pts.map(([x, y]) => [x - ccx, y - ccy]);
    const targetX = ccx - oc.cx, targetY = ccy - oc.cy;
    return { id: def.id, color: def.color, localPts, targetX, targetY, placed: false };
  });

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="tg-meta">Placed: <span id="tg-count">0</span>/7 &nbsp; Actions: <span id="tg-actions">0</span></div>
    <div class="pc-canvas3d" id="tg-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a piece to rotate - drag it onto its glowing outline</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#tg-canvas');
  const countEl = wrap.querySelector('#tg-count');
  const actionsEl = wrap.querySelector('#tg-actions');

  // Portrait canvases are narrow, so a wide-ish silhouette needs a
  // generous distance - also leave room around it for scattered pieces.
  const distance = Math.max(oc.w, oc.h) * 4.4;
  const stage = createStage(canvasHost, { distance });

  // ghost target outlines
  const ghosts = pieces.map((p) => {
    const mesh = makePolyMesh(p.localPts, 0xffffff, cfg.ghosts === 'always' ? 0.22 : 0.1);
    mesh.position.set(p.targetX, p.targetY, -0.05);
    mesh.castShadow = false;
    stage.world.add(mesh);
    return mesh;
  });

  // scatter positions around the silhouette, within camera view
  const scatterSpots = [
    { x: -oc.w * 1.05, y: oc.h * 0.35 }, { x: oc.w * 1.05, y: oc.h * 0.35 },
    { x: -oc.w * 1.05, y: -oc.h * 0.15 }, { x: oc.w * 1.05, y: -oc.h * 0.15 },
    { x: -oc.w * 0.55, y: oc.h * 0.85 }, { x: oc.w * 0.55, y: oc.h * 0.85 },
    { x: 0, y: -oc.h * 0.62 },
  ];

  let actions = 0, placedCount = 0, finished = false;
  const meshes = pieces.map((p, i) => {
    const mesh = makePolyMesh(p.localPts, p.color);
    const spot = scatterSpots[i % scatterSpots.length];
    p.x = spot.x + (Math.random() - 0.5) * 0.3;
    p.y = spot.y + (Math.random() - 0.5) * 0.3;
    const rotChoices = cfg.shuffleRot;
    p.rot = rotChoices[Math.floor(Math.random() * rotChoices.length)];
    mesh.position.set(p.x, p.y, 0);
    mesh.rotation.z = (p.rot * Math.PI) / 180;
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 60 });
    return mesh;
  });

  function updateCount() {
    countEl.textContent = placedCount;
    actionsEl.textContent = actions;
  }

  function checkSnap(idx) {
    const p = pieces[idx];
    const dx = p.x - p.targetX, dy = p.y - p.targetY;
    const dist = Math.hypot(dx, dy);
    const rdiff = angleDiff(p.rot, 0);
    if (dist <= cfg.posTol && rdiff <= cfg.rotTol) {
      p.placed = true;
      p.x = p.targetX; p.y = p.targetY; p.rot = 0;
      const mesh = meshes[idx];
      tween(mesh.position, { x: p.targetX, y: p.targetY }, 220, Easing.outBack);
      tween(mesh.rotation, { z: 0 }, 220, Easing.outBack);
      tween(mesh.material, { emissiveIntensity: 0.6 }, 150, Easing.outCubic, () => {
        tween(mesh.material, { emissiveIntensity: 0 }, 300, Easing.outCubic);
      });
      ghosts[idx].material.opacity = 0;
      placedCount++;
      api.sound.click();
      updateCount();
      if (placedCount >= pieces.length) winGame();
      return true;
    }
    return false;
  }

  function winGame() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const idealActions = pieces.length * 2;
    const stars = actions <= idealActions + 3 ? 3 : actions <= idealActions + 10 ? 2 : 1;
    setTimeout(() => api.win(stars, { actions }), 300);
  }

  // ---- interaction ----
  let dragIdx = -1, dragOffsetX = 0, dragOffsetY = 0, downX = 0, downY = 0, moved = false;
  const el = stage.renderer.domElement;

  function onDown(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, meshes);
    if (!hit) return;
    const idx = meshes.indexOf(hit.object);
    if (idx === -1 || pieces[idx].placed) return;
    dragIdx = idx; moved = false;
    downX = e.clientX; downY = e.clientY;
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (world) { dragOffsetX = pieces[idx].x - world.x; dragOffsetY = pieces[idx].y - world.y; }
    el.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (dragIdx === -1) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true;
    if (!moved) return;
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!world) return;
    const p = pieces[dragIdx];
    p.x = world.x + dragOffsetX; p.y = world.y + dragOffsetY;
    meshes[dragIdx].position.set(p.x, p.y, 0.15);
  }
  function onUp(e) {
    if (dragIdx === -1) return;
    const idx = dragIdx; dragIdx = -1;
    const p = pieces[idx];
    meshes[idx].position.z = 0;
    if (!moved) {
      // tap: rotate
      p.rot = angleNorm(p.rot + cfg.rotStep);
      tween(meshes[idx].rotation, { z: (p.rot * Math.PI) / 180 }, 200, Easing.outBack);
      actions++;
      api.sound.click();
      updateCount();
      checkSnap(idx);
    } else {
      actions++;
      updateCount();
      if (!checkSnap(idx)) {
        api.sound.move();
      }
    }
  }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);

  let hintTimer = null;
  function hint() {
    if (finished) return;
    const idx = pieces.findIndex((p) => !p.placed);
    if (idx === -1) return;
    ghosts[idx].material.opacity = 0.6;
    tween(meshes[idx].material, { emissiveIntensity: 0.7 }, 200, Easing.outCubic, () => {
      tween(meshes[idx].material, { emissiveIntensity: 0 }, 400, Easing.outCubic);
    });
    api.ui.toast(`${api.playerName}, rotate & drag the glowing piece onto its outline!`);
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (cfg.ghosts !== 'always') ghosts[idx].material.opacity = cfg.ghosts === 'dim' ? 0.1 : 0;
    }, 2600);
  }

  return {
    unmount: () => {
      finished = true;
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
