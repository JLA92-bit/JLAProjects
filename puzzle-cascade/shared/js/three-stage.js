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

// One shared PMREM environment map (image-based lighting) reused by every
// stage - gives every MeshStandardMaterial real specular highlights and
// soft reflections instead of flat single-light shading, for a big visual
// upgrade at effectively zero extra cost since it's generated once and
// referenced by every game's scene.environment.
let sharedEnvMap = null;
function getEnvMap(renderer) {
  if (sharedEnvMap) return sharedEnvMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  sharedEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  pmrem.dispose();
  return sharedEnvMap;
}

let cachedBgTexture = null;
function backgroundTexture() {
  if (cachedBgTexture) return cachedBgTexture;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, '#3a1a72');
  g.addColorStop(0.55, '#24103f' );
  g.addColorStop(1, '#160a28');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedBgTexture = tex;
  return tex;
}

export function createStage(container, opts = {}) {
  const width = () => container.clientWidth || 320;
  const height = () => container.clientHeight || 320;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Bloom's composite pass writes opaque alpha across the whole frame, so a
  // transparent canvas would end up solid black - give the scene its own
  // background instead (also just looks more like a real tabletop).
  scene.background = opts.background === null ? null : backgroundTexture();
  scene.environment = getEnvMap(renderer);
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
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
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
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x000000, opacity: 0, transparent: true });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.z = (opts.floorZ !== undefined ? opts.floorZ : -0.3);
    floor.receiveShadow = true;
    floor.material.opacity = 0.001; // invisible but still receives shadow
    scene.add(floor);
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function ndcFromEvent(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
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

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width(), height()), 0.55, 0.4, 0.86);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  composer.setSize(width(), height());

  let rafId = null;
  let running = true;
  const tickFns = new Set();
  function frame() {
    if (!running) return;
    tickFns.forEach((fn) => fn());
    composer.render();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  function onTick(fn) { tickFns.add(fn); return () => tickFns.delete(fn); }

  const ro = new ResizeObserver(() => {
    const w = width(), h = height();
    if (w === 0 || h === 0) return;
    fitCamera();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });
  ro.observe(container);

  function dispose() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    ro.disconnect();
    disposeObject(scene);
    composer.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { renderer, scene, world, camera, pick, pickPlane, onTick, dispose };
}

export function disposeObject(obj) {
  obj.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
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
