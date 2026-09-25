// Shared by the practice and questionnaire players. Scope excludes answer choices.
const selector = '.paper-heading button, .topbar button, .print-toolbar button';
const descriptions = {
  'Print paper': 'Open the print dialog to print this paper or save it as a PDF.',
  'Grid layout': 'Arrange questions side by side in a grid.',
  'List layout': 'Show all questions in a vertical list.',
  'Stacked layout': 'Stack all questions vertically for scrolling.',
  'One question at a time': 'Show one question at a time and use the arrows to move between questions.',
  'Switch to multiple-choice answers': 'Choose answers from a list of options instead of typing them.',
  'Switch to typed answers': 'Enter answers yourself instead of choosing from a list.',
  'Home': 'Finish and clear this exercise, then return to setup.',
  'Back to setup': 'Return to the exercise setup screen.',
  'Print or save as PDF': 'Open the print dialog to print these pages or save them as a PDF.',
};
const style = document.createElement('style');
style.textContent = `
  .toolbar-tooltip { position:fixed; z-index:10000; box-sizing:border-box;
    width:max-content; max-width:min(280px, calc(100vw - 24px)); margin:0;
    padding:9px 12px; border:1px solid #ffffff20; border-radius:8px;
    background:#202936; color:#fff; font:500 13px/1.45 system-ui,sans-serif;
    text-align:left; box-shadow:0 4px 16px #0003; overflow-wrap:break-word;
    pointer-events:auto; }
  .toolbar-tooltip[hidden] { display:none; }
  @media print { .toolbar-tooltip { display:none!important; } }
`;
document.head.append(style);
const tip = document.createElement('div');
tip.id = 'quode-toolbar-tooltip';
tip.className = 'toolbar-tooltip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.append(tip);
let active, timer, hideTimer;
function description(button) {
  if (button.dataset.toolbarTooltip) return button.dataset.toolbarTooltip;
  const label = button.getAttribute('aria-label') || button.dataset.originalToolbarTitle || button.textContent.trim();
  if (button.matches('.paper-difficulty-step')) {
    const steps = [...button.closest('.paper-difficulty-track').querySelectorAll('.paper-difficulty-step')];
    const current = steps.findIndex(step => step.getAttribute('aria-current') === 'step');
    const target = steps.indexOf(button);
    if (target === current) return '';
    return target > current ? 'Increase the difficulty level' : 'Decrease the difficulty level';
  }
  return descriptions[label] || label;
}
function hide() {
  clearTimeout(timer); clearTimeout(hideTimer);
  if (active) {
    const ids = (active.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id);
    if (ids.length) active.setAttribute('aria-describedby', ids.join(' '));
    else active.removeAttribute('aria-describedby');
  }
  active = null; tip.hidden = true;
}
function position() {
  const rect = active.getBoundingClientRect();
  const box = tip.getBoundingClientRect();
  tip.style.left = `${Math.max(12, Math.min(rect.left + (rect.width - box.width) / 2, innerWidth - box.width - 12))}px`;
  tip.style.top = `${Math.max(12, rect.bottom + box.height + 10 <= innerHeight - 12 ? rect.bottom + 10 : rect.top - box.height - 10)}px`;
}
function show(button, delay) {
  clearTimeout(hideTimer);
  if (active === button) return;
  hide(); active = button;
  timer = setTimeout(() => {
    if (!button.isConnected || !button.getClientRects().length) return hide();
    tip.textContent = description(button);
    if (!tip.textContent) return hide();
    const ids = new Set((button.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    ids.add(tip.id); button.setAttribute('aria-describedby', [...ids].join(' '));
    tip.hidden = false; position();
  }, delay);
}
function leave() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (active === document.activeElement || active?.matches(':hover') || tip.matches(':hover')) return;
    hide();
  }, 150);
}
document.addEventListener('pointerover', event => {
  if (event.pointerType === 'touch') return;
  const button = event.target.closest?.(selector);
  if (button) show(button, 350);
});
document.addEventListener('pointerout', event => {
  if (event.target.closest?.(selector)) leave();
});
document.addEventListener('focusin', event => {
  if (event.target.matches?.(selector)) show(event.target, 0);
});
document.addEventListener('focusout', leave);
tip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
tip.addEventListener('pointerleave', leave);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
document.addEventListener('pointerdown', hide, true);
document.addEventListener('click', hide, true);
window.addEventListener('scroll', hide, true);
window.addEventListener('resize', hide);
// Existing players set titles as their state changes. Remove native tooltips
// only in toolbars and retain the title as a fallback for unnamed controls.
function refresh() {
  document.querySelectorAll(selector).forEach(button => {
    if (button.hasAttribute('title')) {
      button.dataset.originalToolbarTitle = button.title;
      button.removeAttribute('title');
    }
  });
  if (active) {
    if (!active.isConnected || !active.matches(selector) || !active.getClientRects().length) hide();
    else if (!tip.hidden) {
      const text = description(active);
      if (tip.textContent !== text) tip.textContent = text;
      position();
    }
  }
}
new MutationObserver(refresh).observe(document.body, {
  subtree:true, childList:true, attributes:true,
  attributeFilter:['title', 'aria-label', 'aria-current', 'data-toolbar-tooltip', 'hidden'],
});
refresh();
