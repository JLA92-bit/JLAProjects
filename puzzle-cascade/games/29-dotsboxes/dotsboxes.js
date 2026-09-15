/**
 * Game 29 - Dots and Boxes vs AI (3D). Tap a line between two dots to
 * claim it. Complete a box's fourth side to claim the box and go
 * again. Most boxes when every line is drawn wins.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { size: 4, level: 'random' },
  medium: { size: 5, level: 'greedy' },
  hard: { size: 6, level: 'smart' },
};
const CELL = 1.0;
const HUMAN = 1, AI = 2;
const HUMAN_COLOR = 0xff4d8d, AI_COLOR = 0x3f8efc;

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const size = cfg.size;
  // H[r][c]: horizontal edge above box (r,c), r in 0..size, c in 0..size-1
  // V[r][c]: vertical edge left of box (r,c), r in 0..size-1, c in 0..size
  const H = Array.from({ length: size + 1 }, () => Array(size).fill(0));
  const V = Array.from({ length: size }, () => Array(size + 1).fill(0));
  const boxOwner = Array.from({ length: size }, () => Array(size).fill(0));
  let turn = HUMAN, finished = false, aiThinking = false;
  let scoreHuman = 0, scoreAI = 0;

  function boxEdges(r, c) { return [['H', r, c], ['H', r + 1, c], ['V', r, c], ['V', r, c + 1]]; }
  function edgeVal(type, r, c) { return type === 'H' ? H[r][c] : V[r][c]; }
  function setEdge(type, r, c, val) { if (type === 'H') H[r][c] = val; else V[r][c] = val; }
  function boxSideCount(r, c) { return boxEdges(r, c).filter(([t, rr, cc]) => edgeVal(t, rr, cc)).length; }

  function allEdges() {
    const out = [];
    for (let r = 0; r <= size; r++) for (let c = 0; c < size; c++) if (!H[r][c]) out.push(['H', r, c]);
    for (let r = 0; r < size; r++) for (let c = 0; c <= size; c++) if (!V[r][c]) out.push(['V', r, c]);
    return out;
  }

  function boxesTouchingEdge(type, r, c) {
    const boxes = [];
    if (type === 'H') { if (r > 0) boxes.push([r - 1, c]); if (r < size) boxes.push([r, c]); }
    else { if (c > 0) boxes.push([r, c - 1]); if (c < size) boxes.push([r, c]); }
    return boxes;
  }

  function wouldCompleteBox(type, r, c) {
    return boxesTouchingEdge(type, r, c).some(([br, bc]) => boxSideCount(br, bc) === 3);
  }
  function dangerScore(type, r, c) {
    // after placing, how many boxes reach 3 sides (become takeable by opponent)?
    setEdge(type, r, c, 1);
    let danger = 0;
    boxesTouchingEdge(type, r, c).forEach(([br, bc]) => { if (boxSideCount(br, bc) === 3) danger++; });
    setEdge(type, r, c, 0);
    return danger;
  }

  function chooseAIEdge(level) {
    const edges = allEdges();
    if (!edges.length) return null;
    const completing = edges.filter(([t, r, c]) => wouldCompleteBox(t, r, c));
    if (completing.length) return completing[Math.floor(Math.random() * completing.length)];
    if (level === 'random') return edges[Math.floor(Math.random() * edges.length)];
    const safe = edges.filter(([t, r, c]) => dangerScore(t, r, c) === 0);
    if (safe.length) return safe[Math.floor(Math.random() * safe.length)];
    if (level === 'greedy') return edges[Math.floor(Math.random() * edges.length)];
    // smart: forced to concede - minimize boxes given away
    let best = edges[0], bestDanger = Infinity;
    edges.forEach((e) => { const d = dangerScore(...e); if (d < bestDanger) { bestDanger = d; best = e; } });
    return best;
  }

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="db-meta">
      <span class="db-score"><span class="db-dot db-dot--you"></span> You: <span id="db-you">0</span></span>
      <span id="db-status">Your turn</span>
      <span class="db-score"><span class="db-dot db-dot--ai"></span> AI: <span id="db-ai">0</span></span>
    </div>
    <div class="pc-canvas3d" id="db-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a line to claim it</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#db-canvas');
  const statusEl = wrap.querySelector('#db-status');
  const youEl = wrap.querySelector('#db-you');
  const aiEl = wrap.querySelector('#db-ai');

  const halfExt = size * CELL / 2 + 0.6;
  const aspectMin = 0.46;
  const distance = Math.max(halfExt / (0.42 * aspectMin), halfExt / 0.42) * 1.05;
  const stage = createStage(canvasHost, { distance });

  const half = size / 2;
  function dotXY(r, c) { return { x: (c - half) * CELL, y: (half - r) * CELL }; }

  // dots
  for (let r = 0; r <= size; r++) for (let c = 0; c <= size; c++) {
    const { x, y } = dotXY(r, c);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.4 }));
    dot.position.set(x, y, 0.05);
    stage.world.add(dot);
  }

  const edgeMeshes = {};
  function edgeMeshKey(type, r, c) { return type + ',' + r + ',' + c; }
  function addEdgeMesh(type, r, c) {
    let x, y, w, h;
    if (type === 'H') {
      const a = dotXY(r, c), b = dotXY(r, c + 1);
      x = (a.x + b.x) / 2; y = a.y; w = CELL * 0.78; h = 0.15;
    } else {
      const a = dotXY(r, c), b = dotXY(r + 1, c);
      x = a.x; y = (a.y + b.y) / 2; w = 0.15; h = CELL * 0.78;
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), new THREE.MeshStandardMaterial({ color: 0x3d2e63, roughness: 0.6 }));
    mesh.position.set(x, y, 0);
    mesh.userData = { type, r, c };
    stage.world.add(mesh);
    edgeMeshes[edgeMeshKey(type, r, c)] = mesh;
  }
  for (let r = 0; r <= size; r++) for (let c = 0; c < size; c++) addEdgeMesh('H', r, c);
  for (let r = 0; r < size; r++) for (let c = 0; c <= size; c++) addEdgeMesh('V', r, c);

  const boxMeshes = Array.from({ length: size }, () => Array(size).fill(null));
  function addBoxFill(r, c, owner) {
    const topLeft = dotXY(r, c);
    const x = topLeft.x + CELL / 2, y = topLeft.y - CELL / 2;
    const mesh = makeTile({ w: CELL * 0.82, h: CELL * 0.82, depth: 0.06, radius: 0.1, color: owner === HUMAN ? HUMAN_COLOR : AI_COLOR, opacity: 0.55, roughness: 0.5 });
    mesh.position.set(x, y, -0.05);
    stage.world.add(mesh);
    boxMeshes[r][c] = mesh;
    popIn(mesh, { duration: 200 });
  }

  function claimEdge(type, r, c, owner) {
    setEdge(type, r, c, owner);
    const mesh = edgeMeshes[edgeMeshKey(type, r, c)];
    mesh.material.color.set(owner === HUMAN ? HUMAN_COLOR : AI_COLOR);
    tween(mesh.scale, { x: 1.15, y: 1.15, z: 1.15 }, 120, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 160, Easing.outCubic));
    let claimedAny = 0;
    boxesTouchingEdge(type, r, c).forEach(([br, bc]) => {
      if (boxOwner[br][bc] === 0 && boxSideCount(br, bc) === 4) {
        boxOwner[br][bc] = owner;
        addBoxFill(br, bc, owner);
        claimedAny++;
        if (owner === HUMAN) scoreHuman++; else scoreAI++;
      }
    });
    youEl.textContent = scoreHuman; aiEl.textContent = scoreAI;
    return claimedAny;
  }

  function checkEnd() {
    if (scoreHuman + scoreAI === size * size) {
      finished = true;
      if (scoreHuman === scoreAI) { statusEl.textContent = "It's a tie!"; setTimeout(() => api.win(2, { scoreHuman, scoreAI }), 300); return true; }
      if (scoreHuman > scoreAI) {
        statusEl.textContent = 'You win!';
        api.ui.burstFromElement(canvasHost);
        const margin = scoreHuman - scoreAI;
        const stars = margin >= size ? 3 : margin >= Math.ceil(size / 2) ? 2 : 1;
        setTimeout(() => api.win(stars, { scoreHuman, scoreAI }), 300);
      } else {
        statusEl.textContent = 'The AI wins.';
        setTimeout(() => api.lose(`the AI finished with ${scoreAI} boxes to your ${scoreHuman}.`), 300);
      }
      return true;
    }
    return false;
  }

  function aiTurn() {
    if (finished) return;
    aiThinking = true;
    statusEl.textContent = "AI's turn...";
    setTimeout(() => {
      const edge = chooseAIEdge(cfg.level);
      if (!edge) { aiThinking = false; checkEnd(); return; }
      const claimed = claimEdge(...edge, AI);
      api.sound[claimed ? 'match' : 'move']();
      if (checkEnd()) { aiThinking = false; return; }
      if (claimed > 0) { aiTurn(); return; }
      aiThinking = false;
      turn = HUMAN;
      statusEl.textContent = 'Your turn';
    }, 480);
  }

  function onPointerDown(e) {
    if (finished || aiThinking || turn !== HUMAN) return;
    const hit = stage.pick(e.clientX, e.clientY, Object.values(edgeMeshes));
    if (!hit) return;
    const { type, r, c } = hit.object.userData;
    if (edgeVal(type, r, c)) { api.sound.error(); return; }
    const claimed = claimEdge(type, r, c, HUMAN);
    api.sound[claimed ? 'match' : 'click']();
    if (checkEnd()) return;
    if (claimed > 0) { statusEl.textContent = 'You claimed a box - go again!'; return; }
    turn = AI;
    aiTurn();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function hint() {
    if (finished || aiThinking || turn !== HUMAN) return;
    const edge = chooseAIEdge('smart');
    if (!edge) return;
    const mesh = edgeMeshes[edgeMeshKey(...edge)];
    tween(mesh.scale, { x: 1.4, y: 1.4, z: 1.4 }, 180, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 220, Easing.outCubic));
    api.ui.toast(`${api.playerName}, try the glowing line!`);
  }

  return {
    unmount: () => {
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('dotsboxes', { mount });
