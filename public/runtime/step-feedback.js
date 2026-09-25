// Match Question 1's approved landing: right aligned, above the footer strip.
export function positionResultIcon(badge) {
  const footer = document.querySelector('.paper-footer:not([hidden])');
  const box = footer?.getBoundingClientRect();
  badge.style.right = 'max(16px, env(safe-area-inset-right))';
  badge.style.bottom = box?.height
    ? `${innerHeight - box.top + (matchMedia('(max-width:650px)').matches ? 18 : 12)}px`
    : 'max(16px, env(safe-area-inset-bottom))';
}

// Shared feedback for checked teaching steps; independent of full-answer flowers.
export function createStepFeedback({className = '', anchorToFooter = true, getAnchor} = {}) {
  let badge, timer, finish, stripResize;
  const stripSelector = '.conversion-controls, .area-readiness-strip';
  function position() {
    if (!badge) return;
    // Main-answer icons keep their approved footer position. Only help feedback
    // follows the active mobile controls while its readiness card grows.
    positionResultIcon(badge);
    const anchor = getAnchor?.();
    if (anchor?.isConnected) {
      const box = anchor.getBoundingClientRect();
      badge.style.bottom = `${innerHeight - box.top + 18}px`;
      return;
    }
    if (!matchMedia('(max-width:650px)').matches) return;
    let top = innerHeight;
    document.querySelectorAll(stripSelector).forEach(strip => {
      const style = getComputedStyle(strip), box = strip.getBoundingClientRect();
      if (style.position === 'fixed' && style.visibility !== 'hidden' &&
          box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight + 1) {
        top = Math.min(top, box.top);
      }
    });
    if (top < innerHeight) badge.style.bottom = `${innerHeight - top + 18}px`;
  }
  function cancel() {
    window.removeEventListener('resize', position);
    stripResize?.disconnect(); stripResize = undefined;
    clearTimeout(timer);
    badge?.remove(); badge = undefined;
    finish?.(); finish = undefined;
  }
  function show(correct, {onLanded, persist = false, holdMs = 3000} = {}) {
    cancel();
    badge = document.createElement('div');
    badge.className = 'paper-step-feedback';
    if (className) badge.classList.add(className);
    badge.dataset.correct = String(correct);
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', correct ? 'Correct' : 'Incorrect');
    const mark = document.createElement('span');
    mark.className = 'paper-step-feedback-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${correct ? 'm5 12 4 4L19 6' : 'm6 6 12 12M18 6 6 18'}"/></svg>`;
    badge.append(mark);
    document.body.append(badge);
    position();
    window.addEventListener('resize', position);
    stripResize = new ResizeObserver(position);
    document.querySelectorAll(`${stripSelector}, .paper-footer`).forEach(strip => stripResize.observe(strip));
    const anchor = getAnchor?.();
    if (anchor?.isConnected) stripResize.observe(anchor);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const currentBadge = badge;
    Promise.all(badge.getAnimations().map(animation => animation.finished)).then(() => {
      if (badge === currentBadge) onLanded?.();
    }).catch(() => {}); // Cancelling a badge must not reveal its completion dialog.
    const result = new Promise(resolve => { finish = resolve; });
    // Use the same fall as the main answer tick, then hold for the requested duration.
    if (!persist) {
      timer = setTimeout(() => {
        badge.classList.add('paper-step-feedback-fading');
        timer = setTimeout(cancel, 300);
      }, (reduced ? 0 : 2400) + holdMs);
    }
    return result;
  }
  return {show, cancel, destroy:cancel};
}
