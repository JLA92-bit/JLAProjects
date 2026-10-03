/**
 * Game 50 - Spot the Difference. Two little pictures sit one above the
 * other. The bottom one has a few changes: a different color, something
 * missing, something moved or something turned. Tap a change on either
 * picture to circle it on both. Wrong taps are limited.
 */
import * as THREE from 'three';
import { createStage, makeTile, applyLabel, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { objects: 10, diffs: 3, misses: 6, sMin: 0.3, sMax: 0.48 },
  medium: { objects: 13, diffs: 5, misses: 5, sMin: 0.27, sMax: 0.42 },
  hard: { objects: 16, diffs: 7, misses: 4, sMin: 0.24, sMax: 0.36 },
};
const SW = 5.4, SH = 4.5, GAP = 0.45;
const SCENE_Y = SH / 2 + GAP / 2;
const TYPES = ['rect', 'circle', 'tri', 'star', 'emoji'];
const EMOJI = ['🐱', '🌻', '🚗', '🏠', '🐟', '🍦', '🎈', '🐢'];
const EMOJI_FONT = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";

function fitDistance(host, halfW, halfH, margin = 1.05) {
  const w = host.clientWidth, h = host.clientHeight;
  let aspect = w && h ? w / h : 0.5;
  aspect = Math.max(0.4, Math.min(1.6, aspect));
  return Math.max((halfH * margin) / 0.42, (halfW * margin) / (0.42 * aspect));
}

function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function colorDist(a, b) {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = (a & 255) - (b & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function extruded(shape, color) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 18 });
  geo.translate(0, 0, -0.1);
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0.06, clearcoat: 0.65, clearcoatRoughness: 0.22 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function makeObjectMesh(src) {
  const o = { ...src, color: new THREE.Color(src.color).multiplyScalar(0.82) };
  const s = o.s;
  let m;
  if (o.type === 'rect') m = makeTile({ w: s * 2, h: s * 0.9, depth: 0.2, radius: 0.1, color: o.color });
  else if (o.type === 'circle') { const sh = new THREE.Shape(); sh.absarc(0, 0, s, 0, Math.PI * 2, false); m = extruded(sh, o.color); }
  else if (o.type === 'tri') m = extruded(new THREE.Shape([new THREE.Vector2(0, s * 1.1), new THREE.Vector2(-s * 0.95, -s * 0.55), new THREE.Vector2(s * 0.95, -s * 0.55)]), o.color);
  else if (o.type === 'star') {
    const pts = [];
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s * 1.05; const a = Math.PI / 2 + (i * Math.PI) / 5; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    m = extruded(new THREE.Shape(pts), o.color);
  } else {
    m = makeTile({ w: s * 1.8, h: s * 1.8, depth: 0.2, radius: 0.14, color: o.color });
    const lab = applyLabel(m, o.emoji, { size: 128, w: s * 1.6, h: s * 1.6, fontFamily: EMOJI_FONT });
    lab.material.depthTest = true;
    lab.position.z = 0.17;
  }
  m.position.set(o.x, o.y, 0.14);
  m.rotation.z = o.rot;
  return m;
}

function overlaps(o, list, skip) {
  return list.some((p) => p !== skip && Math.hypot(p.x - o.x, p.y - o.y) < p.s + o.s + 0.14);
}
function inBounds(o) {
  const m = o.s * 1.1 + 0.18;
  return Math.abs(o.x) <= SW / 2 - m && Math.abs(o.y) <= SH / 2 - m;
}

