import { MathfieldElement } from "/runtime/mathlive/mathlive.min.mjs";

MathfieldElement.fontsDirectory = "/runtime/katex/fonts";
MathfieldElement.soundsDirectory = null;
MathfieldElement.keypressSound = null;
MathfieldElement.plonkSound = null;
// MathLive opens an audio context before checking its disabled sound settings.
// Keep editing usable on browsers without Web Audio.
if (!(window.AudioContext || window.webkitAudioContext)) MathfieldElement.playSound = () => {};

const style = document.createElement("style");
style.textContent = `
  .compact-math-keypad { position:fixed; z-index:2147483646; box-sizing:border-box;
    width:300px; max-width:calc(100vw - 16px); padding:10px; border:1px solid #b9c2cb;
    border-radius:10px; background:#fff; box-shadow:0 6px 22px #0002; }
  .compact-keypad-layout { display:grid; grid-template-columns:3fr 2fr; gap:10px; align-items:start; }
  .compact-math-keypad.digits-only { width:183px; }
  .compact-math-keypad.compact-keypad-wide { width:560px; }
  .compact-math-keypad.compact-keypad-wide .compact-keypad-layout {
    display:grid; grid-template-columns:repeat(var(--keypad-wide-columns,10),minmax(0,1fr)); gap:6px;
  }
  .compact-keypad-wide .compact-keypad-digits,
  .compact-keypad-wide .compact-keypad-controls,
  .compact-keypad-wide .compact-keypad-symbols { display:contents; }
  .compact-keypad-wide .compact-math-key { order:var(--keypad-wide-order,20); }
  .compact-math-keypad.digits-only:not(.compact-keypad-wide) .compact-keypad-layout { grid-template-columns:minmax(0,1fr); }
  .compact-math-keypad.digits-only .compact-keypad-controls { display:none; }
  .compact-keypad-digits { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
  .compact-keypad-controls,.compact-keypad-symbols {
    display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .compact-keypad-controls { grid-template-columns:minmax(0,1fr); }
  .compact-keypad-symbols:empty { display:none; }
  .compact-math-key { min-width:44px; min-height:48px; border:1px solid #cad1d8;
    border-radius:6px; background:#f7f9fb; color:#17212b; font:20px/1.1 system-ui,sans-serif;
    padding:6px; cursor:pointer; touch-action:manipulation; }
  .compact-math-key:hover { background:#eaf2fa; }
  .compact-math-key:active { background:#cbdff2; }
  .compact-math-key:focus-visible { outline:2px solid #0277bd; outline-offset:1px; }
  .compact-math-key.action { font-size:14px; }
  .compact-math-key.variable { font-family:Georgia,serif; font-style:italic; }
  .mathlive-answer-field::part(virtual-keyboard-toggle),
  .mathlive-answer-field::part(menu-toggle),
  .cube-root-input-button,.fraction-input-button,.mathlive-variable-controls { display:none!important; }
  .answer-entry-row .mathlive-answer-field { box-sizing:border-box; height:auto!important;
    min-height:64px; max-height:none!important; max-width:100%; min-width:0; padding:12px!important; }
  .answer-entry-row:has(.mathlive-answer-field) { height:auto!important; max-height:none!important; }
  .compact-math-keypad { overflow-y:auto; overscroll-behavior:contain; }
  .compact-math-keypad.compact-math-keypad-inline { position:static; align-self:flex-start;
    overflow:visible; max-height:none; margin:0; box-shadow:0 3px 14px #0002; }
  .compact-fraction-icon { display:inline-flex; flex-direction:column; align-items:center; gap:3px; vertical-align:middle; }
  .compact-fraction-icon span { width:12px; height:10px; border:1px solid currentColor; border-radius:1px; }
  .compact-fraction-icon::after { content:""; width:20px; height:1px; background:currentColor; order:1; }
  .compact-fraction-icon span:last-child { order:2; }
  .mathlive-answer-field[data-keyboard-active="true"] { outline:2px solid #e65100; outline-offset:1px; }
  @media print { .compact-keypad-spacer,.compact-math-keypad { display:none!important; } }
`;
document.head.append(style);

