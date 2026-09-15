/**
 * Game 28 - Bubble Shooter (3D). Drag to aim, release to fire a colored
 * bubble up into the hex grid. Three or more of the same color pop -
 * and anything left floating falls too. Clear your target bubble count
 * before any bubble creeps down past the danger line.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { colors: 4, startRows: 3, target: 18, pushEvery: 8 },
  medium: { colors: 5, startRows: 4, target: 32, pushEvery: 7 },
  hard: { colors: 6, startRows: 5, target: 48, pushEvery: 6 },
};
const COLS = 8;
const CELL = 0.62;
const ROW_H = CELL * 0.866;
const ROWS_VISIBLE = 9; // rows 0..ROWS_VISIBLE-1 are the safe playing field
const DANGER_ROW = ROWS_VISIBLE - 1;
const SHOOT_SPEED = 9.5; // world units / second

function rowLen(r) { return r % 2 === 0 ? COLS : COLS - 1; }
function cellX(r, c) { return (c - (rowLen(r) - 1) / 2) * CELL; }
function cellY(r, topY) { return topY - r * ROW_H; }

function neighbors(r, c) {
  const even = r % 2 === 0;
  const diagUp = even ? [[-1, -1], [-1, 0]] : [[-1, 0], [-1, 1]];
  const diagDown = even ? [[1, -1], [1, 0]] : [[1, 0], [1, 1]];
  return [[0, -1], [0, 1], ...diagUp, ...diagDown].map(([dr, dc]) => [r + dr, c + dc]);
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const numColors = cfg.colors;
  const grid = new Map(); // "r,c" -> colorIdx
  let shotsTaken = 0, popped = 0, finished = false, busy = false;
  const colorPool = PALETTE.slice(0, numColors);

  function key(r, c) { return r + ',' + c; }
  function inRow(c, r) { return c >= 0 && c < rowLen(r); }

  for (let r = 0; r < cfg.startRows; r++) {
    for (let c = 0; c < rowLen(r); c++) grid.set(key(r, c), Math.floor(Math.random() * numColors));
  }

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="bb-meta">Cleared: <span id="bb-popped">0</span> / ${cfg.target}</div>
    <div class="pc-canvas3d" id="bb-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Drag to aim, release to shoot</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#bb-canvas');
  const poppedEl = wrap.querySelector('#bb-popped');

  const fieldHalfW = COLS * CELL / 2 + CELL * 0.5;
  const fieldHalfH = (ROWS_VISIBLE * ROW_H + CELL * 2.2) / 2 + 0.4;
  const aspectMin = 0.46;
  const distance = Math.max((fieldHalfW + 0.4) / (0.42 * aspectMin), fieldHalfH / 0.42) * 1.05;
  const stage = createStage(canvasHost, { distance });

  const topY = fieldHalfH - CELL * 0.6;
  const shooterY = topY - (ROWS_VISIBLE + 0.6) * ROW_H;
  const dangerY = cellY(DANGER_ROW, topY);

  // danger line marker
  const dangerLine = new THREE.Mesh(new THREE.PlaneGeometry(fieldHalfW * 2, 0.04), new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.6, toneMapped: false }));
  dangerLine.position.set(0, dangerY - CELL * 0.35, 0.06);
  stage.world.add(dangerLine);

  const bubbleMeshes = new Map(); // key -> mesh
  function makeBubble(colorIdx) {
    return new THREE.Mesh(new THREE.SphereGeometry(CELL * 0.46, 20, 20), new THREE.MeshPhysicalMaterial({ color: colorPool[colorIdx], roughness: 0.25, metalness: 0.2, clearcoat: 0.7 }));
  }
  function addBubbleMesh(r, c, colorIdx, animate) {
    const mesh = makeBubble(colorIdx);
    mesh.position.set(cellX(r, c), cellY(r, topY), 0);
    mesh.castShadow = true;
    stage.world.add(mesh);
    bubbleMeshes.set(key(r, c), mesh);
    if (animate) popIn(mesh, { duration: 180 });
  }
  grid.forEach((colorIdx, k) => { const [r, c] = k.split(',').map(Number); addBubbleMesh(r, c, colorIdx, false); });

  // shooter + next bubble preview
  let currentColor = Math.floor(Math.random() * numColors);
  let nextColor = Math.floor(Math.random() * numColors);
  const shooterMesh = makeBubble(currentColor);
  shooterMesh.position.set(0, shooterY, 0.1);
  stage.world.add(shooterMesh);
  popIn(shooterMesh, { duration: 200 });
  const nextMesh = makeBubble(nextColor);
  nextMesh.scale.set(0.6, 0.6, 0.6);
  nextMesh.position.set(fieldHalfW - 0.4, shooterY - 0.5, 0.1);
  stage.world.add(nextMesh);

  const aimMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const aimGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, shooterY, 0.05), new THREE.Vector3(0, shooterY + 2, 0.05)]);
  const aimLine = new THREE.Line(aimGeo, aimMat);
  aimLine.visible = false;
  stage.world.add(aimLine);

  let aiming = false;
  let projectile = null; // { pos: {x,y}, vx, vy }

  function updateAimLine(dirX, dirY) {
    const p0 = new THREE.Vector3(0, shooterY, 0.05);
    const p1 = new THREE.Vector3(dirX * 3, shooterY + dirY * 3, 0.05);
    aimLine.geometry.setFromPoints([p0, p1]);
    aimLine.visible = true;
  }

  function onPointerDown(e) {
    if (finished || busy) return;
    aiming = { dx: 0, dy: 1 };
    updateFromPointer(e);
  }
  function updateFromPointer(e) {
    const pt = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!pt) return;
    let dx = pt.x - 0, dy = pt.y - shooterY;
    if (dy < 0.5) dy = 0.5;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    updateAimLine(dx, dy);
    if (aiming) aiming = { dx, dy };
  }
  function onPointerMove(e) {
    if (!aiming) return;
    updateFromPointer(e);
  }
  function onPointerUp() {
    if (!aiming || finished || busy) { aiming = false; return; }
    const { dx, dy } = aiming;
    aiming = false;
    aimLine.visible = false;
    fireShot(dx, dy);
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  function fireShot(dx, dy) {
    busy = true;
    shotsTaken++;
    projectile = { x: 0, y: shooterY, vx: dx * SHOOT_SPEED, vy: dy * SHOOT_SPEED, color: currentColor };
    api.sound.move();
  }

  function nearestCell(x, y) {
    let best = null, bestDist = Infinity;
    for (let r = 0; r <= DANGER_ROW + 1; r++) {
      for (let c = 0; c < rowLen(r); c++) {
        const cx = cellX(r, c), cy = cellY(r, topY);
        const d = Math.hypot(cx - x, cy - y);
        if (d < bestDist) { bestDist = d; best = [r, c]; }
      }
    }
    return best;
  }

  function settleProjectile() {
    let target = null;
    // check collision against existing bubbles
    for (const [k, mesh] of bubbleMeshes) {
      const d = Math.hypot(mesh.position.x - projectile.x, mesh.position.y - projectile.y);
      if (d < CELL * 0.92) {
        const [r, c] = k.split(',').map(Number);
        const empties = neighbors(r, c).filter(([rr, cc]) => rr >= 0 && inRow(cc, rr) && !grid.has(key(rr, cc)));
        if (empties.length) {
          empties.sort((a, b) => Math.hypot(cellX(a[0], a[1]) - projectile.x, cellY(a[0], topY) - projectile.y) - Math.hypot(cellX(b[0], b[1]) - projectile.x, cellY(b[0], topY) - projectile.y));
          target = empties[0];
        }
        break;
      }
    }
    if (!target) target = nearestCell(projectile.x, projectile.y);
    if (!target) target = [0, 0];
    if (grid.has(key(target[0], target[1]))) target = nearestCell(projectile.x, projectile.y);
    landBubble(target[0], target[1], projectile.color);
    projectile = null;
  }

  function landBubble(r, c, colorIdx) {
    if (r < 0) r = 0;
    grid.set(key(r, c), colorIdx);
    addBubbleMesh(r, c, colorIdx, true);
    api.sound.click();
    resolveMatches(r, c);
  }

  function floodSameColor(r, c) {
    const colorIdx = grid.get(key(r, c));
    const seen = new Set([key(r, c)]);
    const stack = [[r, c]];
    while (stack.length) {
      const [cr, cc] = stack.pop();
      neighbors(cr, cc).forEach(([nr, nc]) => {
        const nk = key(nr, nc);
        if (seen.has(nk) || !grid.has(nk) || grid.get(nk) !== colorIdx) return;
        seen.add(nk);
        stack.push([nr, nc]);
      });
    }
    return [...seen];
  }

  function removeCells(cells) {
    cells.forEach((k) => {
      const mesh = bubbleMeshes.get(k);
      if (mesh) { tween(mesh.scale, { x: 0.01, y: 0.01, z: 0.01 }, 180, Easing.inOutQuad, () => stage.world.remove(mesh)); }
      bubbleMeshes.delete(k);
      grid.delete(k);
    });
  }

  function dropFloating() {
    const reachable = new Set();
    const stack = [];
    for (let c = 0; c < rowLen(0); c++) if (grid.has(key(0, c))) { reachable.add(key(0, c)); stack.push([0, c]); }
    while (stack.length) {
      const [r, c] = stack.pop();
      neighbors(r, c).forEach(([nr, nc]) => {
        const nk = key(nr, nc);
        if (reachable.has(nk) || !grid.has(nk)) return;
        reachable.add(nk);
        stack.push([nr, nc]);
      });
    }
    const floating = [...grid.keys()].filter((k) => !reachable.has(k));
    return floating;
  }

  function resolveMatches(r, c) {
    const group = floodSameColor(r, c);
    let totalRemoved = 0;
    if (group.length >= 3) {
      removeCells(group);
      totalRemoved += group.length;
      api.ui.burstFromElement(canvasHost, { count: 10 });
      const floating = dropFloating();
      if (floating.length) { removeCells(floating); totalRemoved += floating.length; }
    }
    popped += totalRemoved;
    poppedEl.textContent = popped;
    if (totalRemoved > 0) api.sound.match();

    if (popped >= cfg.target) { win(); return; }
    checkDanger();
    if (finished) return;

    shooterMesh.material.color.set(colorPool[nextColor]);
    currentColor = nextColor;
    nextColor = Math.floor(Math.random() * numColors);
    nextMesh.material.color.set(colorPool[nextColor]);

    if (shotsTaken % cfg.pushEvery === 0) pushNewRow();
    busy = false;
  }

  function pushNewRow() {
    const shifted = new Map();
    grid.forEach((colorIdx, k) => { const [r, c] = k.split(',').map(Number); shifted.set(key(r + 1, c), colorIdx); });
    grid.clear();
    shifted.forEach((v, k) => grid.set(k, v));
    for (let c = 0; c < rowLen(0); c++) grid.set(key(0, c), Math.floor(Math.random() * numColors));
    bubbleMeshes.forEach((mesh) => stage.world.remove(mesh));
    bubbleMeshes.clear();
    grid.forEach((colorIdx, k) => { const [r, c] = k.split(',').map(Number); addBubbleMesh(r, c, colorIdx, true); });
    checkDanger();
  }

  function checkDanger() {
    for (const k of grid.keys()) {
      const [r] = k.split(',').map(Number);
      if (r >= DANGER_ROW) { lose(); return; }
    }
  }

  function win() {
    finished = true;
    api.ui.burstFromElement(canvasHost);
    const idealShots = Math.ceil(cfg.target / 2.4);
    const stars = shotsTaken <= idealShots ? 3 : shotsTaken <= idealShots * 1.7 ? 2 : 1;
    setTimeout(() => api.win(stars, { shotsTaken, popped }), 300);
  }
  function lose() {
    finished = true;
    setTimeout(() => api.lose('the bubbles reached the danger line. Try again.'), 200);
  }

  stage.onTick(() => {
    if (!projectile) return;
    const dt = 1 / 60;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    if (projectile.x < -fieldHalfW + CELL * 0.46) { projectile.x = -fieldHalfW + CELL * 0.46; projectile.vx *= -1; }
    if (projectile.x > fieldHalfW - CELL * 0.46) { projectile.x = fieldHalfW - CELL * 0.46; projectile.vx *= -1; }
    shooterMesh.position.set(projectile.x, projectile.y, 0.1);
    let hit = false;
    for (const mesh of bubbleMeshes.values()) {
      if (Math.hypot(mesh.position.x - projectile.x, mesh.position.y - projectile.y) < CELL * 0.92) { hit = true; break; }
    }
    if (hit || projectile.y >= topY + CELL * 0.3) {
      settleProjectile();
      shooterMesh.position.set(0, shooterY, 0.1);
    }
  });

  function hint() {
    if (finished || busy) return;
    let best = null, bestScore = -1;
    grid.forEach((colorIdx, k) => {
      if (colorIdx !== currentColor) return;
      const [r, c] = k.split(',').map(Number);
      const sameNeighbors = neighbors(r, c).filter(([nr, nc]) => grid.get(key(nr, nc)) === currentColor).length;
      if (sameNeighbors > bestScore) { bestScore = sameNeighbors; best = [r, c]; }
    });
    if (!best) { api.ui.toast(`${api.playerName}, aim anywhere near the top to start a new cluster!`); return; }
    const mesh = bubbleMeshes.get(key(best[0], best[1]));
    if (mesh) {
      tween(mesh.scale, { x: 1.4, y: 1.4, z: 1.4 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
    }
    api.ui.toast(`${api.playerName}, aim at the glowing cluster - it matches your color!`);
  }

  return {
    unmount: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('bubbleshooter', { mount });
