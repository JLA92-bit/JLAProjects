/**
 * PC.UI - shared visual "juice": particle bursts, toasts, screen shake,
 * modals, and a star-rating renderer. Used by the hub and every game.
 */
(function (global) {
  let particleLayer = null;

  function getParticleLayer() {
    if (particleLayer && document.body.contains(particleLayer)) return particleLayer;
    particleLayer = document.createElement('canvas');
    particleLayer.id = 'pc-particle-layer';
    document.body.appendChild(particleLayer);
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return particleLayer;
  }

  function resizeCanvas() {
    if (!particleLayer) return;
    particleLayer.width = window.innerWidth * devicePixelRatio;
    particleLayer.height = window.innerHeight * devicePixelRatio;
    particleLayer.style.width = window.innerWidth + 'px';
    particleLayer.style.height = window.innerHeight + 'px';
  }

  const COLORS = ['#ff4d8d', '#ff9f43', '#ffd93d', '#23d18b', '#17c3b2', '#3f8efc', '#a259ff'];

  let particles = [];
  let rafId = null;

  function burst(x, y, opts = {}) {
    const canvas = getParticleLayer();
    const ctx = canvas.getContext('2d');
    const count = opts.count || 26;
    const dpr = devicePixelRatio;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 2 + Math.random() * 5;
      particles.push({
        x: x * dpr, y: y * dpr,
        vx: Math.cos(angle) * speed * dpr,
        vy: Math.sin(angle) * speed * dpr,
        life: 1,
        decay: 0.012 + Math.random() * 0.012,
        size: (3 + Math.random() * 4) * dpr,
        color: opts.color || COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() < 0.5 ? 'circle' : 'square',
        rot: Math.random() * Math.PI,
      });
    }
    if (!rafId) tick(ctx, canvas);
  }

  function tick(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12 * devicePixelRatio;
      p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot + p.life * 3);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    });
    particles = particles.filter((p) => p.life > 0);
    if (particles.length) {
      rafId = requestAnimationFrame(() => tick(ctx, canvas));
    } else {
      rafId = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function burstFromElement(el, opts) {
    const rect = el.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top + rect.height / 2, opts);
  }

  function shake(el = document.body) {
    el.classList.remove('pc-shake');
    // force reflow so the animation can re-trigger
    void el.offsetWidth;
    el.classList.add('pc-shake');
    setTimeout(() => el.classList.remove('pc-shake'), 420);
  }

  function toast(message, opts = {}) {
    const el = document.createElement('div');
    el.className = 'pc-toast';
    el.textContent = message;
    if (opts.color) el.style.background = opts.color;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => el.remove(), 320);
    }, opts.duration || 1600);
  }

  function starsMarkup(count, max = 3, animate = false) {
    let html = `<span class="pc-stars${animate ? ' pc-stars--pop' : ''}">`;
    for (let i = 0; i < max; i++) {
      html += `<span class="pc-star${i < count ? ' is-lit' : ''}">${i < count ? '★' : '★'}</span>`;
    }
    html += '</span>';
    return html;
  }

  function modal({ title, bodyHtml, buttons }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'pc-modal-backdrop';
    const box = document.createElement('div');
    box.className = 'pc-modal pc-panel';
    box.innerHTML = `<h2 style="margin-bottom:12px;font-size:1.6rem;color:var(--pc-purple)">${title}</h2>
      <div class="pc-modal-body">${bodyHtml || ''}</div>
      <div class="pc-modal-actions" style="margin-top:20px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"></div>`;
    backdrop.appendChild(box);
    const actions = box.querySelector('.pc-modal-actions');
    (buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = `pc-btn ${b.className || ''}`;
      btn.innerHTML = b.label;
      btn.onclick = () => {
        if (b.onClick) b.onClick();
        if (b.close !== false) close();
      };
      actions.appendChild(btn);
    });
    document.body.appendChild(backdrop);
    function close() { backdrop.remove(); }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && buttons === undefined) close();
    });
    return { close, el: backdrop };
  }

  function formatTime(ms) {
    if (ms === null || ms === undefined) return '--:--';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  global.PC = global.PC || {};
  global.PC.UI = { burst, burstFromElement, shake, toast, starsMarkup, modal, formatTime };
})(window);
