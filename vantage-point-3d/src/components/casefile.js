export function renderCaseFile(root, { level, clueData, foundClueIds }) {
  const board = root.querySelector('[data-role="corkboard"]');
  board.innerHTML = '';
  const found = new Set(foundClueIds);

  clueData.clues
    .filter((c) => c.type === 'real' && found.has(c.id))
    .forEach((clue) => {
      const card = document.createElement('article');
      card.className = 'pin-card';
      card.style.setProperty('--tilt', `${(Math.random() * 4 - 2).toFixed(2)}deg`);
      card.innerHTML = `
        <img class="pc-pin" src="../vantage-point/src/brand/pin.svg" alt="" aria-hidden="true" />
        <p class="pc-day">${level.day} — ${level.title}</p>
        <p class="pc-title">${clue.title}</p>
        <p class="pc-flavor">${clue.flavor}</p>
      `;
      board.appendChild(card);
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
