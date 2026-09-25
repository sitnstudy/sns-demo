// Visuals adapted from CMATS src/components/RotatePrompt.tsx.
// Each Quode declares its preference independently; future Quodes may use landscape.
export const orientationPreferences = {
  'arithmetic-percentage_of_quantity': {orientation:'landscape', name:'Percentage Cannon'},
  'measurement-unit_conversion': {orientation:'portrait', name:'Measurement unit conversion'},
  'statistics-frequency_tables': {orientation:'portrait', name:'Statistics frequency tables'},
  'algebra-two_step_equations': {orientation:'portrait', name:'Two-step equations'},
  'algebra-substitution_equations': {orientation:'portrait', name:'Substitution equations'},
  'algebra-axis_intercepts': {orientation:'portrait', name:'Axis intercepts'},
  'geometry-rectangle_area': {orientation:'portrait', name:'Rectangle and square area'},
};

export function mountOrientationPrompt(app, onDismiss) {
  const touch = matchMedia('(hover: none) and (pointer: coarse)');
  const portrait = matchMedia('(orientation: portrait)');
  const overlay = document.createElement('section');
  overlay.className = 'quode-rotate-prompt';
  overlay.hidden = true;
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Rotate your device');
  overlay.innerHTML = `<button class="quode-rotate-close" type="button" aria-label="Close help"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6L18 18M18 6L6 18"/></svg></button><div class="quode-rotate-phone" aria-hidden="true"><svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="35" y="10" width="50" height="80" rx="8" fill="#1e3a6e" stroke="#4a9eff" stroke-width="3"/>
    <rect x="41" y="22" width="38" height="55" rx="3" fill="#0d1b35"/>
    <rect x="50" y="83" width="20" height="3" rx="1.5" fill="#4a9eff"/>
    <path d="M 20 100 A 45 45 0 0 1 100 100" stroke="#4a9eff" stroke-width="4" stroke-linecap="round" fill="none" stroke-dasharray="8 4"/>
    <polyline points="93,92 100,100 92,107" stroke="#4a9eff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg></div><div class="quode-rotate-copy"><p class="quode-rotate-heading">Rotate your device</p><p class="quode-rotate-subtext"></p></div>`;
  const closeButton = overlay.querySelector('.quode-rotate-close');
  document.body.append(overlay);
  let preference, restoreFocus, originalInert;
  let viewportFrame;
  const settleViewport = () => {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      // iOS Home Screen apps can retain the portrait safe-area overscroll
      // after rotating a scroll-locked help panel. Its fixed controls are
      // then painted below their physical touch targets (47px on iPhone 13).
      // Only clear negative overscroll; preserve normal page/panel scrolling.
      if (touch.matches && preference && window.scrollY < 0) {
        window.scrollTo({left:window.scrollX, top:0, behavior:'instant'});
      }
    });
  };
  const update = () => {
    const visible = touch.matches && preference && (portrait.matches ? 'portrait' : 'landscape') !== preference.orientation;
    if (visible) {
      overlay.querySelector('.quode-rotate-subtext').textContent = `${preference.name} works best in ${preference.orientation} mode`;
      overlay.dataset.orientation = preference.orientation;
      if (overlay.hidden) {
        restoreFocus = document.activeElement;
        originalInert = app.inert;
        app.inert = true;
        overlay.hidden = false;
        document.documentElement.classList.add('quode-rotation-required');
        closeButton.focus({preventScroll:true});
      }
    } else if (!overlay.hidden) {
      overlay.hidden = true;
      app.inert = originalInert;
      document.documentElement.classList.remove('quode-rotation-required');
      if (restoreFocus?.isConnected) restoreFocus.focus({preventScroll:true});
    }
    settleViewport();
  };
  closeButton.addEventListener('click', () => {
    preference = null;
    update();
    onDismiss?.();
  });
  const listen = (query, handler) => {
    if (query.addEventListener) query.addEventListener('change', handler);
    else query.addListener(handler);
  };
  const unlisten = (query, handler) => {
    if (query.removeEventListener) query.removeEventListener('change', handler);
    else query.removeListener(handler);
  };
  listen(touch, update);
  listen(portrait, update);
  window.addEventListener('resize', settleViewport);
  window.visualViewport?.addEventListener('resize', settleViewport);
  window.visualViewport?.addEventListener('scroll', settleViewport);
  return {
    setQuestion(question) {
      const declared = question?.teaching?.mobileOrientation;
      const fallback = orientationPreferences[question?.portableQuestion?.quode];
      preference = typeof declared === 'string'
        ? {orientation:declared, name:fallback?.name || 'This activity'}
        : declared || fallback;
      if (!['portrait','landscape'].includes(preference?.orientation)) preference = null;
      update();
    },
    destroy() {
      preference = null; update();
      unlisten(touch, update);
      unlisten(portrait, update);
      cancelAnimationFrame(viewportFrame);
      window.removeEventListener('resize', settleViewport);
      window.visualViewport?.removeEventListener('resize', settleViewport);
      window.visualViewport?.removeEventListener('scroll', settleViewport);
      overlay.remove();
    },
  };
}
