/**
 * Game 24 - Mastermind (3D). The AI hides a secret color code; guess it
 * row by row. Each guess scores black pegs (right color, right slot)
 * and white pegs (right color, wrong slot). Crack the code before you
 * run out of rows.
 */
import * as THREE from 'three';
import { createStage, tween, popIn, Easing, PALETTE } from '../../shared/js/three-stage.js';

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

function allCandidates(length, colors) {
  const total = Math.pow(colors, length);
  const out = new Array(total);
  for (let i = 0; i < total; i++) out[i] = decode(i, length, colors);
  return out;
}

function mount(container, difficulty, api) {
  const cfg = CONFIG[difficulty];
  const { length, colors, guesses } = cfg;
  const secret = Array.from({ length }, () => Math.floor(Math.random() * colors));
  const rows = []; // { guess: number[], fb: {black,white} | null }
  let currentGuess = new Array(length).fill(null);
  let activeRow = 0;
  let finished = false;
  let candidates = allCandidates(length, colors);

  const wrap = document.createElement('div');
  wrap.className = 'pc-stage-inner';
  wrap.innerHTML = `
    <div class="mm-meta"><span id="mm-status">Pick colors, fill the row, then submit</span></div>
    <div class="pc-canvas3d" id="mm-canvas"></div>
    <div class="mm-palette" id="mm-palette"></div>
    <button class="pc-btn mm-submit" id="mm-submit" disabled>Submit guess</button>
  `;
  container.appendChild(wrap);
  const canvasHost = wrap.querySelector('#mm-canvas');
  const statusEl = wrap.querySelector('#mm-status');
  const paletteEl = wrap.querySelector('#mm-palette');
  const submitBtn = wrap.querySelector('#mm-submit');

  for (let i = 0; i < colors; i++) {
    const sw = document.createElement('button');
    sw.className = 'mm-swatch';
    sw.style.background = '#' + PALETTE[i].toString(16).padStart(6, '0');
    sw.dataset.color = i;
    paletteEl.appendChild(sw);
  }
  let selectedColor = 0;
  function markSelectedSwatch() {
    [...paletteEl.children].forEach((el, i) => el.classList.toggle('is-selected', i === selectedColor));
  }
  paletteEl.addEventListener('click', (e) => {
    const sw = e.target.closest('.mm-swatch');
    if (!sw) return;
    selectedColor = Number(sw.dataset.color);
    markSelectedSwatch();
    api.sound.click();
  });
  markSelectedSwatch();

  const fbClusterCols = Math.ceil(length / 2);
  const rowWidth = length * PEG_SPACING + 0.7 + fbClusterCols * FB_SPACING * 1.6;
  const halfBoardW = rowWidth / 2 + 0.4;
  const halfBoardH = guesses * ROW_SPACING / 2 + 0.6;
  const aspectMin = 0.46;
  const distance = Math.max((halfBoardW) / (0.42 * aspectMin), halfBoardH / 0.42) * 1.05;

  const stage = createStage(canvasHost, { distance });

  const pegStartX = -rowWidth / 2 + PEG_SPACING / 2;
  const fbStartX = pegStartX + length * PEG_SPACING + 0.4;

  function rowY(idx) { return (guesses - 1) / 2 * ROW_SPACING - idx * ROW_SPACING; }

  const pegMeshes = []; // [row][slot]
  const fbMeshes = []; // [row][slot]
  const rowGroups = [];

  const holeMat = () => new THREE.MeshStandardMaterial({ color: 0x2a1a4d, roughness: 0.7 });

  for (let r = 0; r < guesses; r++) {
    const y = rowY(r);
    const group = new THREE.Group();
    group.position.y = y;
    stage.world.add(group);
    rowGroups.push(group);
    const pegRow = [];
    for (let s = 0; s < length; s++) {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 24), holeMat());
      hole.rotation.x = Math.PI / 2;
      hole.position.set(pegStartX + s * PEG_SPACING, 0, 0);
      hole.receiveShadow = true;
      group.add(hole);
      pegRow.push(null);
    }
    pegMeshes.push(pegRow);
    const fbRow = [];
    for (let s = 0; s < length; s++) {
      const col = s % fbClusterCols, fr = Math.floor(s / fbClusterCols);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), new THREE.MeshStandardMaterial({ color: 0x352457, roughness: 0.6 }));
      dot.position.set(fbStartX + col * FB_SPACING, 0.16 - fr * FB_SPACING, 0.05);
      group.add(dot);
      fbRow.push(dot);
    }
    fbMeshes.push(fbRow);
    popIn(group, { delay: r * 30, duration: 220 });
  }

  function placePeg(row, slot, colorIdx) {
    const group = rowGroups[row];
    let mesh = pegMeshes[row][slot];
    if (mesh) group.remove(mesh);
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
    if (mesh) { group.remove(mesh); pegMeshes[row][slot] = null; }
  }

  function setFeedback(row, black, white) {
    let idx = 0;
    for (let i = 0; i < black; i++, idx++) fbMeshes[row][idx].material.color.set(0x241436);
    for (let i = 0; i < white; i++, idx++) fbMeshes[row][idx].material.color.set(0xfffaf2);
    for (; idx < length; idx++) fbMeshes[row][idx].material.color.set(0x352457);
  }

  function updateSubmitState() {
    submitBtn.disabled = currentGuess.some((v) => v === null) || finished;
  }

  function onPointerDown(e) {
    if (finished || activeRow >= guesses) return;
    const hit = stage.pick(e.clientX, e.clientY, rowGroups[activeRow].children.filter((c) => c.geometry.type === 'CylinderGeometry'));
    if (!hit) return;
    const slot = rowGroups[activeRow].children.indexOf(hit.object);
    if (slot < 0 || slot >= length) return;
    if (currentGuess[slot] === selectedColor) {
      currentGuess[slot] = null;
      clearPeg(activeRow, slot);
    } else {
      currentGuess[slot] = selectedColor;
      placePeg(activeRow, slot, selectedColor);
      api.sound.click();
    }
    updateSubmitState();
  }
  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function endGame(won) {
    finished = true;
    submitBtn.disabled = true;
    if (won) {
      statusEl.textContent = `Cracked it in ${activeRow + 1} guesses!`;
      api.ui.burstFromElement(canvasHost);
      const stars = (activeRow + 1) <= Math.ceil(guesses * 0.4) ? 3 : (activeRow + 1) <= Math.ceil(guesses * 0.7) ? 2 : 1;
      setTimeout(() => api.win(stars, { guesses: activeRow + 1 }), 350);
    } else {
      statusEl.textContent = 'Out of guesses!';
      setTimeout(() => api.lose(`the code was ${secret.map((c) => c + 1).join('-')}.`), 350);
    }
  }

  submitBtn.addEventListener('click', () => {
    if (finished || currentGuess.some((v) => v === null)) return;
    const guess = currentGuess.slice();
    const fb = feedback(secret, guess);
    setFeedback(activeRow, fb.black, fb.white);
    rows.push({ guess, fb });
    candidates = candidates.filter((cand) => {
      const f = feedback(cand, guess);
      return f.black === fb.black && f.white === fb.white;
    });
    api.sound[fb.black === length ? 'win' : 'move']();
    if (fb.black === length) { endGame(true); return; }
    activeRow++;
    currentGuess = new Array(length).fill(null);
    updateSubmitState();
    if (activeRow >= guesses) { endGame(false); return; }
    statusEl.textContent = `Guess ${activeRow + 1} of ${guesses}`;
  });

  function hint() {
    if (finished) return;
    const already = new Set(rows.map((r) => r.guess.join(',')));
    const pick = candidates.find((c) => !already.has(c.join(','))) || candidates[0];
    if (!pick) { api.ui.toast(`${api.playerName}, no consistent code found - check your feedback!`); return; }
    pick.forEach((colorIdx, slot) => {
      currentGuess[slot] = colorIdx;
      placePeg(activeRow, slot, colorIdx);
    });
    updateSubmitState();
    api.ui.toast(`${api.playerName}, filled in a code that fits all your clues!`);
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

PC.Games.register('mastermind', { mount });
