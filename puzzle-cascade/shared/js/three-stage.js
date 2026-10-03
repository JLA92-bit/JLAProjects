/**
 * three-stage.js - shared WebGL scaffolding for every Puzzle Cascade game.
 *
 * Every game gets a true bird's-eye scene: an orthographic camera looking
 * straight down at an XY board (Z is "up" off the table) - parallel
 * projection, so nothing off-center ever shows a tilted side face, unlike
 * a perspective camera. Soft shadows, candy-bright extruded rounded
 * tiles. Games build their own meshes with makeTile()/makeRoundedMesh()
 * and drive interaction with pick()/pickPlane() - the render loop and
 * resize handling are all here so each game file only deals with its own
 * logic.
 */
import * as THREE from 'three';
import { EffectComposer } from '../../vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three-addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from '../../vendor/three-addons/environments/RoomEnvironment.js';

const VIEW_SCALE = 0.42; // world half-height per unit of opts.distance - tight framing so the board fills the canvas edge to edge

// Image-based lighting: a PMREM environment map gives every
// MeshStandardMaterial real specular highlights and soft reflections
// instead of flat single-light shading. A PMREM result is a render-target
// texture that lives inside ONE WebGL context, and every stage owns its own
// renderer (own context), so it is generated per stage and disposed with
// the stage. (A single module-wide cache used to leave every game after the
// first with a black, unbound environment.) Generation is a handful of
// small draw calls at mount time.
const roomEnvScene = { scene: null };
function makeEnvTarget(renderer) {
  if (!roomEnvScene.scene) roomEnvScene.scene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(roomEnvScene.scene, 0.03);
  pmrem.dispose();
  return target;
}

// The gradient canvas is drawn once and shared; each stage wraps it in its
// own CanvasTexture so disposing one stage never touches another stage's
// renderer (texture dispose listeners are per renderer).
let cachedBgCanvas = null;
function backgroundTexture() {
  if (!cachedBgCanvas) {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.72);
    g.addColorStop(0, '#3a1a72');
    g.addColorStop(0.55, '#24103f');
    g.addColorStop(1, '#160a28');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    cachedBgCanvas = canvas;
  }
  const tex = new THREE.CanvasTexture(cachedBgCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -------------------- quality tiers -------------------- */
// high   - full look: DPR cap 2, 2048 soft shadows, full-res bloom.
// medium - weak/very dense devices: DPR cap 1.5, 1024 shadows, half-res bloom.
// low    - user "Low graphics" setting: DPR 1, no shadows, no bloom
//          composer (direct render, MSAA on instead).
const QUALITY = {
  high: { dprCap: 2, shadowSize: 2048, shadows: true, bloom: true, bloomScale: 1 },
  medium: { dprCap: 1.5, shadowSize: 1024, shadows: true, bloom: true, bloomScale: 0.5 },
  low: { dprCap: 1, shadowSize: 512, shadows: false, bloom: false, bloomScale: 1 },
};

function readLowGraphicsSetting() {
  try {
    const PC = window.PC;
    return !!(PC && PC.SaveManager && PC.SaveManager.getSetting && PC.SaveManager.getSetting('lowGraphics'));
  } catch (e) { return false; }
}

function isWeakDevice() {
  const nav = window.navigator || {};
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 4) return true;
  const dpr = window.devicePixelRatio || 1;
  const scr = window.screen || {};
  const shortSide = Math.min(scr.width || 9999, scr.height || 9999);
  return dpr >= 3 && shortSide <= 480;
}

export function detectQuality() {
  if (readLowGraphicsSetting()) return 'low';
  return isWeakDevice() ? 'medium' : 'high';
}

