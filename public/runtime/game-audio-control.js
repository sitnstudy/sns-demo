// Dock desktop audio in the navigation strip, with an optional mobile toolbar home.
export function dockGameAudio(button, owner, {mobileToolbar = false} = {}) {
  const home = document.createComment('game audio control');
  button.before(home);
  const desktop = matchMedia('(min-width:651px)');
  let frame;
  const place = () => {
    frame = undefined;
    const footer = document.querySelector('.paper-footer:not([hidden])');
    const footerVisible = footer && getComputedStyle(footer).visibility !== 'hidden' && getComputedStyle(footer).display !== 'none';
    const destination = desktop.matches && footerVisible ? footer : mobileToolbar && document.querySelector('.paper-heading-with-layout');
    const visible = owner.isConnected && owner.getClientRects().length &&
      !owner.closest('[hidden]') && (!owner.dataset.view || owner.dataset.view === 'stepwise');
    if (destination && visible && !button.hidden) {
      if (button.parentNode !== destination) destination.append(button);
    } else if (home.parentNode && button.previousSibling !== home) home.after(button);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };
  // Owners can be mounted after construction or hidden when navigating questions.
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['hidden','data-view']});
  if (desktop.addEventListener) desktop.addEventListener('change', schedule);
  else desktop.addListener(schedule);
  window.addEventListener('resize', schedule);
  schedule();
  return () => {
    window.removeEventListener('resize', schedule);
    observer.disconnect();
    if (desktop.removeEventListener) desktop.removeEventListener('change', schedule);
    else desktop.removeListener(schedule);
    cancelAnimationFrame(frame);button.remove();home.remove();
  };
}
