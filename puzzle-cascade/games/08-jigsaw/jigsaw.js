/**
 * Game 8 - Jigsaw Puzzle (3D). A procedurally-painted "photo" (no
 * scraped art - generated on a canvas) is diced into a grid of beveled
 * 3D pieces, scattered in a tray, and dragged back into their slots.
 */
import * as THREE from 'three';
import { createStage, roundedRectShape, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { cols: 3, rows: 3, moveStars: [3, 3] },
  medium: { cols: 4, rows: 4, moveStars: [4, 4] },
  hard: { cols: 5, rows: 5, moveStars: [5, 5] },
};
const PIECE = 0.9;
const GAP = 0.06;
const SNAP_DIST = 0.32;

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
  const cfg = CONFIG[difficulty];
  const { cols, rows } = cfg;
  const total = cols * rows;
  let placedCount = 0, wrongDrops = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="jg-meta"><span>Placed: <span id="jg-placed">0</span>/${total}</span></div>
    <div class="pc-canvas3d" id="jg-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Drag each piece into its outlined slot</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#jg-canvas');
  const placedEl = wrap.querySelector('#jg-placed');

  const boardSpan = Math.max(cols, rows) * (PIECE + GAP);
  const stage = createStage(canvasHost, { distance: boardSpan * 1.55 });
  const halfC = (cols - 1) / 2, halfR = (rows - 1) / 2;
  function slotXY(r, c) { return { x: (c - halfC) * (PIECE + GAP), y: (halfR - r) * (PIECE + GAP) }; }

  // slot outlines
  const slotMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const { x, y } = slotXY(r, c);
    const shape = roundedRectShape(PIECE, PIECE, 0.08);
    const points = shape.getPoints(20).map((p) => new THREE.Vector3(p.x, p.y, 0.005));
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.LineLoop(geo, slotMat);
    line.position.set(x, y, 0);
    stage.world.add(line);
  }

  const image = paintScene(512);
  const baseTexture = new THREE.CanvasTexture(image);
  baseTexture.colorSpace = THREE.SRGBColorSpace;

  const pieces = [];
  const order = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push({ r, c });
  // scatter positions in a ring around the board
  const scattered = order.slice().sort(() => Math.random() - 0.5);

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

    const scatterIdx = scattered.indexOf(order[i]);
    const angle = (scatterIdx / total) * Math.PI * 2;
    const radius = boardSpan * 0.58 + (scatterIdx % 3) * 0.16;
    mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55 - boardSpan * 0.1, 0.05);
    mesh.rotation.z = (Math.random() - 0.5) * 0.5;
    stage.world.add(mesh);
    popIn(mesh, { delay: i * 25, duration: 260 });

    pieces.push({ r, c, mesh, placed: false, target: slotXY(r, c) });
  });

  function meshList() { return pieces.filter((p) => !p.placed).map((p) => p.mesh); }

  let dragging = null;
  function onDown(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, meshList());
    if (!hit) return;
    dragging = pieces.find((p) => p.mesh === hit.object);
    dragging.mesh.position.z = 0.4;
    dragging.mesh.scale.set(1.08, 1.08, 1.08);
    api.sound.select();
  }
  function onMove(e) {
    if (!dragging) return;
    const pt = stage.pickPlane(e.clientX, e.clientY, 0.4);
    if (!pt) return;
    dragging.mesh.position.x = pt.x;
    dragging.mesh.position.y = pt.y;
  }
  function onUp() {
    if (!dragging) return;
    const p = dragging;
    dragging = null;
    const dx = p.mesh.position.x - p.target.x, dy = p.mesh.position.y - p.target.y;
    const dist = Math.hypot(dx, dy);
    tween(p.mesh.scale, { x: 1, y: 1, z: 1 }, 120, Easing.outCubic);
    if (dist < SNAP_DIST) {
      p.placed = true;
      p.mesh.rotation.z = 0;
      tween(p.mesh.position, { x: p.target.x, y: p.target.y, z: 0 }, 160, Easing.outBack, () => {
        placedCount++;
        placedEl.textContent = placedCount;
        api.sound.match();
        api.ui.burstFromElement(canvasHost, { count: 10 });
        if (placedCount === total) {
          finished = true;
          const stars = starsForMisplacedTries(wrongDrops, total);
          setTimeout(() => api.win(stars, { wrongDrops }), 300);
        }
      });
    } else {
      wrongDrops++;
      tween(p.mesh.position, { z: 0.05 }, 160, Easing.outCubic);
    }
  }

  stage.renderer.domElement.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  function hint() {
    if (finished) return;
    const unplaced = pieces.filter((p) => !p.placed && p !== dragging);
    if (!unplaced.length) return;
    const p = unplaced[Math.floor(Math.random() * unplaced.length)];
    p.placed = true;
    p.mesh.rotation.z = 0;
    tween(p.mesh.scale, { x: 1.15, y: 1.15, z: 1.15 }, 120, Easing.outCubic);
    tween(p.mesh.position, { x: p.target.x, y: p.target.y, z: 0 }, 280, Easing.outBack, () => {
      tween(p.mesh.scale, { x: 1, y: 1, z: 1 }, 140, Easing.outCubic);
      placedCount++;
      placedEl.textContent = placedCount;
      api.sound.match();
      api.ui.burstFromElement(canvasHost, { count: 10 });
      if (placedCount === total) {
        finished = true;
        const stars = starsForMisplacedTries(wrongDrops, total);
        setTimeout(() => api.win(stars, { wrongDrops }), 300);
      }
    });
    api.ui.toast(`${api.playerName}, here's one piece placed for you!`);
  }

  return {
    unmount: () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('jigsaw', { mount });