let activeEditor;
let pressedKey;
// A keypad can appear or move while a textbox gesture is finishing. Only a
// gesture that started on a key may activate that key via a pointer click.
document.addEventListener('pointerdown', event => {
  pressedKey = event.composedPath().find(node => node.classList?.contains('compact-math-key'));
}, true);
document.addEventListener('pointercancel', () => { pressedKey = undefined; }, true);
function demoMode() { return document.body.classList.contains("quode-demo-active"); }
function positionKeypad() { activeEditor?.position(); }
window.addEventListener("resize", () => activeEditor?.position(true));
window.addEventListener("scroll", positionKeypad, true);
window.visualViewport?.addEventListener("resize", () => activeEditor?.position(true));
window.visualViewport?.addEventListener("scroll", positionKeypad);
document.addEventListener("click", event => {
  if (!activeEditor) return;
  const path = event.composedPath();
  if (!path.includes(activeEditor.element) && !path.includes(activeEditor.keypad)) activeEditor.close();
}, true);
document.addEventListener("keyup", event => {
  if (event.key !== "Tab" || !activeEditor) return;
  const path = event.composedPath();
  if (!path.includes(activeEditor.element) && !path.includes(activeEditor.keypad)) activeEditor.close();
});
// A guided-step render can remove the focused editor without firing blur.
new MutationObserver(() => {
  if (activeEditor && !activeEditor.element.isConnected) activeEditor.close();
}).observe(document.body, { childList:true, subtree:true });

