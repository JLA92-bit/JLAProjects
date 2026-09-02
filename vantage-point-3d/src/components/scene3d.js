import * as THREE from 'three';

/**
 * Level 1 ("The Study") built from primitive Three.js geometry — no 3D
 * model generation tool is available, so the room is procedural boxes/
 * cylinders/planes rather than modeled furniture. Camera stands at a
 * fixed point and looks around (drag = look, pinch/wheel = zoom via FOV),
 * matching the "fixed-point orbit" control scheme rather than free walk.
 */

const PALETTE = {
  ink: 0x0f0d0b,
  panel: 0x171310,
  wallDark: 0x352a20,
  floor: 0x4a3624,
  wood: 0x3a2a1a,
  amber: 0xc9932f,
  amberBright: 0xe8a93a,
  paper: 0xe8dcc0,
  stone: 0x4a463f,
  ash: 0x6b665e,
  blood: 0x4a0f0f,
  brass: 0xb8860b,
  glass: 0xcfe8ea,
  windowLight: 0x8fa8bd,
};

const MIN_FOV = 32;
const MAX_FOV = 70;
const HIT_PADDING = 1.7; // generous invisible hit sphere, same spirit as the 2D game's 1.6x hit-radius

export function mountScene3D(canvas, level, clueData, opts) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.ink);
  scene.fog = new THREE.FogExp2(PALETTE.ink, 0.028);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  const cameraStand = new THREE.Vector3(0, 1.6, 2.6);
  camera.position.copy(cameraStand);

  let yaw = Math.PI; // facing -Z (into the room) by default
  let pitch = -0.05;

  function applyLook() {
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(cameraStand.clone().add(dir));
  }
  applyLook();

  buildRoom(scene);
  const clueMeshes = buildClues(scene, clueData, opts.foundClueIds);

  const ambient = new THREE.AmbientLight(0x3a4550, 1.4);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x445566, 0x1a1410, 0.9);
  scene.add(hemi);

  const windowLight = new THREE.DirectionalLight(PALETTE.windowLight, 0.9);
  windowLight.position.set(-6, 3, 1);
  scene.add(windowLight);

  const lampLight = new THREE.PointLight(PALETTE.amberBright, 6, 10, 1.6);
  lampLight.position.set(0.4, 1.7, -1.5);
  lampLight.castShadow = true;
  scene.add(lampLight);

  const fillLight = new THREE.PointLight(PALETTE.paper, 2.5, 12, 1.8);
  fillLight.position.set(0, 2.6, 1.5);
  scene.add(fillLight);

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth;
    const h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // ---------- input: drag-to-look, pinch/wheel-to-zoom, tap-to-select ----------

  const pointers = new Map();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let downInfo = null;
  let pinchStartDist = 0;
  let pinchStartFov = camera.fov;

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      downInfo = { x: e.clientX, y: e.clientY, t: Date.now() };
    } else if (pointers.size === 2) {
      dragging = false;
      const pts = [...pointers.values()];
      pinchStartDist = dist(pts[0], pts[1]);
      pinchStartFov = camera.fov;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yaw -= dx * 0.006;
      pitch = Math.max(-0.6, Math.min(0.6, pitch - dy * 0.006));
      applyLook();
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const d = dist(pts[0], pts[1]);
      const ratio = d / (pinchStartDist || d);
      camera.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, pinchStartFov / ratio));
      camera.updateProjectionMatrix();
    }
  });

  function onPointerEnd(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) dragging = false;
    if (downInfo) {
      const moved = Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y);
      const quick = Date.now() - downInfo.t < 400;
      if (moved < 8 && quick) handleTap(e.clientX, e.clientY);
      downInfo = null;
    }
  }
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      camera.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, camera.fov + (e.deltaY < 0 ? -3 : 3)));
      camera.updateProjectionMatrix();
    },
    { passive: false }
  );

  const raycaster = new THREE.Raycaster();
  function handleTap(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(clueMeshes.map((c) => c.hitMesh), false);
    if (hits.length === 0) return;
    const clueId = hits[0].object.userData.clueId;
    const entry = clueMeshes.find((c) => c.clueId === clueId);
    if (entry && !entry.found) {
      entry.found = true;
      [entry.visibleMesh, ...entry.extraMeshes].forEach((m) => {
        m.material.emissive = new THREE.Color(PALETTE.amberBright);
        m.material.emissiveIntensity = 0.6;
      });
      opts.onClueFound(entry.clue);
    }
  }

  // ---------- render loop ----------

  let raf = 0;
  function tick() {
    raf = requestAnimationFrame(tick);
    resize();
    renderer.render(scene, camera);
  }
  tick();

  function resetView() {
    yaw = Math.PI;
    pitch = -0.05;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    applyLook();
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    renderer.dispose();
  }

  return { destroy, resetView, getFoundCount: () => clueMeshes.filter((c) => c.found).length };
}

