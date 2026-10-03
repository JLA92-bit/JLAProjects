/**
 * Game 22 - Checkers vs AI (3D). Standard 8x8 board, mandatory captures,
 * kinging on the back row. Tap your piece, then tap a highlighted
 * destination. If a capture is available anywhere on the board you must
 * take it; landing with another jump available forces you to continue
 * with the same piece.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, disposeObject } from '../../shared/js/three-stage.js';

const SIZE = 8;
const CELL = 1.0;
const HUMAN = 1, AI = 2;
const MAN_H = 1, KING_H = 2, MAN_AI = 3, KING_AI = 4;
const DARK = 0x3a2a1e, LIGHT = 0xd8b98a;
// Computer pieces are cream so they stand out on the dark squares they sit on.
const HUMAN_COLOR = 0xff4d8d, AI_COLOR = 0xf4efe6;

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

/* ---------- lifecycle + framing helpers (kept local so this file stays self-contained) ---------- */

// World half-height per unit of stage distance (matches three-stage.js).
const VIEW_SCALE = 0.42;

// Pick a camera distance that fits a board of the given world half-extents
// into the canvas's real aspect ratio, with a safety margin so a later
// resize (address bar, rotated phone, wrapped status text) never crops it.
function fitDistance(host, halfW, halfH, margin = 1.08) {
  const w = host.clientWidth || 340, h = host.clientHeight || 520;
  const aspect = Math.max(0.35, Math.min(2.2, w / h));
  return (Math.max(halfH, halfW / aspect) * margin) / VIEW_SCALE;
}

// Wraps a raw mount so nothing can call api.win/api.lose after unmount,
// hint() never throws, and (optionally) a lost round offers an in-place
// "Try again" button instead of leaving a dead board on screen.
function guardMount(rawMount, { retry = false } = {}) {
  return function mount(container, difficulty, api) {
    let cur = null;
    function start() {
      const inst = { alive: true };
      const safeApi = Object.assign({}, api, {
        win: (...args) => { if (inst.alive) { inst.alive = false; api.win(...args); } },
        lose: (msg) => {
          if (!inst.alive) return;
          inst.alive = false;
          api.lose(msg);
          if (retry) showRetry(inst);
        },
      });
      const res = rawMount(container, difficulty, safeApi);
      cur = {
        inst,
        el: container.lastElementChild,
        unmount: typeof res === 'function' ? res : (res && res.unmount) || (() => {}),
        hint: res && typeof res === 'object' ? res.hint : null,
      };
    }
    function stop() {
      if (!cur) return;
      const c = cur;
      cur = null;
      c.inst.alive = false;
      try { c.unmount(); } catch (e) { console.warn(e); }
    }
    function showRetry(inst) {
      if (!cur || cur.inst !== inst || !cur.el) return;
      const host = cur.el.querySelector('.pc-canvas3d') || cur.el;
      const box = document.createElement('div');
      box.style.cssText = 'position:absolute;left:0;right:0;bottom:56px;display:flex;justify-content:center;z-index:6;pointer-events:none;';
      box.innerHTML = '<button type="button" class="pc-btn pc-btn--green" style="pointer-events:auto;min-height:48px;">\u{1F501} Try again</button>';
      box.querySelector('button').addEventListener('click', () => {
        if (!cur || cur.inst !== inst) return;
        api.sound.click();
        stop();
        start();
      });
      host.appendChild(box);
    }
    start();
    return {
      unmount: () => stop(),
      hint: () => {
        if (!cur || !cur.hint) return;
        try { cur.hint(); } catch (e) { console.warn(e); }
      },
    };
  };
}

