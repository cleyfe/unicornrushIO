/**
 * "How to play": the rules in a full-screen panel over the game. Loaded on first
 * use, so the rules don't weigh on the game's start-up.
 */
export async function openDocs(): Promise<void> {
  if (document.querySelector('.docs-overlay')) return;
  const { renderDocs } = await import('../../docs/content');
  const panel = document.createElement('div');
  panel.className = 'docs-overlay';
  document.body.append(panel);
  renderDocs(panel, () => panel.remove());
}
