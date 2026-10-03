/**
 * Game 44 - Tower Stack (3D, side view). A block slides back and forth
 * above the tower. Tap to drop it: whatever hangs over the edge of the
 * block below is sliced off and falls away, so the tower gets narrower
 * with every sloppy drop. Stack up to the goal line to win.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { goal: 10, width: 2.6, speed: 2.2, perfect: 0.14, regrow: true },
  medium: { goal: 15, width: 2.4, speed: 2.9, perfect: 0.1, regrow: true },
  hard: { goal: 20, width: 2.1, speed: 3.6, perfect: 0.07, regrow: false },
};
const BH = 0.55;      // block height
const RANGE = 1.9;    // how far the block center swings from the middle
const DEPTH = 0.5;

function fitView(host, w) {
  const cw = host.clientWidth || 360, ch = host.clientHeight || 640;
  const aspect = cw / ch || 0.5;
  return Math.max((w * 1.08) / (2 * aspect), 5);
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const timeouts = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };
  const cancels = new Set();
  const tw = (target, to, ms, ease, done) => {
    let c = null;
    c = tween(target, to, ms, ease, () => { cancels.delete(c); if (done) done(); });
    cancels.add(c);
    return c;
  };

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="st-meta"><span>Height: <span class="st-height">0</span> / ${cfg.goal}</span><span>Perfect: <span class="st-perfect">0</span></span></div>
    <div class="pc-canvas3d st-canvas">
      <div class="pc-overlay-bottom">
        <button type="button" class="st-btn st-drop">Drop!</button>
        <button type="button" class="st-btn st-again" hidden>Try again</button>
      </div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.st-canvas');
  const heightEl = wrap.querySelector('.st-height');
  const perfectEl = wrap.querySelector('.st-perfect');
  const dropBtn = wrap.querySelector('.st-drop');
  const againBtn = wrap.querySelector('.st-again');

  const VIEW_W = 2 * RANGE + cfg.width + 0.8;
  const baseHalfH = fitView(canvasHost, VIEW_W);
  const stage = createStage(canvasHost, { distance: baseHalfH / 0.42 });
  let visHalf = baseHalfH;
  function refit() {
    const h = fitView(canvasHost, VIEW_W);
    stage.camera.zoom = baseHalfH / h;
    stage.camera.updateProjectionMatrix();
    visHalf = h;
  }
  refit();
  const ro = new ResizeObserver(refit);
  ro.observe(canvasHost);

  // Everything that scrolls lives in `tower`; we slide it down as the
  // stack grows so the camera never has to move.
  const tower = new THREE.Group();
  stage.world.add(tower);

  const pedestal = makeTile({ w: VIEW_W - 0.6, h: 0.5, depth: 0.6, radius: 0.18, color: 0x5b3aa8 });
  pedestal.position.set(0, -0.25, 0);
  tower.add(pedestal);
  const goalY = cfg.goal * BH;
  const goalBar = makeTile({ w: VIEW_W - 0.3, h: 0.07, depth: 0.05, radius: 0.03, color: 0x23d18b, emissive: 0x23d18b, emissiveIntensity: 1.2 });
  goalBar.position.set(0, goalY, -0.4);
  goalBar.castShadow = false;
  tower.add(goalBar);
  const goalTag = makeTile({ w: 1.5, h: 0.62, depth: 0.08, radius: 0.24, color: 0x14855a, emissive: 0x14855a, emissiveIntensity: 0.1 });
  goalTag.position.set(-(VIEW_W / 2) + 1.05, goalY + 0.4, -0.3);
  {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 104;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = "800 72px 'Baloo 2', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GOAL', 128, 56);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.53), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    label.position.z = 0.12;
    label.renderOrder = 10;
    goalTag.add(label);
  }
  tower.add(goalTag);

  let layers, mover, moverX, dir, finished, perfects, streak, hintUntil, playing;
  const colorFor = (i) => PALETTE[i % PALETTE.length];
  function blockMesh(w, i) {
    return makeTile({ w, h: BH - 0.05, depth: DEPTH, radius: 0.1, color: colorFor(i), emissive: colorFor(i), emissiveIntensity: 0.12 });
  }
  const layerY = (i) => BH * (i + 0.5);

  function removeObj(o) {
    if (o.parent) o.parent.remove(o);
    o.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
  }

  function towerTargetY() {
    // keep the moving block about a third of the way down from the top
    const n = layers.length;
    const bottomY = -visHalf * 0.6;
    const want = visHalf * 0.4 - layerY(n);
    return Math.min(bottomY, want);
  }

  function spawnMover() {
    const top = layers[layers.length - 1];
    const i = layers.length;
    mover = blockMesh(top.w, i);
    dir = Math.random() < 0.5 ? 1 : -1;
    moverX = -dir * RANGE;
    mover.position.set(moverX, layerY(i), 0);
    tower.add(mover);
    popIn(mover, { duration: 160 });
  }

  function reset() {
    if (layers) layers.forEach((l) => removeObj(l.mesh));
    if (mover) removeObj(mover);
    layers = [];
    finished = false; perfects = 0; streak = 0; hintUntil = 0; playing = true;
    heightEl.textContent = '0'; perfectEl.textContent = '0';
    againBtn.hidden = true; dropBtn.hidden = false;
    const base = blockMesh(cfg.width, 0);
    base.position.set(0, layerY(0), 0);
    tower.add(base);
    popIn(base);
    layers.push({ x: 0, w: cfg.width, mesh: base });
    tower.position.y = towerTargetY();
    spawnMover();
  }
  reset();

  function sliceOff(x, w, y, i) {
    const piece = blockMesh(w, i);
    piece.position.set(x, y, 0);
    tower.add(piece);
    const side = Math.sign(x - layers[layers.length - 1].x) || 1;
    tw(piece.position, { y: y - 7, x: x + side * 1.2 }, 900, (t) => t * t);
    tw(piece.rotation, { z: -side * 1.4 }, 900, Easing.linear);
    tw(piece.material, { opacity: 0 }, 900, Easing.linear, () => removeObj(piece));
    piece.material.transparent = true;
  }

  function drop() {
    if (finished || !playing || !mover) return;
    const top = layers[layers.length - 1];
    const i = layers.length;
    const y = layerY(i);
    let x = moverX;
    const w = top.w;
    const off = x - top.x;
    let newW, newX, grew = false;
    if (Math.abs(off) <= cfg.perfect) {
      newX = top.x; newW = w;
      perfects++; streak++;
      perfectEl.textContent = perfects;
      if (cfg.regrow && streak >= 3 && newW < cfg.width) { newW = Math.min(cfg.width, newW + 0.2); grew = true; }
    } else {
      streak = 0;
      const left = Math.max(x - w / 2, top.x - top.w / 2);
      const right = Math.min(x + w / 2, top.x + top.w / 2);
      newW = right - left;
      if (newW <= 0.02) {
        // missed the tower completely
        playing = false;
        const m = mover; mover = null;
        tw(m.position, { y: m.position.y - 8 }, 800, (t) => t * t);
        tw(m.rotation, { z: off > 0 ? -1.6 : 1.6 }, 800, Easing.linear, () => removeObj(m));
        api.sound.error();
        api.ui.shake(canvasHost);
        finished = true;
        later(() => {
          api.lose(`the block missed! You stacked ${layers.length - 1} of ${cfg.goal}. Try again.`);
          dropBtn.hidden = true;
          againBtn.hidden = false;
        }, 500);
        return;
      }
      newX = (left + right) / 2;
      const cutW = w - newW;
      const cutX = off > 0 ? right + cutW / 2 : left - cutW / 2;
      sliceOff(cutX, cutW, y, i);
    }
    removeObj(mover);
    mover = null;
    const placed = blockMesh(newW, i);
    placed.position.set(newX, y, 0);
    tower.add(placed);
    layers.push({ x: newX, w: newW, mesh: placed });
    const perfect = newX === top.x && Math.abs(off) <= cfg.perfect;
    if (perfect) {
      placed.material.emissiveIntensity = 1;
      tw(placed.material, { emissiveIntensity: 0.12 }, 500, Easing.outCubic);
      api.sound.match ? api.sound.match() : api.sound.click();
      if (grew) api.ui.toast('Perfect streak - the block grows back!');
    } else {
      api.sound.move();
    }
    placed.scale.set(1.06, 0.8, 1);
    tw(placed.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outBack);
    const height = layers.length - 1;
    heightEl.textContent = height;
    tw(tower.position, { y: towerTargetY() }, 380, Easing.outCubic);
    if (height >= cfg.goal) {
      finished = true;
      tw(goalBar.material, { emissiveIntensity: 3 }, 300, Easing.outCubic);
      later(() => {
        api.ui.burstFromElement(canvasHost);
        const ratio = newW / cfg.width;
        api.win(ratio >= 0.6 ? 3 : ratio >= 0.3 ? 2 : 1, { height, perfects });
      }, 450);
      return;
    }
    spawnMover();
  }

  // real-time swing, with a clamped delta so a backgrounded tab cannot jump
  let last = performance.now();
  let glow = 0;
  const unsubTick = stage.onTick(() => {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!mover || finished) return;
    const top = layers[layers.length - 1];
    const hinting = now < hintUntil;
    const aligned = Math.abs(moverX - top.x) <= Math.max(cfg.perfect, 0.12);
    const speed = cfg.speed * (1 + layers.length * 0.02) * (hinting ? 0.55 : 1);
    moverX += dir * speed * dt;
    if (moverX > RANGE) { moverX = RANGE; dir = -1; }
    if (moverX < -RANGE) { moverX = -RANGE; dir = 1; }
    mover.position.x = moverX;
    const want = hinting && aligned ? 1.4 : 0.12;
    glow += (want - glow) * Math.min(1, dt * 18);
    mover.material.emissiveIntensity = glow;
  });

  const canvas = stage.renderer.domElement;
  function onCanvasDown(e) { e.preventDefault(); drop(); }
  function onDropBtn(e) { e.preventDefault(); drop(); }
  function onKey(e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); drop(); }
  }
  function onAgain() { api.sound.click(); reset(); }
  canvas.addEventListener('pointerdown', onCanvasDown);
  dropBtn.addEventListener('pointerdown', onDropBtn);
  againBtn.addEventListener('click', onAgain);
  window.addEventListener('keydown', onKey);

  function hint() {
    if (finished || !mover) return;
    hintUntil = performance.now() + 6000;
    api.ui.toast(`${api.playerName}, the block slows down and glows when it lines up - tap right then!`);
  }

  return {
    unmount: () => {
      finished = true;
      unsubTick();
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      cancels.forEach((c) => c());
      cancels.clear();
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onCanvasDown);
      dropBtn.removeEventListener('pointerdown', onDropBtn);
      againBtn.removeEventListener('click', onAgain);
      window.removeEventListener('keydown', onKey);
      stage.dispose();
      wrap.remove();
    },
    hint,
    debug: () => ({ finished, height: layers.length - 1, aligned: mover ? Math.abs(moverX - layers[layers.length - 1].x) : null, width: layers[layers.length - 1].w }),
  };
}

PC.Games.register('stacker', { mount });