function buildRoom(scene) {
  const roomW = 9;
  const roomD = 7;
  const roomH = 3.2;

  const floorMat = new THREE.MeshStandardMaterial({ color: PALETTE.floor, roughness: 0.85 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -roomD / 2 + 2.6);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceilingMat = new THREE.MeshStandardMaterial({ color: PALETTE.panel, roughness: 1 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, roomH, -roomD / 2 + 2.6);
  scene.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallDark, roughness: 0.9 });

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat);
  backWall.position.set(0, roomH / 2, -roomD + 2.6);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), wallMat);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-roomW / 2, roomH / 2, 2.6 - roomD / 2);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(roomD, roomH), wallMat.clone());
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.set(roomW / 2, roomH / 2, 2.6 - roomD / 2);
  scene.add(rightWall);

  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomH), wallMat.clone());
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, roomH / 2, 4.5);
  scene.add(frontWall);

  // Window on the left wall — a cold pale-blue emissive plane standing in for rain-light outside.
  const windowMat = new THREE.MeshBasicMaterial({ color: PALETTE.windowLight, transparent: true, opacity: 0.75 });
  const window1 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.1), windowMat);
  window1.rotation.y = Math.PI / 2;
  window1.position.set(-roomW / 2 + 0.01, 1.9, -1.2);
  scene.add(window1);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x0c0a08 });
  const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 1.7), frameMat);
  windowFrame.position.set(-roomW / 2 + 0.03, 1.9, -1.2);
  scene.add(windowFrame);

  // Fireplace, built into the left wall near the floor.
  const fireplaceMat = new THREE.MeshStandardMaterial({ color: PALETTE.stone, roughness: 1 });
  const fireplace = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 0.5), fireplaceMat);
  fireplace.position.set(-3.4, 0.65, -1.9);
  scene.add(fireplace);
  const fireplaceOpening = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.3), new THREE.MeshStandardMaterial({ color: 0x090705 }));
  fireplaceOpening.position.set(-3.4, 0.55, -1.7);
  scene.add(fireplaceOpening);

  // Bookshelf backdrop on the back wall for a lived-in feel.
  const shelfMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 0.3), shelfMat);
  shelf.position.set(2.4, 1.3, -roomD + 2.9);
  scene.add(shelf);
  for (let i = 0; i < 14; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.55 + Math.random() * 0.2, 0.22),
      new THREE.MeshStandardMaterial({ color: [0x5a2a1e, 0x2e3a2a, 0x3a2a4a, 0x4a3a1a][i % 4] })
    );
    book.position.set(1.5 + i * 0.13, 0.75, -roomD + 2.85);
    scene.add(book);
  }

  // Desk.
  const deskMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.6 });
  const deskTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.5), deskMat);
  deskTop.position.set(-0.2, 0.94, -1.5);
  deskTop.castShadow = true;
  deskTop.receiveShadow = true;
  scene.add(deskTop);
  const legGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
  [
    [-1.6, -0.85],
    [1.2, -0.85],
    [-1.6, -2.15],
    [1.2, -2.15],
  ].forEach(([x, z]) => {
    const leg = new THREE.Mesh(legGeo, deskMat);
    leg.position.set(x, 0.45, z);
    scene.add(leg);
  });

  // Banker's lamp.
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 16), new THREE.MeshStandardMaterial({ color: PALETTE.brass, metalness: 0.6, roughness: 0.3 }));
  lampBase.position.set(0.4, 1.04, -1.5);
  scene.add(lampBase);
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), new THREE.MeshStandardMaterial({ color: PALETTE.brass, metalness: 0.6, roughness: 0.3 }));
  lampPole.position.set(0.4, 1.3, -1.5);
  scene.add(lampPole);
  const lampShade = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), new THREE.MeshStandardMaterial({ color: 0x4a6b3f, emissive: PALETTE.amberBright, emissiveIntensity: 0.4 }));
  lampShade.position.set(0.4, 1.62, -1.5);
  scene.add(lampShade);
}

