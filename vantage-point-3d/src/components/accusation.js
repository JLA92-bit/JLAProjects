/**
 * Renders the final accusation screen. Choices are built from the case's
 * suspect/motive/evidence pools, filtered to what the player could
 * plausibly have learned (evidence choices only include items tied to a
 * clue the player actually found — suspects and motives come from the
 * fixed cast established in the briefing).
 */
export function renderAccusation(root, { caseData, foundEvidenceIds, onSubmit }) {
  const state = { suspectId: null, motiveId: null, evidenceId: null };

  const suspectWrap = root.querySelector('[data-role="suspect-choices"]');
  const motiveWrap = root.querySelector('[data-role="motive-choices"]');
  const evidenceWrap = root.querySelector('[data-role="evidence-choices"]');
  const submitBtn = root.querySelector('[data-action="submit-accusation"]');

  function makeChoice(wrap, key, id, label, sub) {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.type = 'button';
    btn.innerHTML = `${label}${sub ? `<span class="c-sub">${sub}</span>` : ''}`;
    btn.addEventListener('click', () => {
      state[key] = id;
      [...wrap.children].forEach((c) => c.classList.remove('selected'));
      btn.classList.add('selected');
      checkReady();
    });
    wrap.appendChild(btn);
  }

  caseData.suspects.forEach((s) => makeChoice(suspectWrap, 'suspectId', s.id, s.name, `${s.role} — ${s.blurb}`));
  caseData.motives.forEach((m) => makeChoice(motiveWrap, 'motiveId', m.id, m.label));

  const availableEvidence = caseData.evidence.filter((e) => foundEvidenceIds.has(e.id));
  if (availableEvidence.length === 0) {
    const note = document.createElement('p');
    note.className = 'c-sub';
    note.textContent = 'You never pinned down a single piece of hard evidence. Choose your best guess.';
    evidenceWrap.appendChild(note);
  } else {
    availableEvidence.forEach((e) => makeChoice(evidenceWrap, 'evidenceId', e.id, e.label));
  }
  // If no evidence was found at all, fall back to the full list so the
  // player can still submit an accusation rather than being soft-locked.
  if (availableEvidence.length === 0) {
    caseData.evidence.forEach((e) => makeChoice(evidenceWrap, 'evidenceId', e.id, e.label));
  }

  function checkReady() {
    const ready = state.suspectId && state.motiveId && state.evidenceId;
    submitBtn.disabled = !ready;
  }

  submitBtn.addEventListener('click', () => {
    if (!submitBtn.disabled) onSubmit(state);
  });

  return { getState: () => state };
}
