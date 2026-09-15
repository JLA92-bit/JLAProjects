/**
 * Game 34 - Air Hockey vs AI. Drag your paddle (bottom half of the
 * table) to strike the puck past the AI at the top. First to the
 * target number of goals wins.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { aiSpeed: 2.6, aiReaction: 0.055, puckSpeed: 3.1, target: 5 },
  medium: { aiSpeed: 3.6, aiReaction: 0.09, puckSpeed: 4.0, target: 5 },
  hard: { aiSpeed: 4.8, aiReaction: 0.14, puckSpeed: 5.1, target: 7 },
};

const FIELD_W = 5, FIELD_H = 8.4;
const HALF_W = FIELD_W / 2, HALF_H = FIELD_H / 2;
const GOAL_HALF = 1.05;
const PUCK_R = 0.24;
const PADDLE_R = 0.5;

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  let scorePlayer = 0, scoreAI = 0, finished = false;

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ah-meta"><span>You: <span id="ah-you">0</span></span><span>Target: ${cfg.target}</span><span>AI: <span id="ah-ai">0</span></span></div>
    <div class="pc-canvas3d" id="ah-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Drag your paddle (bottom half) to hit the puck</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ah-canvas');
  const youEl = wrap.querySelector('#ah-you');
  const aiEl = wrap.querySelector('#ah-ai');

  const halfWNeed = HALF_W + 0.5, halfHNeed = HALF_H + 0.5;
  const distance = Math.max(halfHNeed / 0.42, halfWNeed / (0.42 * 0.5));
  const stage = createStage(canvasHost, { distance });

  // table
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x1c1044, roughness: 0.5 });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_H), tableMat);
  table.position.z = -0.15;
  table.receiveShadow = true;
  stage.world.add(table);
  const midLine = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 }));
  midLine.position.z = -0.13;
  stage.world.add(midLine);

  // side walls + goal posts (visual)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3f2a7c, roughness: 0.6 });
  [-HALF_W - 0.12, HALF_W + 0.12].forEach((x) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.24, FIELD_H, 0.4), wallMat);
    wall.position.set(x, 0, 0);
    stage.world.add(wall);
  });
  [-1, 1].forEach((sign) => {
    [HALF_H, -HALF_H].forEach((y) => {
      const postW = HALF_W - GOAL_HALF;
      const post = new THREE.Mesh(new THREE.BoxGeometry(postW, 0.24, 0.4), wallMat);
      post.position.set(sign * (GOAL_HALF + postW / 2), y, 0);
      stage.world.add(post);
    });
  });

  function makePaddle(color) {
    const geo = new THREE.CylinderGeometry(PADDLE_R, PADDLE_R, 0.3, 24);
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.7, emissive: color, emissiveIntensity: 0.15 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    return mesh;
  }
  const playerPaddle = makePaddle(0x3f8efc);
  const aiPaddle = makePaddle(0xff4d8d);
  let px = 0, py = -HALF_H + 1.1;
  let ax = 0, ay = HALF_H - 1.1;
  playerPaddle.position.set(px, py, 0.1);
  aiPaddle.position.set(ax, ay, 0.1);
  stage.world.add(playerPaddle, aiPaddle);
  popIn(playerPaddle, { duration: 220 });
  popIn(aiPaddle, { duration: 220 });

  const puckMesh = new THREE.Mesh(new THREE.CylinderGeometry(PUCK_R, PUCK_R, 0.2, 20), new THREE.MeshPhysicalMaterial({ color: 0xffd93d, roughness: 0.25, clearcoat: 0.8 }));
  puckMesh.rotation.x = Math.PI / 2;
  puckMesh.castShadow = true;
  stage.world.add(puckMesh);
  let puck = { x: 0, y: 0, vx: 0, vy: 0, serving: true };

  function serve(towardPlayer) {
    puck.x = 0; puck.y = 0;
    const angle = (Math.random() * 0.6 - 0.3) + (towardPlayer ? -Math.PI / 2 : Math.PI / 2);
    puck.vx = Math.cos(angle) * cfg.puckSpeed * 0.5;
    puck.vy = Math.sin(angle) * cfg.puckSpeed;
    puck.serving = false;
    puckMesh.position.set(0, 0, 0.05);
  }
  setTimeout(() => serve(Math.random() < 0.5), 500);

  function movePlayerTo(x, y) {
    px = Math.max(-HALF_W + PADDLE_R, Math.min(HALF_W - PADDLE_R, x));
    py = Math.max(-HALF_H + PADDLE_R, Math.min(-0.15, y));
    playerPaddle.position.set(px, py, 0.1);
  }
  function onMove(e) {
    const world = stage.pickPlane(e.clientX, e.clientY, 0);
    if (world) movePlayerTo(world.x, world.y);
  }
  let dragging = false;
  const el = stage.renderer.domElement;
  el.addEventListener('pointerdown', (e) => { dragging = true; onMove(e); });
  el.addEventListener('pointermove', (e) => { if (dragging) onMove(e); });
  window.addEventListener('pointerup', () => { dragging = false; });

  function resetPositions() {
    px = 0; py = -HALF_H + 1.1; ax = 0; ay = HALF_H - 1.1;
    playerPaddle.position.set(px, py, 0.1);
    aiPaddle.position.set(ax, ay, 0.1);
  }

  function goalScored(byPlayer) {
    if (byPlayer) { scorePlayer++; api.sound.win(); } else { scoreAI++; api.sound.error(); }
    youEl.textContent = scorePlayer; aiEl.textContent = scoreAI;
    api.ui.burstFromElement(canvasHost);
    puck.serving = true;
    resetPositions();
    if (scorePlayer >= cfg.target) { winGame(); return; }
    if (scoreAI >= cfg.target) { loseGame(); return; }
    setTimeout(() => serve(!byPlayer), 700);
  }

  function winGame() {
    finished = true;
    const margin = scorePlayer - scoreAI;
    const stars = margin >= 3 ? 3 : margin >= 1 ? 2 : 1;
    setTimeout(() => api.win(stars, { scorePlayer, scoreAI }), 300);
  }
  function loseGame() {
    finished = true;
    setTimeout(() => api.lose('the AI won this match! Try again.'), 300);
  }

  let hintUntil = 0;
  const unsubTick = stage.onTick(() => {
    if (finished) return;
    const dt = 1 / 60;

    // AI moves toward the puck's predicted x, with a reaction lag
    const targetX = Math.max(-HALF_W + PADDLE_R, Math.min(HALF_W - PADDLE_R, puck.x));
    ax += (targetX - ax) * Math.min(1, cfg.aiReaction * 2);
    ax = Math.max(-HALF_W + PADDLE_R, Math.min(HALF_W - PADDLE_R, ax));
    const targetY = puck.vy > 0 ? Math.max(0.5, Math.min(HALF_H - PADDLE_R, puck.y)) : HALF_H - 1.1;
    ay += (targetY - ay) * cfg.aiReaction;
    ay = Math.max(0.15, Math.min(HALF_H - PADDLE_R, ay));
    aiPaddle.position.set(ax, ay, 0.1);

    if (puck.serving) return;

    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    if (puck.x - PUCK_R < -HALF_W) { puck.x = -HALF_W + PUCK_R; puck.vx *= -1; }
    if (puck.x + PUCK_R > HALF_W) { puck.x = HALF_W - PUCK_R; puck.vx *= -1; }

    // goal or wall bounce at top/bottom
    if (puck.y + PUCK_R > HALF_H) {
      if (Math.abs(puck.x) < GOAL_HALF - PUCK_R) { goalScored(true); return; }
      puck.y = HALF_H - PUCK_R; puck.vy *= -1;
    }
    if (puck.y - PUCK_R < -HALF_H) {
      if (Math.abs(puck.x) < GOAL_HALF - PUCK_R) { goalScored(false); return; }
      puck.y = -HALF_H + PUCK_R; puck.vy *= -1;
    }

    // paddle collisions (circle-circle)
    [{ x: px, y: py, isPlayer: true }, { x: ax, y: ay, isPlayer: false }].forEach((p) => {
      const dx = puck.x - p.x, dy = puck.y - p.y;
      const dist = Math.hypot(dx, dy);
      const minDist = PUCK_R + PADDLE_R;
      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist, ny = dy / dist;
        puck.x = p.x + nx * minDist; puck.y = p.y + ny * minDist;
        const speed = Math.max(Math.hypot(puck.vx, puck.vy), cfg.puckSpeed * 0.7) * 1.05;
        puck.vx = nx * speed; puck.vy = ny * speed;
        api.sound.click();
      }
    });

    puckMesh.position.set(puck.x, puck.y, 0.05);
  });

  function hint() {
    if (finished) return;
    tween(playerPaddle.material, { emissiveIntensity: 0.8 }, 150, Easing.outCubic, () => tween(playerPaddle.material, { emissiveIntensity: 0.15 }, 400));
    const dir = puck.vy < 0 ? 'move under the puck to block/hit it' : 'get ready to intercept the rebound';
    api.ui.toast(`${api.playerName}, ${dir}!`);
  }

  return {
    unmount: () => {
      finished = true;
      unsubTick();
      window.removeEventListener('pointerup', () => { });
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('airhockey', { mount });