export function keypadSymbols(expected) {
  const source = String(expected || "");
  const plain = source.replace(/\\text\{[^{}]*\}/g, "").replace(/\\[a-zA-Z]+/g, "");
  const symbols = [...new Set(plain.match(/[a-zA-Z]/g) || [])]
    .map(value => ({ label:value, value, name:`Insert variable ${value}`, variable:true }));
  for (const [pattern, label, value, name] of [
    [/[−-]|^\(/, '−', '-', 'Insert minus'], [/\+/, '+', '+', 'Insert plus'],
    [/\./, '.', '.', 'Insert decimal point'], [/=/, '=', '=', 'Insert equals'],
    [/\\(?:d?frac)|\//, 'a/b', '\\frac{\\placeholder{}}{\\placeholder{}}', 'Insert fraction'],
    [/\\sqrt(?!\s*\[)|√/, '√', '\\sqrt{\\placeholder{}}', 'Insert square root'],
    [/\\sqrt\s*\[\s*3\s*\]|∛/, '∛', '\\sqrt[3]{\\placeholder{}}', 'Insert cube root'],
    [/\^/, 'xⁿ', '^{\\placeholder{}}', 'Insert power'],
    [/\\times|\*/, '×', '\\times', 'Insert multiplication'],
    [/\\div|÷/, '÷', '\\div', 'Insert division'],
    [/,/, ',', ',', 'Insert comma'],
    [/[()]/, '(', '(', 'Insert opening parenthesis'],
    [/[()]/, ')', ')', 'Insert closing parenthesis'],
  ]) if (pattern.test(source)) symbols.push({ label, value, name });
  return symbols;
}

/** Keep the hidden input and existing grading API; show a small local keypad. */
export function mountMathInput(input, { ariaLabel, onSubmit, keypadRegion, inlineKeypadContainer, inlineKeypadOverflow = false, inlineKeypadSide = false, revealOnEdit = true } = {}) {
  const field = new MathfieldElement();
  field.className = "answer-display mathlive-answer-field";
  field.setAttribute("aria-label", ariaLabel || "Maths answer");
  field.mathVirtualKeyboardPolicy = "manual";
  field.setAttribute("inputmode", "none");
  field.readOnly = true;
  field.setAttribute("read-only", "");
  field.tabIndex = 0;
  field.smartFence = true;
  field.smartSuperscript = true;
  field.removeExtraneousParentheses = false;
  field.style.overflow = "hidden";
  field.value = input.value || "";
  const focusField = () => {
    field.focus({preventScroll:true});
    // MathLive may leave a read-only host unfocused after a remount. Hardware
    // keys are handled on this host, so fall back to native element focus.
    if (document.activeElement !== field) HTMLElement.prototype.focus.call(field, {preventScroll:true});
  };
  const keypad = document.createElement("div");
  keypad.className = "compact-math-keypad";
  keypad.setAttribute("role", "group");
  keypad.setAttribute("aria-label", "Maths keypad");
  const spacer = document.createElement("div");
  spacer.setAttribute("aria-hidden", "true");
  spacer.className = "compact-keypad-spacer";
  let locked = false;
  let syncing = false;
  let keypadEditing = false;
  let expected;
  const shape = () => {
    const fraction = /\\d?frac/.test(field.value);
    field.classList.toggle("mathlive-answer-tall", fraction);
    if (activeEditor?.element === field) requestAnimationFrame(() => { if (activeEditor?.element === field) editor.position(revealOnEdit && !inlineKeypadSide); });
  };
  const fromField = () => {
    if (syncing) return;
    shape();
    if (input.value === field.value) return;
    syncing = true;
    input.value = field.value;
    input.dispatchEvent(new Event("input", { bubbles:true }));
    syncing = false;
  };
  const fromState = () => {
    if (syncing) return;
    if (field.value !== input.value) field.value = input.value || "";
    shape();
  };
  const addKey = (row, label, name, action, className = "") => {
    const key = document.createElement("button");
    key.type = "button";
    key.className = `compact-math-key ${className}`;
    key.textContent = label;
    if (/^\d$/.test(label)) key.style.setProperty('--keypad-wide-order', String(label === '0' ? 9 : Number(label) - 1));
    if (name === "Insert fraction") {
      const icon = document.createElement("span");
      icon.className = "compact-fraction-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.append(document.createElement("span"), document.createElement("span"));
      key.replaceChildren(icon);
    }
    key.setAttribute("aria-label", name); key.title = name;
    key.addEventListener("pointerdown", event => event.preventDefault());
    key.addEventListener("click", event => {
      const pointerClick = event.detail > 0 || Boolean(event.pointerType);
      const startedOnKey = pressedKey === key;
      pressedKey = undefined;
      if (pointerClick && !startedOnKey) return;
      if (locked || !field.isConnected) return;
      focusField();
      keypadEditing = true;
      field.readOnly = false;
      try { action(); } finally { field.readOnly = true; keypadEditing = false; }
      fromField();
      queueMicrotask(fromField);
    });
    row.append(key);
  };
  const rebuild = () => {
    expected = input.dataset.expectedAnswer || "";
    keypad.replaceChildren();
    const symbols = document.createElement("div"); symbols.className = "compact-keypad-symbols";
    const digits = document.createElement("div"); digits.className = "compact-keypad-digits";
    const insert = value => field.insert(value, { insertionMode:"replaceSelection", selectionMode:"placeholder" });
    const availableSymbols = keypadSymbols(expected);
    keypad.classList.toggle("digits-only", availableSymbols.length === 0);
    const layout = document.createElement("div"); layout.className = "compact-keypad-layout";
    const controls = document.createElement("div"); controls.className = "compact-keypad-controls";
    // Every answer shape uses the same calculator grid, with symbols to its right.
    for (const digit of "7894561230") addKey(digits, digit, `Enter ${digit}`, () => insert(digit));
    addKey(digits, "⌫", "Delete previous character", () => field.executeCommand("deleteBackward"));
    addKey(digits, "Clear", "Clear answer", () => { field.value = ""; }, "action");
    availableSymbols.forEach(key => addKey(symbols, key.label, key.name, () => insert(key.value), key.variable ? "variable" : ""));
    controls.append(symbols);
    layout.append(digits, controls);
    keypad.append(layout);
  };
  // Anchor to the complete entry group, including its example and required actions.
  // Fixed conversion and painting strips keep their dedicated above-strip placement.
  const placementAnchor = () => field.closest(
    '.answer-entry-system-field, .paper-practice-entry, .linear-entry-row, .invaders-exact-controls, .area-paint-entry, .conversion-count-entry'
  ) || field;
  const practiceAnchor = () => inlineKeypadContainer || field.closest('.paper-practice-entry');
  const inlinePracticeKeypad = () => Boolean(inlineKeypadContainer) || (practiceAnchor() && matchMedia('(max-width:650px) and (orientation:portrait)').matches);
  const editor = {
    element:field, keypad,
    position(reveal = false) {
      if (!field.isConnected) { editor.close(); return; }
      if (activeEditor !== editor) return;
      const wide = !inlineKeypadContainer && !keypadRegion && innerWidth > innerHeight && innerHeight <= 500;
      keypad.classList.toggle('compact-keypad-wide', wide);
      keypad.style.setProperty('--keypad-wide-columns', String(Math.max(10, keypad.querySelectorAll('button').length - 10)));
      const anchor = wide ? field : placementAnchor();
      let bounds = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0;
      const top = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth;
      const height = viewport?.height || innerHeight;
      const gap = 12;
      // Immersive activities can reserve a separate region for answer entry.
      // Keep their action buttons visible without moving the fixed game canvas.
      const region = keypadRegion?.();
      if (region?.isConnected) {
        const area = region.getBoundingClientRect();
        const regionLeft = Math.max(left + 8, area.left);
        const regionTop = Math.max(top + 8, area.top);
        const regionRight = Math.min(left + width - 8, area.right);
        const regionBottom = Math.min(top + height - 8, area.bottom);
        spacer.style.height = '0px';
        document.documentElement.style.setProperty('--quode-virtual-keyboard-height', '0px');
        keypad.style.maxWidth = `${Math.max(0, regionRight - regionLeft)}px`;
        keypad.style.maxHeight = `${Math.max(0, regionBottom - regionTop)}px`;
        const size = keypad.getBoundingClientRect();
        keypad.style.left = `${regionLeft + Math.max(0, (regionRight - regionLeft - size.width) / 2)}px`;
        keypad.style.top = `${regionTop + Math.max(0, (regionBottom - regionTop - size.height) / 2)}px`;
        keypad.dataset.placement = 'region';
        return;
      }
      const dock = field.closest('.conversion-submission .conversion-controls, .area-readiness-strip');
      const bottomStrip = innerWidth <= 650 && dock && getComputedStyle(dock).position === 'fixed' ? dock : null;
      if (bottomStrip) {
        // Overlay the stack above the complete strip, leaving its instruction visible.
        spacer.style.height = '0px';
        document.documentElement.style.setProperty('--quode-virtual-keyboard-height', '0px');
        const stripBounds = bottomStrip.getBoundingClientRect();
        keypad.style.maxWidth = `${Math.max(0, width - 16)}px`;
        keypad.style.maxHeight = `${Math.max(0, stripBounds.top - top - gap - 8)}px`;
        const size = keypad.getBoundingClientRect();
        keypad.style.left = `${Math.max(left + 8, Math.min(bounds.left + bounds.width / 2 - size.width / 2, left + width - size.width - 8))}px`;
        keypad.style.top = `${stripBounds.top - gap - size.height}px`;
        keypad.dataset.placement = 'above';
        return;
      }
      const mainEntry = practiceAnchor();
      if (mainEntry && inlinePracticeKeypad()) {
        // Mobile practice keeps the keypad in normal document flow after the
        // answer/example/actions stack. The new content creates its own scroll
        // range; reveal only the portion hidden by the viewport or fixed footer.
        if (keypad.parentElement !== mainEntry) mainEntry.append(keypad);
        keypad.classList.add('compact-math-keypad-inline');
        spacer.remove();
        document.documentElement.style.setProperty("--quode-virtual-keyboard-height", "0px");
        const side = inlineKeypadSide && matchMedia('(orientation:landscape)').matches;
        const entryBounds = mainEntry.getBoundingClientRect();
        const fieldBounds = field.getBoundingClientRect();
        keypad.classList.toggle('compact-math-keypad-side', side);
        keypad.style.left = side ? `${fieldBounds.right - entryBounds.left + gap}px` : '';
        keypad.style.top = side ? `${fieldBounds.top - entryBounds.top}px` : '';
        // Some side-by-side activities let the keypad overlap the graphic,
        // preserving key sizes while still respecting the viewport's right edge.
        const inlineWidth = side
          ? left + width - fieldBounds.right - gap - 8
          : inlineKeypadOverflow
          ? left + width - mainEntry.getBoundingClientRect().left - 8
          : Math.min(width - 16, mainEntry.clientWidth);
        keypad.style.maxWidth = `${Math.max(0, inlineWidth)}px`;
        keypad.style.maxHeight = 'none';
        keypad.dataset.placement = side ? 'right' : 'inline';
        if (reveal) {
          const scrollPanel = field.closest('[data-keypad-scroll-container]');
          if (scrollPanel) {
            const area = scrollPanel.getBoundingClientRect(), box = keypad.getBoundingClientRect();
            const available = area.height - 24;
            const shift = box.height > available || box.top < area.top + 12
              ? box.top - area.top - 12 : Math.max(0, box.bottom - area.bottom + 12);
            if (Math.abs(shift) > 1) scrollPanel.scrollBy({top:shift, behavior:'instant'});
            return;
          }
          const footer = document.querySelector('.paper-footer:not([hidden])');
          const footerBounds = footer && getComputedStyle(footer).position === 'fixed' ? footer.getBoundingClientRect() : null;
          const visibleBottom = Math.min(top + height - 8, footerBounds?.top ? footerBounds.top - gap : top + height - 8);
          const keypadBounds = keypad.getBoundingClientRect();
          const overflow = keypadBounds.bottom - visibleBottom;
          if (overflow > 1) window.scrollBy({ top:overflow, behavior:"instant" });
          else {
            const toolbar = document.querySelector('.paper-heading-with-layout');
            const toolbarBounds = toolbar && getComputedStyle(toolbar).position === 'fixed' ? toolbar.getBoundingClientRect() : null;
            const visibleTop = Math.max(top + 8, toolbarBounds?.bottom ? toolbarBounds.bottom + 8 : top + 8);
            if (keypadBounds.top < visibleTop) window.scrollBy({ top:keypadBounds.top - visibleTop, behavior:"instant" });
          }
        }
        return;
      }
      keypad.classList.remove('compact-math-keypad-inline');
      if (keypad.parentElement !== document.body) document.body.append(keypad);
      if (!spacer.isConnected) document.body.append(spacer);
      keypad.style.maxWidth = `${Math.max(0, width - 16)}px`;
      keypad.style.maxHeight = 'none';
      const size = keypad.getBoundingClientRect();
      spacer.style.height = `${size.height + 24}px`;
      // Guided activities can still reserve layout space for their controls.
      document.documentElement.style.setProperty("--quode-virtual-keyboard-height", innerWidth <= 720 ? `${size.height + gap}px` : "0px");
      bounds = anchor.getBoundingClientRect();
      keypad.style.left = `${Math.max(left + 8, Math.min(bounds.left, left + width - size.width - 8))}px`;
      const toolbar = document.querySelector('.paper-heading-with-layout');
      const footer = document.querySelector('.paper-footer:not([hidden])');
      const fixedBox = node => node && getComputedStyle(node).position === 'fixed' && getComputedStyle(node).visibility !== 'hidden'
        ? node.getBoundingClientRect() : null;
      let visibleTop = Math.max(top + 8, (fixedBox(toolbar)?.bottom || top) + 4);
      let visibleBottom = Math.min(top + height - 8, (fixedBox(footer)?.top || top + height) - 4);
      // Keep the complete keypad visible; do not clip its bottom row to reserve
      // space for the answer and examples above it.
      if (visibleBottom - visibleTop < size.height) {
        visibleTop = top + 8; visibleBottom = top + height - 8;
      }
      const place = () => {
        const moved = anchor.getBoundingClientRect();
        keypad.style.top = `${Math.max(visibleTop, Math.min(moved.bottom + gap, visibleBottom - size.height))}px`;
      };
      keypad.dataset.placement = "below";
      place();
      if (reveal) {
        const keypadTop = bounds.bottom + gap;
        const overflow = keypadTop + size.height - visibleBottom;
        if (overflow > 1) window.scrollBy({top:overflow, behavior:'instant'});
        else if (keypadTop < visibleTop) window.scrollBy({top:keypadTop - visibleTop, behavior:'instant'});
        place();
      }
    },
    open(reveal = true) {
      if (locked || !field.isConnected || demoMode()) return;
      if (activeEditor && activeEditor !== editor) activeEditor.close();
      window.mathVirtualKeyboard?.hide();
      if (expected !== (input.dataset.expectedAnswer || "")) rebuild();
      if (activeEditor === editor) { editor.position(); return; }
      activeEditor = editor;
      sizeObserver.observe(field);
      sizeObserver.observe(placementAnchor());
      sizeObserver.observe(keypad);
      if (inlinePracticeKeypad()) practiceAnchor().append(keypad);
      else {
        document.body.append(keypad);
        document.body.append(spacer);
        spacer.style.height = `${keypad.offsetHeight + 24}px`;
      }
      field.dataset.keyboardActive = "true";
      editor.position(reveal);
      requestAnimationFrame(() => { if (activeEditor === editor) editor.position(reveal); });
    },
    close() {
      clearTimeout(pointerReveal); pointerFocusing = false;
      sizeObserver.disconnect();
      keypad.remove();
      spacer.remove();
      field.dataset.keyboardActive = "false";
      if (activeEditor === editor) {
        activeEditor = undefined;
        document.documentElement.style.setProperty("--quode-virtual-keyboard-height", "0px");
        document.documentElement.style.setProperty("--quode-virtual-keyboard-gap", "0px");
      }
    },
    setValue(value) { input.value = value || ""; fromState(); },
    setAriaLabel(value) { field.setAttribute("aria-label", value); },
    setLocked(value) {
      locked = Boolean(value);
      input.dataset.answerLocked = String(locked);
      input.readOnly = locked;
      field.tabIndex = locked ? -1 : 0;
      field.setAttribute("aria-disabled", String(locked));
      field.style.pointerEvents = locked ? "none" : "auto";
      if (locked) editor.close();
      if (field.isConnected) field.readOnly = true;
      queueMicrotask(() => { if (field.isConnected) field.readOnly = true; });
    },
    focus({reveal = true} = {}) { if (!locked && field.isConnected && !demoMode()) { focusField(); editor.open(reveal); } },
    sync:fromState,
    syncControls() { rebuild(); if (activeEditor === editor) editor.position(); },
  };
  // Fractions and nested maths change height after MathLive's render pass.
  // Observe actual geometry so the keypad never keeps the old textbox edge.
  const sizeObserver = new ResizeObserver(() => { if (activeEditor === editor) editor.position(revealOnEdit && !inlineKeypadSide); });
  let pointerFocusing = false;
  let pointerReveal;
  field.addEventListener("pointerdown", () => { clearTimeout(pointerReveal); pointerFocusing = true; }, true);
  field.addEventListener("pointercancel", () => { clearTimeout(pointerReveal); pointerFocusing = false; }, true);
  field.addEventListener("pointerup", () => {
    // MathLive can consume the native click on populated maths and emit only a
    // synthetic click. Wait until the pointer gesture has finished before opening:
    // opening on its early synthetic click can move a button under the finger.
    pointerReveal = setTimeout(() => {
      if (!pointerFocusing || !field.isConnected || locked) return;
      pointerFocusing = false;
      if (activeEditor) return;
      focusField(); editor.open();
    }, 0);
  }, true);
  field.addEventListener("focusin", () => { if (!pointerFocusing) editor.open(); });
  // Wait for the click before lifting a fixed mobile answer panel. Moving it
  // between pointerdown and pointerup would cancel the learner's click.
  // MathLive can consume clicks on rendered maths inside its shadow root.
  // Capture them on the host so tapping an existing answer reopens the keypad.
  field.addEventListener("click", event => {
    // MathLive also sends a synthetic click before the native touch click.
    // Opening on that first event can scroll another button under the finger.
    if (pointerFocusing && !event.isTrusted) return;
    clearTimeout(pointerReveal); pointerFocusing = false; focusField(); editor.open();
  }, true);
  field.addEventListener("input", () => { fromField(); queueMicrotask(fromField); });
  field.addEventListener("change", fromField);
  field.addEventListener("selection-change", () => queueMicrotask(fromField));
  field.addEventListener("keyup", () => queueMicrotask(fromField));
  field.addEventListener("beforeinput", event => { if (!keypadEditing) event.preventDefault(); }, true);
  field.addEventListener("paste", event => event.preventDefault(), true);
  field.addEventListener("drop", event => event.preventDefault(), true);
  // Hardware input uses the same buttons as touch; the display stays read-only.
  const hardwareKey = event => {
    if (event.key === "Tab" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (locked || activeEditor !== editor) return;
    if (event.key === " " && event.target.closest?.('button')) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === "Escape") { editor.close(); return; }
    if (event.key === "Enter") { fromField(); onSubmit?.(); return; }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      field.executeCommand(event.key === "ArrowLeft" ? "moveToPreviousChar" : "moveToNextChar");
      return;
    }
    const names = {
      Backspace:"Delete previous character",
      '-':"Insert minus", '+':"Insert plus", '.':"Insert decimal point", '=':"Insert equals",
      '/':"Insert fraction", '*':"Insert multiplication", '^':"Insert power",
      ',':"Insert comma", '(' :"Insert opening parenthesis", ')':"Insert closing parenthesis",
      '√':"Insert square root", '∛':"Insert cube root", '÷':"Insert division",
    };
    const name = /^\d$/.test(event.key) ? `Enter ${event.key}` : names[event.key] || `Insert variable ${event.key}`;
    const key = [...keypad.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name);
    key?.click();
  };
  field.addEventListener("keydown", hardwareKey, true);
  keypad.addEventListener("keydown", hardwareKey, true);
  input.addEventListener("input", fromState);
  shape();
  rebuild();
  return editor;
}