function generate(cfg) {
  const objs = [];
  let guard = 0;
  while (objs.length < cfg.objects && guard++ < 6000) {
    const type = TYPES[objs.length % TYPES.length];
    const o = {
      type, s: cfg.sMin + Math.random() * (cfg.sMax - cfg.sMin),
      x: (Math.random() - 0.5) * SW, y: (Math.random() - 0.5) * SH,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      rot: type === 'circle' ? 0 : type === 'emoji' ? (Math.random() - 0.5) * 0.5 : Math.random() * Math.PI * 2,
      emoji: EMOJI[Math.floor(Math.random() * EMOJI.length)],
    };
    if (inBounds(o) && !overlaps(o, objs)) objs.push(o);
  }
  // pick differences, rotating through the kinds so every puzzle mixes them
  const bottom = objs.map((o) => ({ ...o }));
  const diffs = [];
  const kinds = shuffleArr(['color', 'missing', 'moved', 'rotate']);
  let k = 0;
  for (const i of shuffleArr(objs.map((_, j) => j))) {
    if (diffs.length >= cfg.diffs) break;
    const o = objs[i], b = bottom[i];
    let done = false;
    for (let tries = 0; tries < 4 && !done; tries++) {
      const kind = kinds[(k + tries) % kinds.length];
      if (kind === 'color') {
        const opts = PALETTE.filter((c) => colorDist(c, o.color) > 190);
        b.color = opts[Math.floor(Math.random() * opts.length)];
        done = true;
      } else if (kind === 'missing') { b.gone = true; done = true; }
      else if (kind === 'rotate') {
        if (o.type === 'circle') continue;
        b.rot = o.rot + (o.type === 'tri' ? Math.PI / 3 : o.type === 'star' ? Math.PI / 5 : Math.PI / 2);
        done = true;
      } else if (kind === 'moved') {
        for (let t = 0; t < 30 && !done; t++) {
          const a = Math.random() * Math.PI * 2, d = o.s * 2 + 0.35 + Math.random() * 0.4;
          const cand = { ...b, x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d };
          if (inBounds(cand) && !overlaps(cand, bottom, b)) { b.x = cand.x; b.y = cand.y; done = true; }
        }
      }
      if (done) diffs.push({ i, kind, found: false });
    }
    k++;
  }
  return { objs, bottom, diffs };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  let puzzle = null, mistakes = 0, hintsUsed = 0, finished = false, locked = false;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="sd-meta"><span>Found <b class="sd-found">0</b>/${cfg.diffs}</span><span>Wrong taps left <b class="sd-left">${cfg.misses}</b></span></div>
    <div class="sd-tip">Tap what changed in the bottom picture</div>
    <div class="pc-canvas3d sd-canvas"></div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.sd-canvas');
  const foundEl = wrap.querySelector('.sd-found');
  const leftEl = wrap.querySelector('.sd-left');

  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, SW / 2 + 0.12, SCENE_Y + SH / 2 + 0.12) });
  const scenes = [new THREE.Group(), new THREE.Group()];
  scenes[0].position.y = SCENE_Y;
  scenes[1].position.y = -SCENE_Y;
  scenes.forEach((g) => stage.world.add(g));

  function clearScenes() {
    scenes.forEach((g) => {
      while (g.children.length) {
        const c = g.children[0];
        g.remove(c);
        c.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) { if (n.material.map) n.material.map.dispose(); n.material.dispose(); } });
      }
    });
  }

  function buildBackdrop(g, delay) {
    const panel = makeTile({ w: SW, h: SH, depth: 0.12, radius: 0.28, color: 0x2e1a5e, roughness: 0.6 });
    panel.position.z = -0.08;
    g.add(panel);
    const ground = makeTile({ w: SW - 0.24, h: 1.25, depth: 0.04, radius: 0.2, color: 0x1d6b4a, roughness: 0.8 });
    ground.position.set(0, -SH / 2 + 0.74, 0.0);
    ground.material.clearcoat = 0;
    g.add(ground);
    const sky = makeTile({ w: SW - 0.24, h: SH - 1.5, depth: 0.04, radius: 0.2, color: 0x3a2c86, roughness: 0.8 });
    sky.position.set(0, 0.62, 0.0);
    sky.material.clearcoat = 0;
    g.add(sky);
    popIn(panel, { delay });
  }

  function ringMesh(r, color, thick = 0.07) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - thick, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false, depthTest: false }));
    m.renderOrder = 20;
    return m;
  }
  const radiusFor = (o) => Math.max(o.s * 1.25 + 0.15, 0.5);

  function newPuzzle() {
    clearScenes();
    puzzle = generate(cfg);
    mistakes = 0; locked = false;
    foundEl.textContent = 0;
    leftEl.textContent = cfg.misses;
    buildBackdrop(scenes[0], 0);
    buildBackdrop(scenes[1], 80);
    puzzle.objs.forEach((o, i) => { const m = makeObjectMesh(o); scenes[0].add(m); popIn(m, { delay: 150 + i * 25 }); });
    puzzle.bottom.forEach((o, i) => { if (o.gone) return; const m = makeObjectMesh(o); scenes[1].add(m); popIn(m, { delay: 230 + i * 25 }); });
  }

  function markFound(d) {
    d.found = true;
    const a = puzzle.objs[d.i], b = puzzle.bottom[d.i];
    [[scenes[0], a], [scenes[1], b]].forEach(([g, o]) => {
      const r = ringMesh(radiusFor(a), 0xffd93d);
      r.position.set(o.x, o.y, 0.4);
      g.add(r);
      popIn(r, { duration: 360 });
    });
    const n = puzzle.diffs.filter((x) => x.found).length;
    foundEl.textContent = n;
    api.sound.click();
    if (n === puzzle.diffs.length) {
      finished = true;
      api.sound.win();
      api.ui.burstFromElement(canvasHost);
      const penalty = mistakes + hintsUsed;
      const stars = penalty <= 1 ? 3 : penalty <= 3 ? 2 : 1;
      later(() => api.win(stars, { mistakes, hints: hintsUsed }), 600);
    }
  }

  function missMark(g, x, y) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, toneMapped: false, depthTest: false });
    const grp = new THREE.Group();
    [Math.PI / 4, -Math.PI / 4].forEach((a) => { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), mat); bar.rotation.z = a; bar.renderOrder = 21; grp.add(bar); });
    grp.position.set(x, y, 0.45);
    g.add(grp);
    popIn(grp, { duration: 200 });
    tween(mat, { opacity: 0 }, 700, Easing.linear, () => {
      g.remove(grp);
      grp.children.forEach((c) => c.geometry.dispose());
      mat.dispose();
    });
  }

  function onPointerDown(e) {
    if (finished || locked || !puzzle) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0.14);
    if (!p) return;
    const which = p.y > 0 ? 0 : 1;
    const lx = p.x, ly = p.y - scenes[which].position.y;
    if (Math.abs(lx) > SW / 2 || Math.abs(ly) > SH / 2) return;
    const hitDiff = (onlyUnfound) => puzzle.diffs.find((d) => {
      if (onlyUnfound && d.found) return false;
      const a = puzzle.objs[d.i], b = puzzle.bottom[d.i];
      const r = radiusFor(a);
      return Math.hypot(a.x - lx, a.y - ly) < r || Math.hypot(b.x - lx, b.y - ly) < r;
    });
    const d = hitDiff(true);
    if (d) { markFound(d); return; }
    if (hitDiff(false)) { api.sound.click(); return; } // already circled
    mistakes++;
    const left = cfg.misses - mistakes;
    leftEl.textContent = Math.max(0, left);
    api.sound.error();
    api.ui.shake(canvasHost);
    missMark(scenes[which], lx, ly);
    if (left <= 0) {
      locked = true;
      api.lose('out of wrong taps! Here comes a fresh picture.');
      later(() => { if (!finished) newPuzzle(); }, 1800);
    }
  }
  const el = stage.renderer.domElement;
  el.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished || locked || !puzzle) return;
    const open = puzzle.diffs.filter((d) => !d.found);
    if (!open.length) return;
    const d = open[Math.floor(Math.random() * open.length)];
    hintsUsed++;
    const a = puzzle.objs[d.i], b = puzzle.bottom[d.i];
    [[scenes[0], a], [scenes[1], b]].forEach(([g, o]) => {
      const r = ringMesh(radiusFor(a) + 0.25, 0x7fe7ff, 0.11);
      r.position.set(o.x, o.y, 0.42);
      g.add(r);
      r.scale.set(1.6, 1.6, 1);
      tween(r.scale, { x: 1, y: 1 }, 500, Easing.outCubic);
      later(() => tween(r.material, { opacity: 0 }, 900, Easing.inOutQuad, () => { g.remove(r); r.geometry.dispose(); r.material.dispose(); }), 1400);
    });
    api.ui.toast(`${api.playerName}, look inside the glowing circle!`);
  }

  newPuzzle();

  return {
    unmount: () => {
      finished = true;
      timers.forEach(clearTimeout); timers.clear();
      el.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('spotdiff', { mount });
