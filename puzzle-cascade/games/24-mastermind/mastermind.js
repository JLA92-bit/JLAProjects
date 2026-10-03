/**
 * Game 24 - Mastermind (3D). The AI hides a secret color code; guess it
 * row by row. Each guess scores black pegs (right color, right slot)
 * and white pegs (right color, wrong slot). Crack the code before you
 * run out of rows.
 */
import * as THREE from 'three';
import { createStage, makeTile, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

const CONFIG = {
  easy: { length: 4, colors: 6, guesses: 10 },
  medium: { length: 5, colors: 7, guesses: 10 },
  hard: { length: 6, colors: 8, guesses: 12 },
};
const PEG_SPACING = 0.92;
const ROW_SPACING = 1.0;
const FB_SPACING = 0.34;

function feedback(secret, guess) {
  const n = secret.length;
  let black = 0;
  const secretLeft = [], guessLeft = [];
  for (let i = 0; i < n; i++) {
    if (secret[i] === guess[i]) black++;
    else { secretLeft.push(secret[i]); guessLeft.push(guess[i]); }
  }
  let white = 0;
  const counts = {};
  secretLeft.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  guessLeft.forEach((v) => { if (counts[v] > 0) { white++; counts[v]--; } });
  return { black, white };
}

function decode(i, length, colors) {
  const arr = [];
  for (let k = 0; k < length; k++) { arr.push(i % colors); i = Math.floor(i / colors); }
  return arr;
}

// Candidate codes are kept as plain integer indices (8^6 = 262k on hard)
// rather than 262k little arrays, which is far lighter on phones.
function allCandidates(length, colors) {
  const total = Math.pow(colors, length);
  const out = new Int32Array(total);
  for (let i = 0; i < total; i++) out[i] = i;
  return out;
}

const hexOf = (n) => '#' + n.toString(16).padStart(6, '0');

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
  const { length, colors, guesses } = cfg;
  const secret = Array.from({ length }, () => Math.floor(Math.random() * colors));
  const rows = []; // { guess: number[], fb: {black,white} }
  let currentGuess = new Array(length).fill(null);
  let activeRow = 0;
  let finished = false;
  let candidates = allCandidates(length, colors);
  const timers = makeTimers();

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="mm-meta"><span id="mm-status">Tap colors to fill the glowing row, then submit</span></div>
    <div class="pc-canvas3d" id="mm-canvas"></div>
    <div class="mm-palette" id="mm-palette"></div>
    <button type="button" class="pc-btn pc-btn--green mm-submit" id="mm-submit" disabled>\u2714\uFE0F Submit guess</button>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#mm-canvas');
  const statusEl = wrap.querySelector('#mm-status');
  const paletteEl = wrap.querySelector('#mm-palette');
  const submitBtn = wrap.querySelector('#mm-submit');

  paletteEl.style.gridTemplateColumns = `repeat(${colors <= 6 ? colors : Math.ceil(colors / 2)}, 46px)`;
  for (let i = 0; i < colors; i++) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'mm-swatch';
    sw.setAttribute('aria-label', `Color ${i + 1}`);
    sw.style.background = hexOf(PALETTE[i]);
    sw.dataset.color = i;
    paletteEl.appendChild(sw);
  }
  let selectedColor = 0;
  function markSelectedSwatch() {
    [...paletteEl.children].forEach((el, i) => el.classList.toggle('is-selected', i === selectedColor));
  }
  // Tapping a color drops it into the next empty slot of the active row.
  paletteEl.addEventListener('click', (e) => {
    const sw = e.target.closest('.mm-swatch');
    if (!sw || finished) return;
    selectedColor = Number(sw.dataset.color);
    markSelectedSwatch();
    const slot = currentGuess.indexOf(null);
    if (slot === -1) {
      api.sound.error();
      api.ui.toast('Row is full - tap Submit, or tap a peg to take it out.');
      return;
    }
    currentGuess[slot] = selectedColor;
    placePeg(activeRow, slot, selectedColor);
    api.sound.click();
    updateSubmitState();
  });
  markSelectedSwatch();

  const fbClusterCols = Math.ceil(length / 2);
  const rowWidth = length * PEG_SPACING + 0.5 + fbClusterCols * FB_SPACING + 0.2;
  const halfBoardW = rowWidth / 2 + 0.2;
  const halfBoardH = (guesses * ROW_SPACING) / 2 + 0.1;
  const stage = createStage(canvasHost, { distance: fitDistance(canvasHost, halfBoardW, halfBoardH) });

  const pegStartX = -rowWidth / 2 + PEG_SPACING / 2;
  const fbStartX = pegStartX + length * PEG_SPACING + 0.15;

  function rowY(idx) { return (guesses - 1) / 2 * ROW_SPACING - idx * ROW_SPACING; }

  const pegMeshes = []; // [row][slot]
  const fbMeshes = []; // [row][slot]
  const rowGroups = [];

  // glowing bar behind the row you're filling in
  const activeBar = makeTile({ w: length * PEG_SPACING + 0.2, h: ROW_SPACING * 0.92, depth: 0.06, radius: 0.3, color: 0xffd93d, emissive: 0xffd93d, emissiveIntensity: 0.25, opacity: 0.35 });
  activeBar.position.set(pegStartX - PEG_SPACING / 2 + (length * PEG_SPACING) / 2, rowY(0), -0.14);
  stage.world.add(activeBar);

  for (let r = 0; r < guesses; r++) {
    const y = rowY(r);
    const group = new THREE.Group();
    group.position.y = y;
    stage.world.add(group);
    rowGroups.push(group);
    const pegRow = [];
    for (let s = 0; s < length; s++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 24), new THREE.MeshStandardMaterial({ color: 0x4a3784, roughness: 0.7 }));
      hole.rotation.x = Math.PI / 2;
      hole.position.set(pegStartX + s * PEG_SPACING, 0, 0);
      hole.receiveShadow = true;
      group.add(hole);
      pegRow.push(null);
    }
    pegMeshes.push(pegRow);
    // light backing plate so both black and white clue pegs stand out
    const plate = makeTile({ w: fbClusterCols * FB_SPACING + 0.12, h: FB_SPACING * 2 + 0.1, depth: 0.06, radius: 0.1, color: 0xb9addb, roughness: 0.7 });
    plate.position.set(fbStartX + ((fbClusterCols - 1) * FB_SPACING) / 2, 0, -0.04);
    group.add(plate);
    const fbRow = [];
    for (let s = 0; s < length; s++) {
      const col = s % fbClusterCols, fr = Math.floor(s / fbClusterCols);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshStandardMaterial({ color: 0x8c7fb3, roughness: 0.6 }));
      dot.position.set(fbStartX + col * FB_SPACING, FB_SPACING / 2 - fr * FB_SPACING, 0.08);
      group.add(dot);
      fbRow.push(dot);
    }
    fbMeshes.push(fbRow);
    popIn(group, { delay: r * 30, duration: 220 });
  }

  function placePeg(row, slot, colorIdx) {
    const group = rowGroups[row];
    let mesh = pegMeshes[row][slot];
    if (mesh) { group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 20), new THREE.MeshPhysicalMaterial({ color: PALETTE[colorIdx], roughness: 0.3, metalness: 0.2, clearcoat: 0.6 }));
    mesh.position.set(pegStartX + slot * PEG_SPACING, 0, 0.18);
    mesh.castShadow = true;
    group.add(mesh);
    pegMeshes[row][slot] = mesh;
    popIn(mesh, { duration: 180 });
  }

  function clearPeg(row, slot) {
    const group = rowGroups[row];
    const mesh = pegMeshes[row][slot];
    if (mesh) { group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); pegMeshes[row][slot] = null; }
  }

  function setFeedback(row, black, white) {
    let idx = 0;
    for (let i = 0; i < black; i++, idx++) fbMeshes[row][idx].material.color.set(0x161022);
    for (let i = 0; i < white; i++, idx++) fbMeshes[row][idx].material.color.set(0xffffff);
    for (; idx < length; idx++) fbMeshes[row][idx].material.color.set(0x8c7fb3);
  }

  function updateSubmitState() {
    submitBtn.disabled = currentGuess.some((v) => v === null) || finished;
  }

  // Tap a slot in the active row: empty -> current color, filled -> remove.
  function onPointerDown(e) {
    if (finished || activeRow >= guesses) return;
    const p = stage.pickPlane(e.clientX, e.clientY, 0);
    if (!p) return;
    const slot = Math.round((p.x - pegStartX) / PEG_SPACING);
    const onActiveRow = Math.abs(p.y - rowY(activeRow)) <= ROW_SPACING * 0.6;
    if (slot < 0 || slot >= length || Math.abs(p.x - (pegStartX + slot * PEG_SPACING)) > PEG_SPACING * 0.6) return;
    if (!onActiveRow) {
      const tappedRow = Math.round(((guesses - 1) / 2 * ROW_SPACING - p.y) / ROW_SPACING);
      if (tappedRow > activeRow && tappedRow < guesses) { api.sound.error(); api.ui.toast('Fill in the glowing row first.'); }
      return;
    }
    if (currentGuess[slot] !== null) {
      currentGuess[slot] = null;
      clearPeg(activeRow, slot);
      api.sound.move();
    } else {
      currentGuess[slot] = selectedColor;
      placePeg(activeRow, slot, selectedColor);
      api.sound.click();
    }
    updateSubmitState();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function codeDots(code) {
    return code.map((c) => `<span class="mm-dot" style="background:${hexOf(PALETTE[c])}"></span>`).join('');
  }

  function endGame(won) {
    finished = true;
    submitBtn.disabled = true;
    activeBar.visible = false;
    if (won) {
      statusEl.textContent = `Cracked it in ${activeRow + 1} guesses!`;
      api.ui.burstFromElement(canvasHost);
      const stars = (activeRow + 1) <= Math.ceil(guesses * 0.4) ? 3 : (activeRow + 1) <= Math.ceil(guesses * 0.7) ? 2 : 1;
      timers.later(() => api.win(stars, { guesses: activeRow + 1 }), 350);
    } else {
      statusEl.innerHTML = `Out of guesses! The code was ${codeDots(secret)}`;
      timers.later(() => api.lose('you ran out of guesses - the secret code is shown above. Try again!'), 350);
    }
  }

  submitBtn.addEventListener('click', () => {
    if (finished) return;
    if (currentGuess.some((v) => v === null)) { api.sound.error(); api.ui.toast('Fill every slot in the row first.'); return; }
    const guess = currentGuess.slice();
    const fb = feedback(secret, guess);
    setFeedback(activeRow, fb.black, fb.white);
    rows.push({ guess, fb });
    candidates = candidates.filter((idx) => {
      const f = feedback(decode(idx, length, colors), guess);
      return f.black === fb.black && f.white === fb.white;
    });
    if (fb.black === length) { endGame(true); return; }
    api.sound.move();
    activeRow++;
    currentGuess = new Array(length).fill(null);
    updateSubmitState();
    if (activeRow >= guesses) { endGame(false); return; }
    activeBar.position.y = rowY(activeRow);
    const parts = [];
    parts.push(`${fb.black} right spot`);
    parts.push(`${fb.white} wrong spot`);
    statusEl.textContent = `Guess ${activeRow + 1} of ${guesses} - last try: ${parts.join(', ')}`;
  });

  function hint() {
    if (finished) return;
    const already = new Set(rows.map((r) => r.guess.join(',')));
    let pick = null;
    for (let i = 0; i < candidates.length; i++) {
      const code = decode(candidates[i], length, colors);
      if (!already.has(code.join(','))) { pick = code; break; }
    }
    if (!pick) { api.ui.toast(`${api.playerName}, no consistent code found - check your feedback!`); return; }
    pick.forEach((colorIdx, slot) => {
      currentGuess[slot] = colorIdx;
      placePeg(activeRow, slot, colorIdx);
    });
    updateSubmitState();
    api.ui.toast(`${api.playerName}, filled in a code that fits all your clues - tap Submit!`);
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

PC.Games.register('mastermind', { mount: guardMount(mount, { retry: true }) });
