/**
 * Game 8 - Jigsaw Puzzle (3D). A procedurally-painted "photo" (no
 * scraped art - generated on a canvas) is diced into a grid of beveled
 * 3D pieces. The board sits on top and the loose pieces wait in a tray
 * below it (portrait phones); drag each one up into its slot.
 */
import * as THREE from 'three';
import { createStage, roundedRectShape, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { cols: 3, rows: 3 },
  medium: { cols: 4, rows: 4 },
  hard: { cols: 5, rows: 5 },
};
const PIECE = 0.9;
const GAP = 0.06;
const PITCH = PIECE + GAP;
const SNAP_DIST = PITCH * 0.5; // forgiving: anywhere over the right slot snaps
const TRAY_GAP = 0.45;

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

function paintScene(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, size);
  sky.addColorStop(0, '#ff9f43'); sky.addColorStop(0.45, '#ff4d8d'); sky.addColorStop(1, '#6a2dd6');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, size, size);
  // sun
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath(); ctx.arc(size * 0.72, size * 0.32, size * 0.14, 0, Math.PI * 2); ctx.fill();
  // mountains
  const mountainColors = ['#3f1b8f', '#5b2bb8', '#7a3fd6'];
  mountainColors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    const baseY = size * (0.62 + i * 0.1);
    ctx.moveTo(0, size);
    ctx.lineTo(0, baseY + 40);
    for (let x = 0; x <= size; x += size / 6) {
      const y = baseY - Math.sin(x / size * Math.PI * (1.5 + i) + i) * size * 0.08 - i * 10;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();
  });
  // stars
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size, y = Math.random() * size * 0.5;
    ctx.beginPath(); ctx.arc(x, y, Math.random() * 2 + 0.6, 0, Math.PI * 2); ctx.fill();
  }
  return canvas;
}

