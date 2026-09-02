/**
 * Renders the corkboard of every real clue found so far (across all
 * levels). Noise/dead-end taps are intentionally not pinned here — the
 * case file is the player's evidence board, not a tap log.
 */
export function renderCaseFile(root, { levels, cluesByLevel, foundClueIdsByLevel }) {
  const board = root.querySelector('[data-role="corkboard"]');
  board.innerHTML = '';

  levels.forEach((level) => {
    const clueData = cluesByLevel[level.id];
    const found = foundClueIdsByLevel[level.id] || new Set();
    if (!clueData) return;

    clueData.clues
      .filter((c) => c.type === 'real' && found.has(c.id))
      .forEach((clue) => {
        const card = document.createElement('article');
        card.className = 'pin-card';
        card.style.setProperty('--tilt', `${(Math.random() * 4 - 2).toFixed(2)}deg`);
        card.innerHTML = `
          <img class="pc-pin" src="src/brand/pin.svg" alt="" aria-hidden="true" />
          <p class="pc-day">${level.day} — ${level.title}</p>
          <p class="pc-title">${clue.title}</p>
          <p class="pc-flavor">${clue.flavor}</p>
        `;
        board.appendChild(card);
      });
  });

  if (!board.children.length) {
    const empty = document.createElement('p');
    empty.className = 'pc-flavor';
    empty.style.gridColumn = '1 / -1';
    empty.style.opacity = '0.7';
    empty.textContent = 'Nothing pinned yet. Get back out there.';
    board.appendChild(empty);
  }
}