export function createStage(container, opts = {}) {
  const width = () => container.clientWidth || 320;
  const height = () => container.clientHeight || 320;

  const quality = QUALITY[opts.quality] ? opts.quality : detectQuality();
  const Q = QUALITY[quality];
  const basePixelRatio = Math.min(window.devicePixelRatio || 1, Q.dprCap);

  // With the bloom composer the scene is rendered into (non-MSAA) render
  // targets and only a fullscreen quad reaches the canvas, so canvas MSAA
  // would cost memory and resolve bandwidth for zero visual change. Only
  // the direct-render (low) tier benefits from it.
  const renderer = new THREE.WebGLRenderer({
    antialias: !Q.bloom,
    alpha: true,
    powerPreference: quality === 'low' ? 'default' : 'high-performance',
  });
  renderer.setPixelRatio(basePixelRatio);
  renderer.setSize(width(), height());
  renderer.shadowMap.enabled = Q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  // Bloom's composite pass writes opaque alpha across the whole frame, so a
  // transparent canvas would end up solid black - give the scene its own
  // background instead (also just looks more like a real tabletop).
  const bgTexture = opts.background === null ? null : backgroundTexture();
  scene.background = bgTexture;
  let envTarget = makeEnvTarget(renderer);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.6;
  const world = new THREE.Group();
  scene.add(world);

  const dist = opts.distance || 16;
  const lookAtY = opts.lookAtY || 0;
  const halfH = dist * VIEW_SCALE;
  const camera = new THREE.OrthographicCamera(-halfH, halfH, halfH, -halfH, 0.1, 400);
  camera.up.set(0, 1, 0);
  camera.position.set(0, lookAtY, 50);
  camera.lookAt(0, lookAtY, 0);
  scene.add(camera);

  function fitCamera() {
    const aspect = width() / height() || 1;
    camera.left = -halfH * aspect;
    camera.right = halfH * aspect;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  fitCamera();

  const hemi = new THREE.HemisphereLight(0xfff3e0, 0x2b0f5c, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(-4, 3, 10);
  key.castShadow = Q.shadows;
  key.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
  const shadowExtent = Math.max(halfH * 1.4, 10);
  key.shadow.camera.left = -shadowExtent; key.shadow.camera.right = shadowExtent;
  key.shadow.camera.top = shadowExtent; key.shadow.camera.bottom = -shadowExtent;
  key.shadow.camera.near = 1; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0015;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.35);
  fill.position.set(5, 4, 6);
  scene.add(fill);

  if (opts.floor !== false) {
    // Near-invisible full-screen shadow catcher (alpha 0.001 black, exactly
    // as before). ShadowMaterial produces the same black-at-0.001 pixels as
    // the old black MeshStandardMaterial but skips full PBR + env lighting
    // for every pixel of the screen, which was pure fill-rate waste.
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.001, transparent: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.z = (opts.floorZ !== undefined ? opts.floorZ : -0.3);
    floor.receiveShadow = true;
    scene.add(floor);
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function ndcFromEvent(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return pointerNdc;
  }

  function pick(clientX, clientY, objects, recursive = true) {
    ndcFromEvent(clientX, clientY);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(objects, recursive);
    return hits.length ? hits[0] : null;
  }

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  function pickPlane(clientX, clientY, z = 0) {
    ndcFromEvent(clientX, clientY);
    raycaster.setFromCamera(pointerNdc, camera);
    groundPlane.constant = -z;
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(groundPlane, out) ? out : null;
  }

  let composer = null;
  if (Q.bloom) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.55, 0.4, 0.86);
    if (Q.bloomScale !== 1) {
      const baseSetSize = bloomPass.setSize.bind(bloomPass);
      bloomPass.setSize = (w, h) => baseSetSize(Math.max(1, w * Q.bloomScale), Math.max(1, h * Q.bloomScale));
    }
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.setSize(width(), height());
  }

  function applySize() {
    const w = width(), h = height();
    fitCamera();
    renderer.setSize(w, h);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
  }

  /* ---- render loop: paused while hidden or while the context is lost ---- */
  let rafId = null;
  let disposed = false;
  let contextLost = false;
  const tickFns = new Set();
  const callTick = (fn) => fn();

  // Adaptive resolution: if, after a warm-up, frames stay slow (median
  // interval over ~45ms, i.e. under ~22fps) for a full sample window, step
  // the pixel ratio down once. Never goes below 1 and never steps twice.
  const SAMPLE_FRAMES = 90;
  const frameTimes = new Float32Array(SAMPLE_FRAMES);
  let sampleCount = 0;
  let lastFrameTs = 0;
  let warmupUntil = 0;
  let adaptiveDone = opts.adaptive === false || basePixelRatio <= 1;

  function resetFrameTiming() {
    lastFrameTs = 0;
    sampleCount = 0;
    warmupUntil = performance.now() + 2500;
  }

  function sampleFrame(ts) {
    if (lastFrameTs && ts > warmupUntil) {
      frameTimes[sampleCount++] = ts - lastFrameTs;
      if (sampleCount === SAMPLE_FRAMES) {
        sampleCount = 0;
        const sorted = Array.from(frameTimes).sort((a, b) => a - b);
        if (sorted[SAMPLE_FRAMES >> 1] > 45) {
          adaptiveDone = true;
          renderer.setPixelRatio(Math.max(1, basePixelRatio * 0.75));
          applySize();
        }
      }
    }
    lastFrameTs = ts;
  }

  function frame(ts) {
    rafId = null;
    if (disposed || contextLost || document.hidden) return;
    tickFns.forEach(callTick);
    if (composer) composer.render();
    else renderer.render(scene, camera);
    if (!adaptiveDone) sampleFrame(ts);
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (disposed || contextLost || document.hidden || rafId !== null) return;
    resetFrameTiming();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // Note on onTick timing across games: most ticks are frame-based (fixed
  // 1/60 steps or per-frame increments) and simply pause with the loop.
  // breakout/runner/towerdefense measure performance.now() deltas but clamp
  // them (<= 33-50ms), so a long pause cannot teleport anything. rhythmtap
  // uses an unclamped performance.now() delta, but browsers already stop
  // rAF in background tabs/WebViews, so that behaviour is unchanged here.
  function onVisibility() {
    if (document.hidden) stopLoop();
    else startLoop();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // Context loss (Android killing GPU memory when the APK is backgrounded,
  // or too many contexts). three's own handler preventDefaults and, on
  // restore, rebuilds its GL state lazily; render-target contents are gone,
  // so the PMREM environment is regenerated here.
  function onContextLost(e) {
    e.preventDefault();
    contextLost = true;
    stopLoop();
  }
  function onContextRestored() {
    contextLost = false;
    if (disposed) return;
    envTarget = makeEnvTarget(renderer); // old target belonged to the lost context
    scene.environment = envTarget.texture;
    applySize();
    startLoop();
  }
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  startLoop();

  function onTick(fn) { tickFns.add(fn); return () => tickFns.delete(fn); }

  const ro = new ResizeObserver(() => {
    if (disposed) return;
    const w = width(), h = height();
    if (w === 0 || h === 0) return;
    applySize();
  });
  ro.observe(container);

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopLoop();
    tickFns.clear();
    ro.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost, false);
    canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
    disposeObject(scene);
    if (bgTexture) bgTexture.dispose();
    scene.background = null;
    scene.environment = null;
    envTarget.dispose();
    if (composer) {
      // EffectComposer.dispose() (r160) only frees its own two targets and
      // copy pass - the bloom mip chain lives in the pass.
      composer.passes.forEach((p) => { if (p.dispose) p.dispose(); });
      composer.dispose();
    }
    renderer.dispose();
    // Release the GL context now instead of whenever GC gets to it - mobile
    // browsers cap live contexts (~16) and start killing the oldest ones.
    renderer.forceContextLoss();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return { renderer, scene, world, camera, pick, pickPlane, onTick, dispose, quality };
}

export function disposeObject(obj) {
  obj.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => {
        // Free every texture slot (map, emissiveMap, alphaMap, ...), not just
        // .map - label/sprite canvases and any game-made maps go with it.
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      });
    }
  });
}

