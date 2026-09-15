/**
 * Game 22 - Checkers vs AI (3D). Standard 8x8 board, mandatory captures,
 * kinging on the back row. Tap your piece, then tap a highlighted
 * destination. If a capture is available anywhere on the board you must
 * take it; landing with another jump available forces you to continue
 * with the same piece.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing } from '../../shared/js/three-stage.js';

const SIZE = 8;
const CELL = 1.0;
const HUMAN = 1, AI = 2;
const MAN_H = 1, KING_H = 2, MAN_AI = 3, KING_AI = 4;
const DARK = 0x3a2a1e, LIGHT = 0xd8b98a;
const HUMAN_COLOR = 0xff4d8d, AI_COLOR = 0x241436;

const CONFIG = {
  easy: { level: 'random' },
  medium: { level: 'greedy' },
  hard: { level: 'minimax', depth: 4 },
};

function inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
function pieceOwner(v) { if (!v) return 0; return (v === MAN_H || v === KING_H) ? HUMAN : AI; }
function isKing(v) { return v === KING_H || v === KING_AI; }
function manDir(owner) { return owner === HUMAN ? -1 : 1; }
function promoRow(owner) { return owner === HUMAN ? 0 : SIZE - 1; }
function cloneBoard(b) { return b.map((row) => row.slice()); }

function initialBoard() {
  const b = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  for (let r = 0; r < 3; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2 === 1) b[r][c] = MAN_AI;
  for (let r = SIZE - 3; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if ((r + c) % 2 === 1) b[r][c] = MAN_H;
  return b;
}

function pieceDirs(v) {
  const owner = pieceOwner(v);
  return isKing(v) ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[manDir(owner), -1], [manDir(owner), 1]];
}

function simpleMovesFrom(board, r, c) {
  const v = board[r][c];
  const moves = [];
  pieceDirs(v).forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && board[nr][nc] === 0) moves.push({ from: [r, c], steps: [{ to: [nr, nc] }] });
  });
  return moves;
}

function captureStepsFrom(board, r, c) {
  const v = board[r][c];
  const owner = pieceOwner(v);
  const out = [];
  pieceDirs(v).forEach(([dr, dc]) => {
    const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
    if (inBounds(lr, lc) && board[lr][lc] === 0 && inBounds(mr, mc) && board[mr][mc] !== 0 && pieceOwner(board[mr][mc]) !== owner) {
      out.push({ mid: [mr, mc], to: [lr, lc] });
    }
  });
  return out;
}

function promoteIfNeeded(piece, to) {
  const owner = pieceOwner(piece);
  if (!isKing(piece) && to[0] === promoRow(owner)) return owner === HUMAN ? KING_H : KING_AI;
  return piece;
}

function expandCaptureSequences(board, r, c) {
  const steps = captureStepsFrom(board, r, c);
  if (!steps.length) return [[]];
  const sequences = [];
  steps.forEach((step) => {
    const b2 = cloneBoard(board);
    const piece = b2[r][c];
    b2[r][c] = 0;
    b2[step.mid[0]][step.mid[1]] = 0;
    const promoted = promoteIfNeeded(piece, step.to);
    b2[step.to[0]][step.to[1]] = promoted;
    const rest = expandCaptureSequences(b2, step.to[0], step.to[1]);
    rest.forEach((r2) => sequences.push([step, ...r2]));
  });
  return sequences;
}

function allCapturesForPlayer(board, player) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (pieceOwner(board[r][c]) === player) {
      expandCaptureSequences(board, r, c).filter((s) => s.length > 0).forEach((seq) => out.push({ from: [r, c], steps: seq }));
    }
  }
  return out;
}

function allSimpleForPlayer(board, player) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (pieceOwner(board[r][c]) === player) out.push(...simpleMovesFrom(board, r, c));
  }
  return out;
}

function generateMoves(board, player) {
  const caps = allCapturesForPlayer(board, player);
  return caps.length ? caps : allSimpleForPlayer(board, player);
}

function applyFullMove(board, move) {
  let [r, c] = move.from;
  let piece = board[r][c];
  board[r][c] = 0;
  move.steps.forEach((step) => {
    if (step.mid) board[step.mid[0]][step.mid[1]] = 0;
    piece = promoteIfNeeded(piece, step.to);
    board[step.to[0]][step.to[1]] = piece;
    r = step.to[0]; c = step.to[1];
  });
  return [r, c];
}

function countPieces(board) {
  let h = 0, a = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = board[r][c];
    if (v === MAN_H) h += 1; else if (v === KING_H) h += 1.5; else if (v === MAN_AI) a += 1; else if (v === KING_AI) a += 1.5;
  }
  return { h, a };
}

function evaluate(board, player, opp) {
  let score = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const v = board[r][c];
    if (!v) continue;
    const owner = pieceOwner(v);
    let val = isKing(v) ? 3 : 1;
    if (!isKing(v)) val += (owner === HUMAN ? (SIZE - 1 - r) : r) * 0.08;
    score += owner === player ? val : -val;
  }
  score += (generateMoves(board, player).length - generateMoves(board, opp).length) * 0.15;
  return score;
}

function minimax(board, depth, alpha, beta, maximizing, player, opp) {
  const who = maximizing ? player : opp;
  const moves = generateMoves(board, who);
  if (depth === 0 || moves.length === 0) return { score: evaluate(board, player, opp) - (moves.length === 0 && !maximizing ? -500 : moves.length === 0 && maximizing ? 500 : 0) };
  let best = null;
  for (const move of moves) {
    const b2 = cloneBoard(board);
    applyFullMove(b2, move);
    const result = minimax(b2, depth - 1, alpha, beta, !maximizing, player, opp);
    if (maximizing) {
      if (best === null || result.score > best.score) best = { score: result.score, move };
      alpha = Math.max(alpha, result.score);
    } else {
      if (best === null || result.score < best.score) best = { score: result.score, move };
      beta = Math.min(beta, result.score);
    }
    if (alpha >= beta) break;
  }
  return best;
}

function chooseMove(board, level, player, opp, depth) {
  const moves = generateMoves(board, player);
  if (!moves.length) return null;
  if (level === 'random') return moves[Math.floor(Math.random() * moves.length)];
  if (level === 'greedy') {
    let best = moves[0], bestLen = moves[0].steps.length;
    moves.forEach((m) => { if (m.steps.length > bestLen) { bestLen = m.steps.length; best = m; } });
    return best;
  }
  const result = minimax(board, depth || 4, -Infinity, Infinity, true, player, opp);
  return (result && result.move) || moves[Math.floor(Math.random() * moves.length)];
}

function cellXY(r, c) {
  const half = (SIZE - 1) / 2;
  return { x: (c - half) * CELL, y: (half - r) * CELL };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  let board = initialBoard();
  let finished = false, aiThinking = false, moves = 0;
  let selected = null; // {r,c}
  let forcedContinue = null; // {r,c} must continue capturing with this piece

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ck-meta">
      <span class="ck-score"><span class="ck-dot ck-dot--you"></span> You: <span id="ck-you">12</span></span>
      <span id="ck-status">Your turn</span>
      <span class="ck-score"><span class="ck-dot ck-dot--ai"></span> AI: <span id="ck-ai">12</span></span>
    </div>
    <div class="pc-canvas3d" id="ck-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">Tap a piece, then a highlighted square</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ck-canvas');
  const statusEl = wrap.querySelector('#ck-status');
  const youEl = wrap.querySelector('#ck-you');
  const aiEl = wrap.querySelector('#ck-ai');

  const stage = createStage(canvasHost, { distance: 26 });

  const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(SIZE * CELL + 0.4, SIZE * CELL + 0.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.7 }));
  boardMesh.position.z = -0.22;
  boardMesh.receiveShadow = true;
  stage.world.add(boardMesh);
  popIn(boardMesh, { duration: 260 });

  const cellMeshes = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      const { x, y } = cellXY(r, c);
      const cell = makeTile({ w: 0.96, h: 0.96, depth: 0.1, radius: 0.06, color: (r + c) % 2 === 1 ? DARK : LIGHT, roughness: 0.85 });
      cell.position.set(x, y, -0.02);
      cell.userData = { r, c };
      stage.world.add(cell);
      row.push(cell);
    }
    cellMeshes.push(row);
  }

  const pieceMeshes = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

  function makePieceMesh(v) {
    const owner = pieceOwner(v);
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 28), new THREE.MeshPhysicalMaterial({ color: owner === HUMAN ? HUMAN_COLOR : AI_COLOR, roughness: 0.35, metalness: 0.15, clearcoat: 0.5 }));
    base.rotation.x = Math.PI / 2;
    base.castShadow = true;
    group.add(base);
    if (isKing(v)) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.22, 5), new THREE.MeshStandardMaterial({ color: 0xffd93d, roughness: 0.3, metalness: 0.4 }));
      crown.position.z = 0.2;
      group.add(crown);
    }
    return group;
  }

  function refreshPieces(animateSet) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const v = board[r][c];
      const existing = pieceMeshes[r][c];
      if (!v) { if (existing) { stage.world.remove(existing); pieceMeshes[r][c] = null; } continue; }
      const { x, y } = cellXY(r, c);
      if (!existing) {
        const mesh = makePieceMesh(v);
        mesh.position.set(x, y, 0.11);
        stage.world.add(mesh);
        pieceMeshes[r][c] = mesh;
        if (animateSet && animateSet.has(r + ',' + c)) popIn(mesh, { duration: 200 }); else mesh.scale.set(1, 1, 1);
      } else {
        // update king-ness by rebuilding if needed
        const wantsKing = isKing(v);
        const hasCrown = existing.children.length > 1;
        if (wantsKing !== hasCrown) {
          stage.world.remove(existing);
          const mesh = makePieceMesh(v);
          mesh.position.set(x, y, 0.11);
          stage.world.add(mesh);
          pieceMeshes[r][c] = mesh;
          tween(mesh.scale, { x: 1.3, y: 1.3, z: 1.3 }, 200, Easing.outBack, () => tween(mesh.scale, { x: 1, y: 1, z: 1 }, 200, Easing.outCubic));
        } else {
          existing.position.set(x, y, 0.11);
        }
      }
    }
  }
  refreshPieces();

  function syncCounts() {
    const { h, a } = countPieces(board);
    youEl.textContent = Math.ceil(h); aiEl.textContent = Math.ceil(a);
    return { h, a };
  }
  syncCounts();

  function clearHighlights() {
    cellMeshes.flat().forEach((m) => { m.material.emissiveIntensity = 0; });
  }

  function highlightDests(dests) {
    clearHighlights();
    dests.forEach(([r, c]) => { cellMeshes[r][c].material.emissive.set(0xffd93d); cellMeshes[r][c].material.emissiveIntensity = 0.4; });
  }

  function highlightSelectable(cells) {
    clearHighlights();
    cells.forEach(([r, c]) => { cellMeshes[r][c].material.emissive.set(0x23d18b); cellMeshes[r][c].material.emissiveIntensity = 0.3; });
  }

  function humanMandatoryCaptures() { return allCapturesForPlayer(board, HUMAN); }

  function refreshSelectableHighlight() {
    if (finished || aiThinking) return;
    if (forcedContinue) {
      const steps = captureStepsFrom(board, forcedContinue.r, forcedContinue.c);
      highlightDests(steps.map((s) => s.to));
      return;
    }
    const caps = humanMandatoryCaptures();
    if (caps.length) {
      const starts = [...new Set(caps.map((m) => m.from.join(',')))].map((k) => k.split(',').map(Number));
      highlightSelectable(starts);
    } else {
      const withMoves = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (pieceOwner(board[r][c]) === HUMAN && simpleMovesFrom(board, r, c).length) withMoves.push([r, c]);
      highlightSelectable(withMoves);
    }
  }

  function animateMove(fromRC, steps, onDone) {
    const mesh = pieceMeshes[fromRC[0]][fromRC[1]];
    let idx = 0;
    function nextStep() {
      if (idx >= steps.length) { onDone(); return; }
      const step = steps[idx];
      const target = cellXY(step.to[0], step.to[1]);
      tween(mesh.position, { x: target.x, y: target.y }, 220, Easing.outCubic, () => {
        if (step.mid) {
          const cap = pieceMeshes[step.mid[0]][step.mid[1]];
          if (cap) { tween(cap.scale, { x: 0.01, y: 0.01, z: 0.01 }, 180, Easing.inOutQuad, () => { stage.world.remove(cap); }); }
          pieceMeshes[step.mid[0]][step.mid[1]] = null;
          api.sound.match();
        } else {
          api.sound.move();
        }
        idx++;
        nextStep();
      });
    }
    nextStep();
  }

  function checkGameEnd() {
    const { h, a } = countPieces(board);
    if (h <= 0 || a <= 0 || generateMoves(board, HUMAN).length === 0 || generateMoves(board, AI).length === 0) {
      finished = true;
      clearHighlights();
      if (h > a || (a <= 0 && h > 0) || generateMoves(board, AI).length === 0) {
        statusEl.textContent = 'You win!';
        api.ui.burstFromElement(canvasHost);
        const margin = h - a;
        const stars = margin >= 6 ? 3 : margin >= 2 ? 2 : 1;
        setTimeout(() => api.win(stars, { moves }), 300);
      } else {
        statusEl.textContent = 'The AI wins.';
        setTimeout(() => api.lose('the AI cleared your pieces. Try again.'), 300);
      }
      return true;
    }
    return false;
  }

  function endHumanTurn() {
    selected = null; forcedContinue = null;
    syncCounts();
    if (checkGameEnd()) return;
    aiTurn();
  }

  function aiTurn() {
    aiThinking = true;
    clearHighlights();
    statusEl.textContent = "AI's turn...";
    setTimeout(() => {
      const move = chooseMove(board, cfg.level, AI, HUMAN, cfg.depth);
      if (!move) { aiThinking = false; checkGameEnd(); return; }
      const fromRC = move.from;
      animateMove(fromRC, move.steps, () => {
        applyFullMove(board, move);
        refreshPieces();
        moves++;
        syncCounts();
        aiThinking = false;
        if (!checkGameEnd()) {
          statusEl.textContent = 'Your turn';
          refreshSelectableHighlight();
        }
      });
    }, 500);
  }

  function tryHumanCapture(r, c, dest) {
    const from = forcedContinue || selected;
    const steps = captureStepsFrom(board, from.r, from.c).filter((s) => s.to[0] === dest[0] && s.to[1] === dest[1]);
    if (!steps.length) return false;
    const step = steps[0];
    animateMove([from.r, from.c], [step], () => {
      const piece = board[from.r][from.c];
      board[from.r][from.c] = 0;
      board[step.mid[0]][step.mid[1]] = 0;
      const promoted = promoteIfNeeded(piece, step.to);
      board[step.to[0]][step.to[1]] = promoted;
      refreshPieces();
      moves++;
      const more = captureStepsFrom(board, step.to[0], step.to[1]);
      if (more.length) {
        forcedContinue = { r: step.to[0], c: step.to[1] };
        selected = null;
        statusEl.textContent = 'Keep jumping with that piece!';
        refreshSelectableHighlight();
      } else {
        endHumanTurn();
      }
    });
    return true;
  }

  function onPointerDown(e) {
    if (finished || aiThinking) return;
    const hit = stage.pick(e.clientX, e.clientY, cellMeshes.flat());
    if (!hit) return;
    const { r, c } = hit.object.userData;

    if (forcedContinue) {
      if (!tryHumanCapture(r, c, [r, c])) { api.sound.error(); api.ui.shake(canvasHost); }
      return;
    }

    const caps = humanMandatoryCaptures();
    if (selected) {
      if (caps.length) {
        if (tryHumanCapture(selected.r, selected.c, [r, c])) return;
      } else {
        const legalDest = simpleMovesFrom(board, selected.r, selected.c).find((m) => m.steps[0].to[0] === r && m.steps[0].to[1] === c);
        if (legalDest) {
          animateMove([selected.r, selected.c], legalDest.steps, () => {
            const piece = board[selected.r][selected.c];
            board[selected.r][selected.c] = 0;
            board[r][c] = promoteIfNeeded(piece, [r, c]);
            refreshPieces();
            moves++;
            endHumanTurn();
          });
          return;
        }
      }
      // reselect or invalid
      if (pieceOwner(board[r][c]) === HUMAN) { selected = { r, c }; api.sound.click(); refreshSelectableHighlight(); highlightSelected(); return; }
      api.sound.error(); api.ui.shake(canvasHost);
      selected = null; refreshSelectableHighlight();
      return;
    }

    if (pieceOwner(board[r][c]) === HUMAN) {
      const ownCaps = caps.filter((m) => m.from[0] === r && m.from[1] === c);
      if (caps.length && !ownCaps.length) { api.sound.error(); api.ui.shake(canvasHost); return; }
      selected = { r, c };
      api.sound.click();
      refreshSelectableHighlight();
      highlightSelected();
    }
  }

  function highlightSelected() {
    if (!selected) return;
    cellMeshes[selected.r][selected.c].material.emissive.set(0xff4d8d);
    cellMeshes[selected.r][selected.c].material.emissiveIntensity = 0.5;
    const caps = humanMandatoryCaptures().filter((m) => m.from[0] === selected.r && m.from[1] === selected.c);
    if (caps.length) {
      highlightDestsKeep(caps.map((m) => m.steps[0].to));
    } else {
      highlightDestsKeep(simpleMovesFrom(board, selected.r, selected.c).map((m) => m.steps[0].to));
    }
  }
  function highlightDestsKeep(dests) {
    dests.forEach(([r, c]) => { cellMeshes[r][c].material.emissive.set(0xffd93d); cellMeshes[r][c].material.emissiveIntensity = 0.4; });
  }

  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  refreshSelectableHighlight();

  function hint() {
    if (finished || aiThinking) return;
    const move = chooseMove(board, 'minimax', HUMAN, AI, 4);
    if (!move) return;
    clearHighlights();
    cellMeshes[move.from[0]][move.from[1]].material.emissive.set(0xff4d8d);
    cellMeshes[move.from[0]][move.from[1]].material.emissiveIntensity = 0.5;
    cellMeshes[move.steps[0].to[0]][move.steps[0].to[1]].material.emissive.set(0xffd93d);
    cellMeshes[move.steps[0].to[0]][move.steps[0].to[1]].material.emissiveIntensity = 0.5;
    api.ui.toast(`${api.playerName}, try moving the glowing piece!`);
    setTimeout(() => { if (!selected && !forcedContinue) refreshSelectableHighlight(); }, 1400);
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

PC.Games.register('checkers', { mount });