function starsForMisplacedTries(wrongDrops, total) {
  if (wrongDrops <= total * 0.3) return 3;
  if (wrongDrops <= total * 0.9) return 2;
  return 1;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const { cols, rows } = cfg;
  const total = cols * rows;
  const life = lifecycle();
  let placedCount = 0, wrongDrops = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="jg-meta"><span>Placed: <span id="jg-placed">0</span>/${total}</span></div>
    <div class="pc-canvas3d" id="jg-canvas"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#jg-canvas');
  const placedEl = wrap.querySelector('#jg-placed');

  // Layout (world units): board centered at y = boardY, tray grid below it.
  const boardW = cols * PITCH, boardH = rows * PITCH;
  const boardY = (boardH + TRAY_GAP) / 2;
  const trayY = boardY - boardH / 2 - TRAY_GAP - boardH / 2;
  const totalH = boardH * 2 + TRAY_GAP;
  const stage = createStage(canvasHost, { distance: totalH * 1.2 });
  fitBoard(stage, canvasHost, boardW + 0.2, totalH + 0.2, { pad: 10, top: 10, bottom: 10 });
  const halfC = (cols - 1) / 2, halfR = (rows - 1) / 2;
  function slotXY(r, c) { return { x: (c - halfC) * PITCH, y: boardY + (halfR - r) * PITCH }; }
  function trayXY(i) { const r = Math.floor(i / cols), c = i % cols; return { x: (c - halfC) * PITCH, y: trayY + (halfR - r) * PITCH }; }

  // board backing + slot outlines
  const backing = makeTile({ w: boardW + 0.12, h: boardH + 0.12, depth: 0.06, radius: 0.12, color: 0x1a0c30, roughness: 0.9 });
  backing.position.set(0, boardY, -0.12);
  backing.castShadow = false;
  stage.world.add(backing);
  const tray = makeTile({ w: boardW + 0.12, h: boardH + 0.12, depth: 0.04, radius: 0.12, color: 0xffffff, opacity: 0.08 });
  tray.position.set(0, trayY, -0.14);
  tray.castShadow = false;
  stage.world.add(tray);
  const slotMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const { x, y } = slotXY(r, c);
    const shape = roundedRectShape(PIECE, PIECE, 0.08);
    const points = shape.getPoints(20).map((p) => new THREE.Vector3(p.x, p.y, 0.005));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geo, slotMat);
    line.position.set(x, y, -0.05);
    stage.world.add(line);
  }

  const image = paintScene(512);
  const baseTexture = new THREE.CanvasTexture(image);
  baseTexture.colorSpace = THREE.SRGBColorSpace;

  const pieces = [];
  const order = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push({ r, c });
  let trayOrder;
  do { trayOrder = order.map((_, i) => i).sort(() => Math.random() - 0.5); } while (total > 1 && trayOrder.every((v, i) => v === i));

  order.forEach(({ r, c }, i) => {
    const tex = baseTexture.clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(1 / cols, 1 / rows);
    tex.offset.set(c / cols, (rows - 1 - r) / rows);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;

    const mesh = makeTile({ w: PIECE, h: PIECE, depth: 0.16, radius: 0.07, color: 0x241436, roughness: 0.6 });
    const faceMat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false, depthTest: false, toneMapped: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PIECE * 0.94, PIECE * 0.94), faceMat);
    face.position.z = 0.16 / 2 + 0.02;
    face.renderOrder = 10;
    mesh.add(face);
    mesh.castShadow = true; mesh.receiveShadow = true;

    const home = trayXY(trayOrder.indexOf(i));
    mesh.position.set(home.x, home.y, 0.05);
    mesh.rotation.z = (Math.random() - 0.5) * 0.3;
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 25, duration: 260 });

    const piece = { r, c, mesh, face, placed: false, target: slotXY(r, c), home };
    mesh.userData.piece = piece;
    face.userData.piece = piece;
    pieces.push(piece);
  });

  function meshList() { return pieces.filter((p) => !p.placed).map((p) => p.mesh); }

  function placePiece(p, duration) {
    p.placed = true;
    p.face.renderOrder = 5;
    tween(p.mesh.rotation, { z: 0 }, duration, Easing.outCubic);
    tween(p.mesh.position, { x: p.target.x, y: p.target.y, z: 0 }, duration, Easing.outBack, () => {
      if (life.dead) return;
      tween(p.mesh.scale, { x: 1, y: 1, z: 1 }, 120, Easing.outCubic);
      placedCount++;
      placedEl.textContent = placedCount;
      api.sound.match();
      api.ui.burstFromElement(canvasHost, { count: 10 });
      if (placedCount === total) {
        finished = true;
        const stars = starsForMisplacedTries(wrongDrops, total);
        life.later(() => api.win(stars, { wrongDrops }), 300);
      }
    });
  }

  function sendHome(p) {
    p.face.renderOrder = 10;
    tween(p.mesh.scale, { x: 1, y: 1, z: 1 }, 120, Easing.outCubic);
    tween(p.mesh.position, { x: p.home.x, y: p.home.y, z: 0.05 }, 220, Easing.outCubic);
  }

  const canvas = stage.renderer.domElement;
  let dragging = null;
  function onDown(e) {
    if (finished || dragging) return;
    const hit = stage.pick(e.clientX, e.clientY, meshList());
    const p = hit && hit.object.userData.piece;
    if (!p || p.placed) return;
    const pt = stage.pickPlane(e.clientX, e.clientY, 0.4);
    if (!pt) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    dragging = { p, id: e.pointerId, ox: p.mesh.position.x - pt.x, oy: p.mesh.position.y - pt.y };
    p.mesh.position.z = 0.4;
    p.mesh.scale.set(1.08, 1.08, 1.08);
    p.face.renderOrder = 20;
    api.sound.select();
  }
  function onMove(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const pt = stage.pickPlane(e.clientX, e.clientY, 0.4);
    if (!pt) return;
    dragging.p.mesh.position.x = pt.x + dragging.ox;
    dragging.p.mesh.position.y = pt.y + dragging.oy;
  }
  function onUp(e) {
    if (!dragging || e.pointerId !== dragging.id) return;
    const p = dragging.p;
    dragging = null;
    const { x, y } = p.mesh.position;
    if (Math.hypot(x - p.target.x, y - p.target.y) < SNAP_DIST) {
      placePiece(p, 160);
      return;
    }
    // Dropped over the board but in the wrong slot counts as a miss.
    const overBoard = Math.abs(x) < boardW / 2 && Math.abs(y - boardY) < boardH / 2;
    if (overBoard) {
      wrongDrops++;
      api.sound.error();
      api.ui.shake(canvasHost);
    }
    sendHome(p);
  }
  function onCancel() {
    if (!dragging) return;
    const p = dragging.p;
    dragging = null;
    sendHome(p);
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);

  function hint() {
    if (finished) { api.ui.toast(`${api.playerName}, the picture is complete!`); return; }
    const unplaced = pieces.filter((p) => !p.placed && (!dragging || p !== dragging.p));
    if (!unplaced.length) return;
    const p = unplaced[Math.floor(Math.random() * unplaced.length)];
    p.mesh.scale.set(1.15, 1.15, 1.15);
    placePiece(p, 280);
    api.ui.toast(`${api.playerName}, here's one piece placed for you!`);
  }

  const attached = wrap.isConnected;
  stage.onTick(() => { if (attached && !wrap.isConnected) queueMicrotask(unmount); });

  function unmount() {
    if (life.dead) return;
    life.kill();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onCancel);
    baseTexture.dispose();
    stage.dispose();
    wrap.remove();
  }

  return { unmount, hint };
}

PC.Games.register('jigsaw', { mount });