export function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x, y + h, x + r, y + h);
  shape.lineTo(x + w - r, y + h);
  shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  shape.lineTo(x + w, y + r);
  shape.quadraticCurveTo(x + w, y, x + w - r, y);
  shape.lineTo(x + r, y);
  shape.quadraticCurveTo(x, y, x, y + r);
  return shape;
}

export function makeTile({ w = 1, h = 1, depth = 0.28, radius = 0.14, color = 0xff4d8d, emissive = 0x000000, emissiveIntensity = 0, roughness = 0.4, metalness = 0.08, opacity = 1 } = {}) {
  const shape = roundedRectShape(w, h, Math.min(radius, w / 2, h / 2));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: Math.min(0.035, depth * 0.3), bevelSize: Math.min(0.03, radius * 0.4), bevelSegments: 3, curveSegments: 10,
  });
  geo.translate(0, 0, -depth / 2);
  // Physical material (not just Standard) so tiles get a thin glossy
  // clearcoat on top of their base color - a candy-shell highlight that
  // picks up the PMREM environment map for a much richer "juicy" look
  // than flat MeshStandardMaterial shading.
  const mat = new THREE.MeshPhysicalMaterial({
    color, emissive, emissiveIntensity, roughness, metalness, transparent: opacity < 1, opacity,
    clearcoat: 0.65, clearcoatRoughness: 0.22,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeTextSprite(text, { size = 128, color = '#ffffff', bg = null, fontWeight = 800, fontFamily = "'Baloo 2', sans-serif" } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
  ctx.fillStyle = color;
  ctx.font = `${fontWeight} ${size * 0.6}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function applyLabel(mesh, text, opts) {
  const tex = makeTextSprite(text, opts);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
  const geo = new THREE.PlaneGeometry((opts && opts.w) || 0.8, (opts && opts.h) || 0.8);
  const plane = new THREE.Mesh(geo, mat);
  const depth = (mesh.geometry.parameters && mesh.geometry.parameters.options ? mesh.geometry.parameters.options.depth : 0.28);
  plane.position.z = depth / 2 + 0.02;
  plane.renderOrder = 10;
  mesh.add(plane);
  return plane;
}

/* -------------------- tiny tween helper -------------------- */
export const Easing = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outElastic: (t) => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
};

export function tween(target, to, duration = 300, easing = Easing.outCubic, onDone) {
  const from = {};
  Object.keys(to).forEach((k) => { from[k] = target[k]; });
  const start = performance.now();
  let raf;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const e = easing(t);
    Object.keys(to).forEach((k) => { target[k] = from[k] + (to[k] - from[k]) * e; });
    if (t < 1) raf = requestAnimationFrame(step);
    else if (onDone) onDone();
  }
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export function popIn(mesh, { delay = 0, duration = 320, scale = 1 } = {}) {
  mesh.scale.set(0.001, 0.001, 0.001);
  setTimeout(() => tween(mesh.scale, { x: scale, y: scale, z: scale }, duration, Easing.outBack), delay);
}

export const PALETTE = [0xff4d8d, 0xff9f43, 0xffd93d, 0x23d18b, 0x17c3b2, 0x3f8efc, 0xa259ff, 0xff5c5c];
