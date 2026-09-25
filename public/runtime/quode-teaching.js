import { mountPercentageCannon } from './percentage-cannon.js';
import { mountConversionTeaching } from './conversion-teaching.js';
import { mountAreaTeaching } from './rectangle-area-teaching.js';
import { mountAreaPaint } from './rectangle-area-paint.js';

// Optional Quode-owned teaching modules leave mode/navigation ownership here.
export function mountQuodeTeaching(question, search) {
  if (question.teaching?.kind === 'percentage-cannon') return mountPercentageCannon(question, search);
  if (question.teaching?.kind === 'rectangle-area') {
    return question.teaching.task === 'area' ? mountAreaPaint(question, search) : mountAreaTeaching(question, search);
  }
  if (question.teaching?.module !== 'teaching.js') return mountConversionTeaching(question,search);
  const id = question.portableQuestion?.quode;
  if (!/^[a-z][a-z0-9_-]+$/.test(id || '')) throw new Error('Invalid teaching module owner');
  const element = document.createElement('div'); element.className = 'paper-teaching';
  let instance, view, help = false, destroyed = false;
  element.setAttribute('aria-busy','true');
  const ready = import(new URL(`../${encodeURIComponent(id)}/web/teaching.js`, import.meta.url).href).then(module => {
    if (destroyed) return;
    instance = module.mountTeaching(question,element);
    if (view) instance.setView(view);
    if (help) instance.startHelp?.();
  }).catch(() => {
    if (destroyed) return;
    element.replaceChildren();
    const message = document.createElement('p'); message.textContent = 'Help could not load. Close it and try again.';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'paper-button'; close.textContent = 'Back to question';
    close.addEventListener('click', () => element.dispatchEvent(new CustomEvent('teaching-close',{bubbles:true})));
    element.append(message,close);
  }).finally(() => element.removeAttribute('aria-busy'));
  return {element,ready,
    setView(next) { view = next; element.dataset.view = next; instance?.setView(next); },
    startHelp() { help = true; if (question.teaching?.helpPresentation !== 'inline' && !question.teaching?.graph) element.dataset.guidedHelp = 'true'; instance?.startHelp?.(); },
    pause() { help = false; instance?.pause?.(); },
    closeHelp() { return instance?.closeHelp?.(); },
    destroy() { destroyed = true; instance?.destroy?.(); }
  };
}