function makeHitTarget(clueId, radius, position) {
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.copy(position);
  hitMesh.userData.clueId = clueId;
  return hitMesh;
}

function buildClues(scene, clueData, foundIds) {
  const found = new Set(foundIds);
  const entries = [];
  const byId = (id) => clueData.clues.find((c) => c.id === id);

  function register(clueId, visibleMesh, hitRadius, extraMeshes) {
    const clue = byId(clueId);
    if (!clue) return;
    const isFound = found.has(clueId);
    const allMeshes = [visibleMesh, ...(extraMeshes || [])];
    if (isFound) {
      allMeshes.forEach((m) => {
        m.material.emissive = new THREE.Color(PALETTE.amberBright);
        m.material.emissiveIntensity = 0.6;
      });
    }
    const hitMesh = makeHitTarget(clueId, hitRadius, visibleMesh.position);
    scene.add(hitMesh);
    entries.push({ clueId, clue, visibleMesh, hitMesh, extraMeshes: extraMeshes || [], found: isFound });
  }

  // Letter opener — thin gold blade on the desk, right of center.
  const opener = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.02, 0.05),
    new THREE.MeshStandardMaterial({ color: PALETTE.brass, metalness: 0.7, roughness: 0.25 })
  );
  opener.rotation.z = 0.4;
  opener.position.set(0.55, 1.01, -1.35);
  scene.add(opener);
  register('letter-opener', opener, 0.35 * HIT_PADDING);

  // Two wine glasses, left of the desk.
  const glassGroup = new THREE.Group();
  [-0.15, 0.15].forEach((dx) => {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 8), new THREE.MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.6 }));
    stem.position.set(dx, 0.05, 0);
    glassGroup.add(stem);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.5 }));
    bowl.position.set(dx, 0.11, 0);
    glassGroup.add(bowl);
  });
  glassGroup.position.set(-1.0, 1.0, -1.35);
  scene.add(glassGroup);
  const glassProxy = new THREE.Mesh(new THREE.SphereGeometry(0.001), new THREE.MeshStandardMaterial({ color: PALETTE.glass }));
  glassProxy.position.copy(glassGroup.position);
  register('wine-glass-1', glassProxy, 0.28 * HIT_PADDING, glassGroup.children);

  // Bloodstain — flat dark decal on the desk surface, center.
  const stain = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    new THREE.MeshStandardMaterial({ color: PALETTE.blood, roughness: 1 })
  );
  stain.rotation.x = -Math.PI / 2;
  stain.position.set(-0.1, 1.001, -1.6);
  scene.add(stain);
  register('desk-bloodstain', stain, 0.22 * HIT_PADDING);

  // Overturned photo frame, right side of the desk.
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.02, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.7 })
  );
  frame.position.set(1.15, 1.01, -1.65);
  frame.rotation.y = 0.3;
  scene.add(frame);
  register('photo-frame', frame, 0.24 * HIT_PADDING);

  // Cold fireplace grate — ash pile in the fireplace opening.
  const ash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.ash, roughness: 1 })
  );
  ash.scale.set(1.4, 0.35, 1);
  ash.position.set(-3.4, 0.15, -1.7);
  scene.add(ash);
  register('grate-ash', ash, 0.3 * HIT_PADDING);

  return entries;
}
