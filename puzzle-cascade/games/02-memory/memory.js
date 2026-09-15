/**
 * Game 2 - Memory Match. Flip cards, find every pair.
 * Difficulty controls the grid size (pair count).
 */
(function () {
  const CONFIG = {
    easy: { pairs: 6, cols: 4 },
    medium: { pairs: 8, cols: 4 },
    hard: { pairs: 12, cols: 6 },
  };

  const ICON_POOL = [
    '🍎', '🍌', '🍇', '🍉', '🍓', '🍑',
    '🍍', '🥝', '🍒', '🫐', '🍐', '🍬',
    '🍩', '🍭', '🍪', '🥭', '🍮', '🍡',
  ];

  function starsForAttempts(pairs, attempts) {
    const perfect = pairs;
    const good = Math.round(pairs * 1.6);
    if (attempts <= good) return attempts <= perfect + 1 ? 3 : (attempts <= good ? 2 : 1);
    return 1;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function mount(container, difficulty, api) {
    const cfg = CONFIG[difficulty];
    const icons = shuffle(ICON_POOL).slice(0, cfg.pairs);
    let deck = shuffle(icons.concat(icons)).map((icon, i) => ({ id: i, icon, flipped: false, matched: false }));

    let attempts = 0;
    let matchedPairs = 0;
    let lock = false;
    let firstPick = null;

    const wrap = document.createElement('div');
    wrap.className = 'pc-stage-inner';
    wrap.innerHTML = `
      <div class="mm-meta"><span>Attempts: <span id="mm-attempts">0</span></span><span>Pairs: <span id="mm-pairs">0</span>/${cfg.pairs}</span></div>
      <div class="mm-board" id="mm-board" style="grid-template-columns:repeat(${cfg.cols}, minmax(44px, 84px));max-width:${cfg.cols * 90}px;"></div>
    `;
    container.appendChild(wrap);
    const boardEl = wrap.querySelector('#mm-board');
    const attemptsEl = wrap.querySelector('#mm-attempts');
    const pairsEl = wrap.querySelector('#mm-pairs');

    function render() {
      boardEl.innerHTML = '';
      deck.forEach((card) => {
        const el = document.createElement('div');
        el.className = 'mm-card' + (card.flipped ? ' is-flipped' : '') + (card.matched ? ' is-matched' : '');
        el.innerHTML = `
          <div class="mm-card-inner">
            <div class="mm-face mm-face--back"></div>
            <div class="mm-face mm-face--front">${card.icon}</div>
          </div>`;
        el.addEventListener('click', () => onPick(card.id, el));
        boardEl.appendChild(el);
      });
    }

    function onPick(id, el) {
      if (lock) return;
      const card = deck.find((c) => c.id === id);
      if (!card || card.flipped || card.matched) return;
      card.flipped = true;
      api.sound.select();
      el.classList.add('is-flipped');

      if (!firstPick) {
        firstPick = card;
        return;
      }

      attempts++;
      attemptsEl.textContent = attempts;
      lock = true;

      if (firstPick.icon === card.icon) {
        firstPick.matched = true;
        card.matched = true;
        matchedPairs++;
        pairsEl.textContent = matchedPairs;
        api.sound.match();
        setTimeout(() => {
          [...boardEl.children].forEach((c, i) => { if (deck[i].id === card.id || deck[i].id === firstPick.id) c.classList.add('is-matched'); });
          api.ui.burstFromElement(el, { count: 16 });
          firstPick = null;
          lock = false;
          if (matchedPairs === cfg.pairs) {
            const stars = starsForAttempts(cfg.pairs, attempts);
            setTimeout(() => api.win(stars, { attempts }), 250);
          }
        }, 120);
      } else {
        api.sound.error();
        setTimeout(() => {
          card.flipped = false;
          firstPick.flipped = false;
          firstPick = null;
          lock = false;
          render();
        }, 750);
      }
    }

    render();
    return () => { wrap.remove(); };
  }

  PC.Games.register('memory', { mount });
})();
