import { createPanZoom } from './panzoom.js';

const MAGNIFIER_USES_PER_LEVEL = 6;
const MAGNIFIER_ZOOM = 2.6;
const TOAST_MS = 2600;

/**
 * Mounts the interactive scene screen for one level.
 *
 * @param {HTMLElement} root - the cloned `.screen-scene` element, already in the DOM.
 * @param {object} level - the level definition from case.json.
 * @param {object} clueData - the level's clue map ({ clues: [...] }).
 * @param {object} opts
 * @param {Set<string>} opts.foundClueIds - clue ids already found in this level (from save).
 * @param {number} opts.hintsRemaining
 * @param {(clue: object) => void} opts.onClueFound - fired once per newly-found real or noise clue.
 * @param {() => void} opts.onHintUsed
 * @param {() => void} opts.onOpenCaseFile
 * @param {() => void} opts.onFinishLevel
 */
export function mountScene(root, level, clueData, opts) {
  const viewport = root.querySelector('[data-role="viewport"]');
  const stage = root.querySelector('[data-role="stage"]');
  const img = root.querySelector('[data-role="image"]');
  const hotspotLayer = root.querySelector('[data-role="hotspots"]');
  const hintGlowEl = root.querySelector('[data-role="hint-glow"]');
  const toastEl = root.querySelector('[data-role="toast"]');
  const magnifierEl = root.querySelector('[data-role="magnifier"]');

  const dayEl = root.querySelector('[data-bind="day"]');
  const pipsEl = root.querySelector('[data-bind="cluePips"]');
  const hintCountEl = root.querySelector('[data-bind="hintCount"]');
  const toastTitleEl = root.querySelector('[data-bind="toastTitle"]');
  const toastFlavorEl = root.querySelector('[data-bind="toastFlavor"]');
  const magUsesEl = root.querySelector('[data-bind="magnifierUses"]');

  const magnifierToggleBtn = root.querySelector('[data-action="toggle-magnifier"]');
  const continueBtn = root.querySelector('[data-action="finish-level"]');
  const hintBtn = root.querySelector('[data-action="use-hint"]');

  const realClues = clueData.clues.filter((c) => c.type === 'real');

  const foundReal = new Set([...opts.foundClueIds].filter((id) => isRealId(id)));
  const foundAll = new Set(opts.foundClueIds);
  let hintsRemaining = opts.hintsRemaining;
  let magnifierUsesLeft = MAGNIFIER_USES_PER_LEVEL;
  let magnifierActive = false;
  let toastTimer = null;
  let hintTimer = null;

  function isRealId(id) {
    return realClues.some((c) => c.id === id);
  }

  dayEl.textContent = `${level.day} · ${level.title}`;

  // ---------- Hotspots ----------

  function buildHotspots() {
    hotspotLayer.innerHTML = '';
    clueData.clues.forEach((clue) => {
      const btn = document.createElement('button');
      btn.className = 'hotspot';
      btn.dataset.clueId = clue.id;
      btn.style.left = `${clue.x}%`;
      btn.style.top = `${clue.y}%`;
      positionHotspotSize(btn, clue);
      if (foundAll.has(clue.id)) btn.classList.add('found');
      // Note: deliberately not a pointerup listener. The viewport calls
      // viewport.setPointerCapture() on pointerdown for pan/zoom, which
      // retargets subsequent pointer events to the viewport itself and
      // would silently swallow a pointerup fired on this button. The
      // synthetic `click` event, unlike pointer events, is not affected
      // by pointer capture and still hit-tests normally, so it's the
      // reliable signal here.
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleHotspotTap(clue, btn);
      });
      hotspotLayer.appendChild(btn);
    });
  }

  function positionHotspotSize(btn, clue) {
    const displayedWidth = img.clientWidth || clueData.baseImageWidth;
    const scaleFactor = displayedWidth / clueData.baseImageWidth;
    // Generous invisible hit area vs. the "true" difficulty radius: the
    // hit target is 1.6x the stated radius so tiny late-game clues are
    // hard to *spot* but not physically unreachable by touch.
    const px = clue.radius * scaleFactor * 1.6;
    btn.style.width = `${px}px`;
    btn.style.height = `${px}px`;
  }

  function resizeHotspots() {
    [...hotspotLayer.children].forEach((btn) => {
      const clue = clueData.clues.find((c) => c.id === btn.dataset.clueId);
      if (clue) positionHotspotSize(btn, clue);
    });
  }

  // ---------- Tap feedback ----------

  function handleHotspotTap(clue, btn) {
    if (foundAll.has(clue.id)) return;
    foundAll.add(clue.id);
    btn.classList.add('found');
    spawnBurst(clue);

    if (clue.type === 'real') {
      foundReal.add(clue.id);
      updatePips();
    }

    opts.onClueFound(clue);
    showToast(clue);
    maybeShowContinue();
  }

  function spawnBurst(clue) {
    const el = document.createElement('div');
    el.className = 'found-burst';
    el.style.left = `${clue.x}%`;
    el.style.top = `${clue.y}%`;
    hotspotLayer.appendChild(el);
    setTimeout(() => el.remove(), 600);
  }

  function handleMiss(clientX, clientY) {
    const rect = hotspotLayer.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'miss-ripple';
    el.style.left = `${clientX - rect.left}px`;
    el.style.top = `${clientY - rect.top}px`;
    hotspotLayer.appendChild(el);
    setTimeout(() => el.remove(), 550);
  }

  function showToast(clue) {
    clearTimeout(toastTimer);
    toastTitleEl.textContent = clue.type === 'real' ? clue.title : `${clue.title} — dead end`;
    toastFlavorEl.textContent = clue.flavor;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, TOAST_MS);
  }

  // ---------- Pips / progress ----------

  function updatePips() {
    pipsEl.innerHTML = '';
    for (let i = 0; i < level.clueGoal; i++) {
      const pip = document.createElement('span');
      pip.className = 'clue-pip' + (i < foundReal.size ? ' found' : '');
      pipsEl.appendChild(pip);
    }
  }

  function maybeShowContinue() {
    if (foundReal.size >= level.requiredClues) {
      continueBtn.hidden = false;
    }
  }

  // ---------- Hint ----------

  function updateHintBadge() {
    hintCountEl.textContent = String(hintsRemaining);
    hintBtn.disabled = hintsRemaining <= 0;
    hintBtn.style.opacity = hintsRemaining <= 0 ? '0.4' : '1';
  }

  function useHint() {
    if (hintsRemaining <= 0) return;
    const unfound = realClues.filter((c) => !foundAll.has(c.id));
    if (unfound.length === 0) return;
    hintsRemaining -= 1;
    updateHintBadge();
    opts.onHintUsed();

    const target = unfound[Math.floor(Math.random() * unfound.length)];
    clearTimeout(hintTimer);
    hintGlowEl.hidden = false;
    hintGlowEl.style.left = `${target.x}%`;
    hintGlowEl.style.top = `${target.y}%`;
    hintTimer = setTimeout(() => {
      hintGlowEl.hidden = true;
    }, 3200);
  }

  // ---------- Magnifier ----------

  function updateMagBadge() {
    magUsesEl.textContent = String(magnifierUsesLeft);
  }

  function toggleMagnifier() {
    if (magnifierUsesLeft <= 0 && !magnifierActive) return;
    magnifierActive = !magnifierActive;
    magnifierToggleBtn.classList.toggle('active', magnifierActive);
    magnifierEl.hidden = !magnifierActive;
    if (magnifierActive) {
      magnifierEl.style.backgroundImage = `url("${img.src}")`;
    }
  }

  function positionMagnifier(clientX, clientY) {
    if (!magnifierActive) return;
    const rect = viewport.getBoundingClientRect();
    const lensSize = magnifierEl.offsetWidth;
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    magnifierEl.style.left = `${localX - lensSize / 2}px`;
    magnifierEl.style.top = `${localY - lensSize / 2}px`;

    const { scale, x: panX, y: panY } = panZoom.getTransform();
    const stageX = (localX - panX) / scale;
    const stageY = (localY - panY) / scale;

    const bgW = img.clientWidth * MAGNIFIER_ZOOM;
    const bgH = img.clientHeight * MAGNIFIER_ZOOM;
    magnifierEl.style.backgroundSize = `${bgW}px ${bgH}px`;
    magnifierEl.style.backgroundPosition = `${-(stageX * MAGNIFIER_ZOOM - lensSize / 2)}px ${-(
      stageY * MAGNIFIER_ZOOM - lensSize / 2
    )}px`;
  }

  let magnifierPointerId = null;

  function onViewportPointerDown(e) {
    if (magnifierActive) {
      magnifierPointerId = e.pointerId;
      if (magnifierUsesLeft > 0) {
        positionMagnifier(e.clientX, e.clientY);
      }
    }
  }

  function onViewportPointerMove(e) {
    if (magnifierActive && e.pointerId === magnifierPointerId) {
      positionMagnifier(e.clientX, e.clientY);
    }
  }

  function onViewportPointerUp(e) {
    if (magnifierActive && e.pointerId === magnifierPointerId) {
      magnifierPointerId = null;
      if (magnifierUsesLeft > 0) {
        magnifierUsesLeft -= 1;
        updateMagBadge();
      }
    }
  }

  // ---------- Background tap = miss (only when not panning/pinching) ----------

  // A `click` on a hotspot button stops propagation before it reaches
  // here, so this only ever sees taps that missed every hotspot.
  let downPoint = null;
  function onStageTapDown(e) {
    downPoint = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onStageTapUp(e) {
    if (!downPoint) return;
    const moved = Math.hypot(e.clientX - downPoint.x, e.clientY - downPoint.y);
    const quick = Date.now() - downPoint.t < 400;
    if (moved < 8 && quick && !magnifierActive) {
      handleMiss(e.clientX, e.clientY);
    }
    downPoint = null;
  }

  // ---------- Setup ----------

  img.src = level.image;
  img.alt = `${level.title} — ${level.location}`;

  const panZoom = createPanZoom({
    viewport,
    stage,
    minScale: 1,
    maxScale: 4,
    onChange: resizeHotspots,
  });

  img.addEventListener('load', () => {
    buildHotspots();
    panZoom.reset();
  });
  if (img.complete) {
    buildHotspots();
  }

  updatePips();
  updateHintBadge();
  updateMagBadge();
  maybeShowContinue();

  if (level.magnifierUnlocked) {
    magnifierToggleBtn.hidden = false;
  }

  root.querySelector('[data-action="zoom-in"]').addEventListener('click', () => panZoom.zoomIn());
  root.querySelector('[data-action="zoom-out"]').addEventListener('click', () => panZoom.zoomOut());
  root.querySelector('[data-action="zoom-reset"]').addEventListener('click', () => panZoom.reset());
  magnifierToggleBtn.addEventListener('click', toggleMagnifier);
  hintBtn.addEventListener('click', useHint);
  continueBtn.addEventListener('click', () => opts.onFinishLevel());
  root.querySelector('[data-action="open-casefile"]').addEventListener('click', () => opts.onOpenCaseFile());

  viewport.addEventListener('pointerdown', onStageTapDown);
  viewport.addEventListener('pointerdown', onViewportPointerDown);
  viewport.addEventListener('pointermove', onViewportPointerMove);
  viewport.addEventListener('pointerup', onViewportPointerUp);
  viewport.addEventListener('click', onStageTapUp);

  window.addEventListener('resize', resizeHotspots);

  function autoRevealRemaining() {
    // "Good enough" threshold already met — reveal the rest so nothing is
    // permanently missable, without extra taps required.
    clueData.clues
      .filter((c) => c.type === 'real' && !foundAll.has(c.id))
      .forEach((c) => opts.onClueFound({ ...c, autoRevealed: true }));
  }

  function destroy() {
    panZoom.destroy();
    window.removeEventListener('resize', resizeHotspots);
    clearTimeout(toastTimer);
    clearTimeout(hintTimer);
  }

  return { destroy, autoRevealRemaining, getFoundRealCount: () => foundReal.size };
}
