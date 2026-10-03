/**
 * Game 42 - Pipe Rotate (3D). Tap pipe tiles to turn them a quarter turn
 * clockwise. Connect every tile to the water pump so the water reaches
 * every pipe and lights up every outlet bulb. Boards are built from a
 * random spanning tree (always solvable) and then scrambled.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { cols: 4, rows: 5 },
  medium: { cols: 5, rows: 7 },
  hard: { cols: 6, rows: 8 },
};
const N = 1, E = 2, S = 4, W = 8;
const DIRS = [
  { bit: N, dr: -1, dc: 0, opp: S },
  { bit: E, dr: 0, dc: 1, opp: W },
  { bit: S, dr: 1, dc: 0, opp: N },
  { bit: W, dr: 0, dc: -1, opp: E },
];
const CELL = 1;
const DRY = 0x8f84b8;
const WET = 0x17c3b2;
const BULB_OFF = 0x5a4f7a;
const BULB_ON = 0xffd93d;

const rotCW = (m) => ((m << 1) | (m >> 3)) & 15;
function rotateTimes(m, k) { for (let i = 0; i < ((k % 4) + 4) % 4; i++) m = rotCW(m); return m; }
function bitCount(m) { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; }

function buildTree(rows, cols, sr, sc) {
  const mask = Array.from({ length: rows }, () => Array(cols).fill(0));
  const inTree = Array.from({ length: rows }, () => Array(cols).fill(false));
  inTree[sr][sc] = true;
  const frontier = [];
  const addEdges = (r, c) => DIRS.forEach((d) => {
    const nr = r + d.dr, nc = c + d.dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !inTree[nr][nc]) frontier.push({ r, c, d });
  });
  addEdges(sr, sc);
  while (frontier.length) {
    const idx = Math.floor(Math.random() * frontier.length);
    const { r, c, d } = frontier[idx];
    frontier[idx] = frontier[frontier.length - 1];
    frontier.pop();
    const nr = r + d.dr, nc = c + d.dc;
    if (inTree[nr][nc]) continue;
    // avoid 4-way crosses (they never need turning, so they are dull)
    if (bitCount(mask[r][c]) >= 3 && frontier.length > 2 && Math.random() < 0.85) { frontier.push({ r, c, d }); continue; }
    inTree[nr][nc] = true;
    mask[r][c] |= d.bit;
    mask[nr][nc] |= d.opp;
    addEdges(nr, nc);
  }
  return mask;
}

function fitView(host, w, h, bottomPx) {
  const cw = host.clientWidth || 360, ch = host.clientHeight || 640;
  const aspect = cw / ch || 0.5;
  const usable = Math.max(0.6, (ch - bottomPx) / ch);
  const halfH = Math.max((h * 1.08) / (2 * usable), (w * 1.08) / (2 * aspect));
  return { halfH, shiftY: halfH * (1 - usable) };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty] || CONFIG.easy;
  const { rows, cols } = cfg;
  const sr = Math.floor((rows - 1) / 2), sc = Math.floor((cols - 1) / 2);
  const sol = buildTree(rows, cols, sr, sc);
  const off = Array.from({ length: rows }, () => Array(cols).fill(0));
  const cur = (r, c) => rotateTimes(sol[r][c], off[r][c]);
  const isRight = (r, c) => cur(r, c) === sol[r][c];
  function tapsToFix(r, c) { for (let t = 0; t < 4; t++) if (rotateTimes(sol[r][c], off[r][c] + t) === sol[r][c]) return t; return 0; }

  // scramble until plenty of tiles are wrong
  let wrong = 0;
  for (let guard = 0; guard < 50; guard++) {
    wrong = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      off[r][c] = Math.floor(Math.random() * 4);
      if (!isRight(r, c)) wrong++;
    }
    if (wrong >= rows * cols * 0.6) break;
  }
  let minTaps = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) minTaps += tapsToFix(r, c);

  let taps = 0, finished = false;
  const timeouts = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="pp-meta"><span>Taps: <span class="pp-taps">0</span></span><span>Watered: <span class="pp-wet">0</span>/${rows * cols}</span></div>
    <div class="pc-canvas3d pp-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a pipe to turn it</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('.pp-canvas');
  const tapsEl = wrap.querySelector('.pp-taps');
  const wetEl = wrap.querySelector('.pp-wet');

  const VIEW_W = cols * CELL + 0.5, VIEW_H = rows * CELL + 0.5;
  const fit0 = fitView(canvasHost, VIEW_W, VIEW_H, 44);
  const stage = createStage(canvasHost, { distance: fit0.halfH / 0.42 });
  const baseHalfH = fit0.halfH;
  function refit() {
    const f = fitView(canvasHost, VIEW_W, VIEW_H, 44);
    stage.camera.zoom = baseHalfH / f.halfH;
    stage.camera.updateProjectionMatrix();
    stage.world.position.y = f.shiftY;
  }
  refit();
  const ro = new ResizeObserver(refit);
  ro.observe(canvasHost);

  const board = makeTile({ w: cols * CELL + 0.35, h: rows * CELL + 0.35, depth: 0.2, radius: 0.3, color: 0x24123f, roughness: 0.7 });
  board.position.set(0, 0, -0.32);
  stage.world.add(board);

  const cx = (c) => (c - (cols - 1) / 2) * CELL;
  const cy = (r) => ((rows - 1) / 2 - r) * CELL;

  const armGeo = new THREE.BoxGeometry(0.24, 0.56, 0.16);
  armGeo.translate(0, 0.28, 0);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.18, 20);
  hubGeo.rotateX(Math.PI / 2);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const isSource = r === sr && c === sc;
      const isOutlet = !isSource && bitCount(sol[r][c]) === 1;
      const holder = new THREE.Group();
      holder.position.set(cx(c), cy(r), 0);
      holder.userData.cell = { r, c };
      const baseColor = isSource ? 0x3f8efc : 0x3a2266;
      const base = makeTile({ w: 0.94, h: 0.94, depth: 0.14, radius: 0.14, color: baseColor, emissive: baseColor, emissiveIntensity: isSource ? 0.35 : 0, roughness: 0.6 });
      base.position.z = -0.12;
      holder.add(base);
      const pipeMat = new THREE.MeshStandardMaterial({ color: DRY, emissive: WET, emissiveIntensity: 0, roughness: 0.3, metalness: 0.35 });
      const spin = new THREE.Group();
      spin.position.z = 0.05;
      DIRS.forEach((d, k) => {
        if (!(sol[r][c] & d.bit)) return;
        const arm = new THREE.Mesh(armGeo, pipeMat);
        arm.rotation.z = -k * Math.PI / 2;
        arm.castShadow = true;
        spin.add(arm);
      });
      const hub = new THREE.Mesh(hubGeo, pipeMat);
      hub.castShadow = true;
      spin.add(hub);
      let bulb = null;
      if (isSource || isOutlet) {
        const bulbColor = isSource ? 0x9fd8ff : BULB_OFF;
        bulb = new THREE.Mesh(new THREE.SphereGeometry(isSource ? 0.24 : 0.2, 20, 14), new THREE.MeshStandardMaterial({ color: bulbColor, emissive: isSource ? 0x3f8efc : BULB_ON, emissiveIntensity: isSource ? 1 : 0, roughness: 0.25 }));
        bulb.position.z = 0.2;
        bulb.castShadow = true;
        holder.add(bulb);
      }
      holder.add(spin);
      spin.rotation.z = -off[r][c] * Math.PI / 2;
      stage.world.add(holder);
      popIn(holder, { delay: 40 + (r * cols + c) * 18 });
      row.push({ holder, base, spin, pipeMat, bulb, isSource, isOutlet, wet: false, angle: spin.rotation.z, spinCancel: null });
    }
    cells.push(row);
  }

  function computeWet() {
    const wet = Array.from({ length: rows }, () => Array(cols).fill(-1));
    wet[sr][sc] = 0;
    const q = [[sr, sc]];
    while (q.length) {
      const [r, c] = q.shift();
      const m = cur(r, c);
      DIRS.forEach((d) => {
        if (!(m & d.bit)) return;
        const nr = r + d.dr, nc = c + d.dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || wet[nr][nc] >= 0) return;
        if (!(cur(nr, nc) & d.opp)) return;
        wet[nr][nc] = wet[r][c] + 1;
        q.push([nr, nc]);
      });
    }
    return wet;
  }

  function refreshWater(animate) {
    const wet = computeWet();
    let count = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      const isWet = wet[r][c] >= 0;
      if (isWet) count++;
      if (isWet === cell.wet) continue;
      cell.wet = isWet;
      const apply = () => {
        if (finished && !isWet) return;
        cell.pipeMat.color.set(isWet ? WET : DRY);
        if (animate) tween(cell.pipeMat, { emissiveIntensity: isWet ? 0.75 : 0 }, 220, Easing.outCubic);
        else cell.pipeMat.emissiveIntensity = isWet ? 0.75 : 0;
        if (cell.isOutlet && cell.bulb) {
          cell.bulb.material.color.set(isWet ? BULB_ON : BULB_OFF);
          if (animate) {
            tween(cell.bulb.material, { emissiveIntensity: isWet ? 1.2 : 0 }, 260, Easing.outCubic);
            if (isWet) tween(cell.bulb.scale, { x: 1.35, y: 1.35, z: 1.35 }, 160, Easing.outBack, () => tween(cell.bulb.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
          } else cell.bulb.material.emissiveIntensity = isWet ? 1.2 : 0;
        }
      };
      if (animate && isWet) later(apply, wet[r][c] * 35); else apply();
    }
    wetEl.textContent = count;
    return count;
  }
  refreshWater(false);

  function turn(r, c, times, animateMs) {
    const cell = cells[r][c];
    off[r][c] = (off[r][c] + times) % 4;
    cell.angle -= times * Math.PI / 2;
    if (cell.spinCancel) cell.spinCancel();
    cell.spinCancel = tween(cell.spin.rotation, { z: cell.angle }, animateMs, Easing.outBack);
  }

  function checkWin(count) {
    if (finished || count < rows * cols) return;
    finished = true;
    api.sound.match ? api.sound.match() : api.sound.click();
    // celebratory ripple out from the pump
    const wet = computeWet();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const h = cells[r][c].holder;
      later(() => tween(h.scale, { x: 1.12, y: 1.12, z: 1.12 }, 140, Easing.outBack, () => tween(h.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic)), 250 + wet[r][c] * 45);
    }
    later(() => {
      api.ui.burstFromElement(canvasHost);
      const stars = taps <= Math.ceil(minTaps * 1.25) + 2 ? 3 : taps <= minTaps * 2 + 4 ? 2 : 1;
      api.win(stars, { taps, best: minTaps });
    }, 650);
  }

  const canvas = stage.renderer.domElement;
  const holders = () => cells.flat().map((c) => c.holder);
  function cellFromHit(hit) {
    let o = hit && hit.object;
    while (o && !o.userData.cell) o = o.parent;
    return o ? o.userData.cell : null;
  }
  function onPointerDown(e) {
    if (finished) return;
    const hit = stage.pick(e.clientX, e.clientY, holders());
    const at = cellFromHit(hit);
    if (!at) return;
    const { r, c } = at;
    if (sol[r][c] === 15) {
      // a 4-way cross looks the same every way round
      api.sound.error();
      api.ui.shake(canvasHost);
      api.ui.toast('That cross pipe already points every way.');
      return;
    }
    turn(r, c, 1, 200);
    taps++;
    tapsEl.textContent = taps;
    api.sound.move();
    checkWin(refreshWater(true));
  }
  canvas.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished) return;
    const wet = computeWet();
    const wrongs = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!isRight(r, c)) wrongs.push({ r, c });
    if (!wrongs.length) return;
    // prefer a wrong tile right at the edge of the water so the flow grows
    const nearWater = wrongs.filter(({ r, c }) => wet[r][c] >= 0 || DIRS.some((d) => {
      const nr = r + d.dr, nc = c + d.dc;
      return nr >= 0 && nr < rows && nc >= 0 && nc < cols && wet[nr][nc] >= 0;
    }));
    const pool = nearWater.length ? nearWater : wrongs;
    const { r, c } = pool[Math.floor(Math.random() * pool.length)];
    const fix = tapsToFix(r, c);
    turn(r, c, fix, 320);
    taps += fix; // a hint still costs the turns it made
    tapsEl.textContent = taps;
    const h = cells[r][c].holder;
    tween(h.scale, { x: 1.25, y: 1.25, z: 1.25 }, 180, Easing.outBack, () => tween(h.scale, { x: 1, y: 1, z: 1 }, 240, Easing.outCubic));
    const base = cells[r][c].base;
    tween(base.material, { emissiveIntensity: 0.8 }, 160, Easing.outCubic, () => tween(base.material, { emissiveIntensity: cells[r][c].isSource ? 0.35 : 0 }, 700, Easing.inOutQuad));
    base.material.emissive.set(cells[r][c].isSource ? 0x3f8efc : 0xffd93d);
    api.ui.toast(`${api.playerName}, I turned one pipe the right way for you!`);
    checkWin(refreshWater(true));
  }

  return {
    unmount: () => {
      finished = true;
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
      cells.flat().forEach((cell) => { if (cell.spinCancel) cell.spinCancel(); });
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      armGeo.dispose(); hubGeo.dispose();
      stage.dispose();
      wrap.remove();
    },
    hint,
    debug: () => ({ finished, taps, minTaps }),
  };
}

PC.Games.register('pipes', { mount });
