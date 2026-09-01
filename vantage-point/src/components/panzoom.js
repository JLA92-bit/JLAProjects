/**
 * Minimal custom pinch-zoom + pan for a single transformed element inside a
 * fixed-size viewport. Deliberately hand-rolled (no library) so it plays
 * nicely with native touch handling being disabled at the page level.
 */
export function createPanZoom({ viewport, stage, minScale = 1, maxScale = 4, onChange }) {
  let scale = minScale;
  let x = 0;
  let y = 0;

  let pointers = new Map();
  let startDist = 0;
  let startScale = 1;
  let startMid = { x: 0, y: 0 };
  let startPan = { x: 0, y: 0 };
  let dragging = false;
  let lastTap = 0;

  function apply() {
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    if (onChange) onChange({ scale, x, y });
  }

  function clamp() {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const sw = stage.offsetWidth * scale;
    const sh = stage.offsetHeight * scale;

    scale = Math.min(maxScale, Math.max(minScale, scale));

    const minX = Math.min(0, vw - sw);
    const minY = Math.min(0, vh - sh);
    x = Math.min(0, Math.max(minX, x));
    y = Math.min(0, Math.max(minY, y));

    // Center if the scaled stage is smaller than the viewport on an axis.
    if (sw <= vw) x = (vw - sw) / 2;
    if (sh <= vh) y = (vh - sh) / 2;
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function pointFromEvent(e) {
    const rect = viewport.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    // Don't capture the pointer for a tap that starts on a hotspot: Chromium
    // retargets the pointerup *and* the synthesized click to the capturing
    // element, which would silently swallow the tap-to-find click handler
    // on the hotspot button. Single-finger drags that merely pass over a
    // hotspot mid-gesture are unaffected since capture is per-pointer-id.
    if (e.target && e.target.closest && e.target.closest('.hotspot')) return;

    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pointFromEvent(e));

    if (pointers.size === 1) {
      dragging = true;
      startPan = { x, y };
      startMid = pointFromEvent(e);

      const now = Date.now();
      if (now - lastTap < 300) {
        toggleDoubleTapZoom(pointFromEvent(e));
      }
      lastTap = now;
    } else if (pointers.size === 2) {
      dragging = false;
      const pts = [...pointers.values()];
      startDist = dist(pts[0], pts[1]);
      startScale = scale;
      startMid = midpoint(pts[0], pts[1]);
      startPan = { x, y };
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, pointFromEvent(e));

    if (pointers.size === 1 && dragging) {
      const p = pointers.get(e.pointerId);
      x = startPan.x + (p.x - startMid.x);
      y = startPan.y + (p.y - startMid.y);
      clamp();
      apply();
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const d = dist(pts[0], pts[1]);
      const mid = midpoint(pts[0], pts[1]);
      const nextScale = Math.min(maxScale, Math.max(minScale, startScale * (d / startDist || 1)));

      // Keep the pinch midpoint stationary on-screen while scaling.
      const scaleRatio = nextScale / startScale;
      x = mid.x - ((startMid.x - startPan.x) * scaleRatio);
      y = mid.y - ((startMid.y - startPan.y) * scaleRatio);
      scale = nextScale;
      clamp();
      apply();
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      startDist = 0;
    }
    if (pointers.size === 1) {
      const [remaining] = pointers.values();
      startPan = { x, y };
      startMid = remaining;
      dragging = true;
    }
    if (pointers.size === 0) {
      dragging = false;
    }
  }

  function toggleDoubleTapZoom(focal) {
    if (scale > minScale + 0.05) {
      reset();
    } else {
      const nextScale = Math.min(maxScale, minScale * 2.2);
      const ratio = nextScale / scale;
      x = focal.x - (focal.x - x) * ratio;
      y = focal.y - (focal.y - y) * ratio;
      scale = nextScale;
      clamp();
      apply();
    }
  }

  function reset() {
    scale = minScale;
    x = 0;
    y = 0;
    clamp();
    apply();
  }

  function setMinScale(next) {
    minScale = next;
  }

  function getTransform() {
    return { scale, x, y };
  }

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerUp);
  viewport.addEventListener('pointerleave', onPointerUp);

  // Wheel support for desktop testing.
  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const focal = pointFromEvent(e);
      const delta = e.deltaY < 0 ? 1.1 : 0.9;
      const nextScale = Math.min(maxScale, Math.max(minScale, scale * delta));
      const ratio = nextScale / scale;
      x = focal.x - (focal.x - x) * ratio;
      y = focal.y - (focal.y - y) * ratio;
      scale = nextScale;
      clamp();
      apply();
    },
    { passive: false }
  );

  function destroy() {
    viewport.removeEventListener('pointerdown', onPointerDown);
    viewport.removeEventListener('pointermove', onPointerMove);
    viewport.removeEventListener('pointerup', onPointerUp);
    viewport.removeEventListener('pointercancel', onPointerUp);
    viewport.removeEventListener('pointerleave', onPointerUp);
  }

  reset();

  return { reset, zoomIn: () => stepZoom(1.35), zoomOut: () => stepZoom(1 / 1.35), setMinScale, getTransform, destroy };

  function stepZoom(factor) {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const focal = { x: vw / 2, y: vh / 2 };
    const nextScale = Math.min(maxScale, Math.max(minScale, scale * factor));
    const ratio = nextScale / scale;
    x = focal.x - (focal.x - x) * ratio;
    y = focal.y - (focal.y - y) * ratio;
    scale = nextScale;
    clamp();
    apply();
  }
}