// setTimeout that is cancelled in bulk on unmount.
function makeTimers() {
  const ids = new Set();
  return {
    later(fn, ms) {
      const id = setTimeout(() => { ids.delete(id); fn(); }, ms);
      ids.add(id);
      return id;
    },
    clear() { ids.forEach(clearTimeout); ids.clear(); },
  };
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  let board = initialBoard();
  let finished = false, aiThinking = false, busy = false, moves = 0;
  const timers = makeTimers();
  let selected = null; // {r,c}
  let forcedContinue = null; // {r,c} must continue capturing with this piece

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="ck-meta">
      <span class="ck-score"><span class="ck-dot ck-dot--you"></span> You: <span id="ck-you">12</span></span>
      <span id="ck-status">Your turn</span>
      <span class="ck-score"><span class="ck-dot ck-dot--ai"></span> Computer: <span id="ck-ai">12</span></span>
    </div>
    <div class="pc-canvas3d" id="ck-canvas">
      <div class="pc-overlay-bottom"><span class="pc-chip">You are pink - tap a glowing piece, then a yellow square</span></div>
    </div>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#ck-canvas');
  const statusEl = wrap.querySelector('#ck-status');
  const youEl = wrap.querySelector('#ck-you');
  const aiEl = wrap.querySelector('#ck-ai');

  const boardHalf = (SIZE * CELL) / 2 + 0.3;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, boardHalf, boardHalf + 0.6) });

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
      if (!v) { if (existing) { stage.world.remove(existing); disposeObject(existing); pieceMeshes[r][c] = null; } continue; }
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
          disposeObject(existing);
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
          if (cap) { tween(cap.scale, { x: 0.01, y: 0.01, z: 0.01 }, 180, Easing.inOutQuad, () => { stage.world.remove(cap); disposeObject(cap); }); }
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

  // `toMove` is the side whose turn it is next: if it has no pieces or no
  // legal move, it loses (standard checkers rule).
  function checkGameEnd(toMove) {
    if (generateMoves(board, toMove).length > 0) return false;
    finished = true;
    clearHighlights();
    const { h, a } = countPieces(board);
    if (toMove === AI) {
      statusEl.textContent = 'You win!';
      api.ui.burstFromElement(canvasHost);
      const margin = h - a;
      const stars = margin >= 6 ? 3 : margin >= 2 ? 2 : 1;
      timers.later(() => api.win(stars, { moves }), 300);
    } else {
      statusEl.textContent = 'The computer wins.';
      timers.later(() => api.lose(h > 0 ? 'your pieces are trapped with no moves left. Try again!' : 'the computer captured all your pieces. Try again!'), 300);
    }
    return true;
  }

  function endHumanTurn() {
    selected = null; forcedContinue = null;
    busy = false;
    syncCounts();
    if (checkGameEnd(AI)) return;
    aiTurn();
  }

  function aiTurn() {
    aiThinking = true;
    clearHighlights();
    statusEl.textContent = 'Computer is thinking...';
    timers.later(() => {
      if (finished) return;
      const move = chooseMove(board, cfg.level, AI, HUMAN, cfg.depth);
      if (!move) { aiThinking = false; checkGameEnd(AI); return; }
      const fromRC = move.from;
      animateMove(fromRC, move.steps, () => {
        if (finished) return;
        applyFullMove(board, move);
        refreshPieces();
        moves++;
        syncCounts();
        aiThinking = false;
        if (!checkGameEnd(HUMAN)) {
          statusEl.textContent = humanMandatoryCaptures().length ? 'Your turn - you must jump!' : 'Your turn';
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
    busy = true;
    clearHighlights();
    animateMove([from.r, from.c], [step], () => {
      if (finished) return;
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
        busy = false;
        statusEl.textContent = 'Keep jumping with that piece!';
        refreshSelectableHighlight();
      } else {
        endHumanTurn();
      }
    });
    return true;
  }

  function invalid(msg) {
    api.sound.error();
    api.ui.shake(canvasHost);
    if (msg) api.ui.toast(msg);
  }

  function onPointerDown(e) {
    if (finished || aiThinking || busy) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!p) return;
    const half = (SIZE - 1) / 2;
    const r = Math.round(half - p.y / CELL), c = Math.round(p.x / CELL + half);
    if (!inBounds(r, c)) return;

    if (forcedContinue) {
      if (!tryHumanCapture(r, c, [r, c])) invalid('Keep jumping with the same piece - tap a yellow square.');
      return;
    }

    const caps = humanMandatoryCaptures();
    if (selected) {
      if (caps.length) {
        if (tryHumanCapture(selected.r, selected.c, [r, c])) return;
      } else {
        const legalDest = simpleMovesFrom(board, selected.r, selected.c).find((m) => m.steps[0].to[0] === r && m.steps[0].to[1] === c);
        if (legalDest) {
          const from = selected;
          busy = true;
          clearHighlights();
          animateMove([from.r, from.c], legalDest.steps, () => {
            if (finished) return;
            const piece = board[from.r][from.c];
            board[from.r][from.c] = 0;
            board[r][c] = promoteIfNeeded(piece, [r, c]);
            refreshPieces();
            moves++;
            endHumanTurn();
          });
          return;
        }
      }
      // reselect or invalid
      if (selected.r === r && selected.c === c) { selected = null; api.sound.click(); refreshSelectableHighlight(); return; }
      if (pieceOwner(board[r][c]) === HUMAN) { selectPiece(r, c, caps); return; }
      invalid(caps.length ? 'You have a jump available - you must take it!' : 'Pieces move one square diagonally forward - tap a yellow square.');
      selected = null; refreshSelectableHighlight();
      return;
    }

    if (pieceOwner(board[r][c]) === HUMAN) { selectPiece(r, c, caps); return; }
    if (board[r][c]) invalid('That is one of the computer\'s pieces - tap one of your pink ones.');
    else invalid('Tap one of your glowing pieces first.');
  }

  function selectPiece(r, c, caps) {
    const ownCaps = caps.filter((m) => m.from[0] === r && m.from[1] === c);
    if (caps.length && !ownCaps.length) { invalid('You have a jump available - you must take it! Try a glowing piece.'); selected = null; refreshSelectableHighlight(); return; }
    if (!caps.length && !simpleMovesFrom(board, r, c).length) { invalid('That piece is blocked - try a glowing one.'); selected = null; refreshSelectableHighlight(); return; }
    selected = { r, c };
    api.sound.click();
    refreshSelectableHighlight();
    highlightSelected();
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
    if (finished) return;
    if (aiThinking || busy) { api.ui.toast(`${api.playerName}, wait for the computer to finish its move.`); return; }
    if (forcedContinue) {
      const steps = captureStepsFrom(board, forcedContinue.r, forcedContinue.c);
      if (steps.length) {
        highlightDests(steps.map((st) => st.to));
        api.ui.toast(`${api.playerName}, keep jumping - tap a yellow square!`);
      }
      return;
    }
    const move = chooseMove(board, 'minimax', HUMAN, AI, 4);
    if (!move) return;
    selected = null;
    clearHighlights();
    cellMeshes[move.from[0]][move.from[1]].material.emissive.set(0xff4d8d);
    cellMeshes[move.from[0]][move.from[1]].material.emissiveIntensity = 0.5;
    cellMeshes[move.steps[0].to[0]][move.steps[0].to[1]].material.emissive.set(0xffd93d);
    cellMeshes[move.steps[0].to[0]][move.steps[0].to[1]].material.emissiveIntensity = 0.5;
    api.ui.toast(`${api.playerName}, try moving the glowing piece!`);
    timers.later(() => { if (!selected && !forcedContinue && !finished && !aiThinking && !busy) refreshSelectableHighlight(); }, 1400);
  }

  return {
    unmount: () => {
      finished = true;
      timers.clear();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.dispose();
      wrap.remove();
    },
    hint,
  };
}

PC.Games.register('checkers', { mount: guardMount(mount, { retry: true }) });
