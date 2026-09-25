const DEMO_PARAMETER = "demo";
const DEMO_STORAGE_KEY = "quode:demo-mode";
const DEMO_CARD_ATTRIBUTE = "data-quode-demo-control";
const DEMO_STYLE_ID = "quode-demo-recorder-style";

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function demoParameter() {
  const value = new URLSearchParams(window.location.search).get(DEMO_PARAMETER);
  if (value == null) return undefined;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function readDemoMode() {
  const parameter = demoParameter();
  if (parameter !== undefined) {
    writeDemoMode(parameter);
    return parameter;
  }
  try {
    return window.localStorage.getItem(DEMO_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeDemoMode(enabled) {
  try {
    if (enabled) window.localStorage.setItem(DEMO_STORAGE_KEY, "on");
    else window.localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // Demo mode still works for the current page when storage is unavailable.
  }
}

function replaceLatexGroups(source, command, groupCount, transform) {
  let value = source;
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const commandAt = value.indexOf(command, searchFrom);
    if (commandAt < 0) break;
    let cursor = commandAt + command.length;
    const groups = [];
    let valid = true;
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      while (value[cursor] === " ") cursor += 1;
      if (value[cursor] !== "{") {
        valid = false;
        break;
      }
      const start = cursor + 1;
      let depth = 1;
      cursor += 1;
      while (cursor < value.length && depth) {
        if (value[cursor] === "{") depth += 1;
        else if (value[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      if (depth) {
        valid = false;
        break;
      }
      groups.push(value.slice(start, cursor - 1));
    }
    if (!valid) {
      searchFrom = commandAt + command.length;
      continue;
    }
    value = `${value.slice(0, commandAt)}${transform(...groups)}${value.slice(cursor)}`;
    searchFrom = commandAt;
  }
  return value;
}

function fractionToKeyValue(top, bottom) {
  const formatPart = (part) => {
    const value = String(part).trim();
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+|[A-Za-z])$/.test(value) ? value : `(${value})`;
  };
  return `${formatPart(top)}/${formatPart(bottom)}`;
}

export function answerToKeyValues(answer) {
  let value = String(answer ?? "")
    .trim()
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\(?:cdot|times)/g, "×")
    .replace(/\\(?:,|;|!|quad|qquad)/g, "");
  value = replaceLatexGroups(value, "\\dfrac", 2, fractionToKeyValue);
  value = replaceLatexGroups(value, "\\frac", 2, fractionToKeyValue);
  value = replaceLatexGroups(value, "\\sqrt", 1, (inside) => `√(${inside})`);
  value = value
    .replace(/\^\{([^{}]+)\}/g, "^($1)")
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    .replaceAll("-", "−")
    .replace(/\s+/g, "");
  return [...value];
}

function injectStyles() {
  if (document.querySelector(`#${DEMO_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = DEMO_STYLE_ID;
  style.textContent = `
    .quode-demo-cursor {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 10002;
      width: 44px;
      height: 55px;
      pointer-events: none;
      opacity: 1;
      filter: drop-shadow(0 0 8px rgba(103, 232, 249, .8));
      transform: translate3d(calc(50vw - 17px), calc(50vh - 5px), 0);
      transition: opacity 160ms ease;
    }
    .quode-demo-cursor.hidden { opacity: 0; }
    .quode-demo-cursor svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      transform: scale(1);
      transform-origin: 38% 12%;
      transition: transform 90ms ease-out;
    }
    .quode-demo-cursor.clicking svg { transform: scale(.82); }
    body.quode-demo-active .step-panel .hint-button {
      display: none !important;
    }
    body.quode-demo-active .strategy-banner {
      display: none !important;
    }
    body.quode-demo-active .answer-row,
    body.quode-demo-active .complete-actions {
      display: none !important;
    }
    body.quode-demo-active .math-keypad,
    body.quode-demo-active > .mobile-docked-keypad,
    body.quode-demo-active > .ML__keyboard {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    body.quode-demo-active .flower-celebration {
      display: none !important;
    }
    body.quode-demo-active .guided-line {
      animation: none !important;
    }
    body.quode-demo-active .guided-line-preview {
      animation: guided-result-in 900ms ease-out both !important;
    }
    body.quode-demo-active .step-answer-line {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
    body.quode-demo-active .step-panel:not(.quode-demo-guidance-visible) .guidance-copy {
      opacity: 0 !important;
      visibility: hidden !important;
    }
    body.quode-demo-active .step-panel.quode-demo-guidance-visible .guidance-copy {
      opacity: 1 !important;
      visibility: visible !important;
      animation: none !important;
      transition: none !important;
    }
    body.quode-demo-active .step-panel.quode-demo-guidance-visible.quode-demo-guidance-fading .guidance-copy {
      opacity: 0 !important;
      visibility: visible !important;
      transition: opacity 320ms ease !important;
    }
    body.quode-demo-active .active-step-copy.guidance-leaving {
      opacity: 1 !important;
      transform: none !important;
      transition: none !important;
    }
    body.quode-demo-step-animation-paused .working-active,
    body.quode-demo-step-animation-paused .working-active *,
    body.quode-demo-step-animation-paused .arrows-active,
    body.quode-demo-step-animation-paused .arrows-active * {
      animation-play-state: paused !important;
    }
    .quode-demo-pressed {
      transform: scale(.92) !important;
      filter: brightness(.88) !important;
      box-shadow: inset 0 4px 9px rgba(0, 0, 0, .28) !important;
      transition: transform 90ms ease-out, filter 90ms ease-out, box-shadow 90ms ease-out !important;
    }
    .quode-demo-start {
      position: fixed;
      inset: 0;
      z-index: 10003;
      display: grid;
      place-items: center;
      background: rgba(15, 23, 42, .82);
      backdrop-filter: blur(5px);
    }
    .quode-demo-start-card {
      width: min(430px, calc(100vw - 32px));
      padding: 28px;
      border-radius: 18px;
      background: #fff;
      color: #17202a;
      text-align: center;
      box-shadow: 0 22px 70px rgba(0, 0, 0, .28);
      font-family: system-ui, sans-serif;
    }
    .quode-demo-start-card h2 { margin: 0 0 10px; font-size: 1.45rem; }
    .quode-demo-start-card p { margin: 0 0 20px; line-height: 1.45; }
    .quode-demo-start-card button {
      border: 0;
      border-radius: 999px;
      padding: 12px 22px;
      background: #e65100;
      color: #fff;
      font: 700 1rem/1 system-ui, sans-serif;
      cursor: pointer;
    }
  `;
  document.head.append(style);
}

function addSetupControl() {
  if (!readDemoMode() && demoParameter() === false) writeDemoMode(false);
  const grid = document.querySelector(".options-grid");
  if (!grid) return false;

  let added = false;
  if (!grid.querySelector(`[${DEMO_CARD_ATTRIBUTE}]`)) {
    const card = document.createElement("label");
    card.className = "option-control";
    card.setAttribute(DEMO_CARD_ATTRIBUTE, "");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = readDemoMode();
    checkbox.setAttribute("aria-label", "demo mode");
    checkbox.addEventListener("change", () => writeDemoMode(checkbox.checked));
    const name = document.createElement("span");
    name.className = "option-name";
    name.textContent = "demo mode";
    const info = document.createElement("span");
    info.className = "info";
    info.tabIndex = 0;
    info.textContent = "ⓘ";
    info.dataset.tooltip = "Record an automatic demonstration that enters correct answers.";
    info.setAttribute("aria-label", `About demo mode: ${info.dataset.tooltip}`);
    card.append(checkbox, name, info);
    grid.append(card);
    added = true;
  }

  return added;
}

function elementIsVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const bounds = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return bounds.width > 0 && bounds.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function waitForElement(selector, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const existing = [...document.querySelectorAll(selector)].find(elementIsVisible);
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const match = [...document.querySelectorAll(selector)].find(elementIsVisible);
      if (!match) return;
      window.clearTimeout(timer);
      observer.disconnect();
      resolve(match);
    });
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  });
}

function waitForCondition(check, description, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const inspect = () => {
      const result = check();
      if (result) {
        resolve(result);
        return;
      }
      if (performance.now() - started >= timeout) {
        reject(new Error(`Timed out waiting for ${description}`));
        return;
      }
      window.requestAnimationFrame(inspect);
    };
    inspect();
  });
}

async function waitForVisualAnimations(scope, timeout = 30000) {
  if (!scope || typeof scope.getAnimations !== "function") return;
  const started = performance.now();
  let quietFrames = 0;
  while (performance.now() - started < timeout) {
    const running = scope.getAnimations({ subtree: true }).filter((animation) => {
      const iterations = animation.effect?.getTiming?.().iterations;
      return animation.playState === "running" && iterations !== Infinity;
    });
    if (!running.length) {
      quietFrames += 1;
      if (quietFrames >= 2) return;
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      continue;
    }
    quietFrames = 0;
    await Promise.race([
      Promise.all(running.map((animation) => animation.finished.catch(() => undefined))),
      wait(1000),
    ]);
  }
  throw new Error("Timed out waiting for the current step animation to finish");
}

export function demoTiming(name, fallback, minimum, maximum, search = window.location.search) {
  const rawValue = new URLSearchParams(search).get(name);
  if (rawValue == null || rawValue.trim() === "") return fallback;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function checkpoint(number, message, question, step) {
  console.log(`${number}. ${message}`, { question, step });
}

function installHiddenAudioMute() {
  const restored = [];
  const mutedGains = new WeakSet();
  const AudioNodeClass = window.AudioNode;
  if (AudioNodeClass?.prototype?.connect) {
    const originalConnect = AudioNodeClass.prototype.connect;
    AudioNodeClass.prototype.connect = function connectDemoAwareNode(destination, ...args) {
      if (mutedGains.has(this)) return destination;
      return originalConnect.call(this, destination, ...args);
    };
    restored.push(() => { AudioNodeClass.prototype.connect = originalConnect; });
  }
  const contextClasses = new Set([window.AudioContext, window.webkitAudioContext].filter(Boolean));
  contextClasses.forEach((ContextClass) => {
    const prototype = ContextClass.prototype;
    const originalCreateGain = prototype.createGain;
    if (typeof originalCreateGain !== "function") return;
    prototype.createGain = function createDemoAwareGain(...args) {
      const gainNode = originalCreateGain.apply(this, args);
      if (document.body.classList.contains("quode-demo-hidden-audio")) mutedGains.add(gainNode);
      return gainNode;
    };
    restored.push(() => { prototype.createGain = originalCreateGain; });
  });
  return () => restored.reverse().forEach((restore) => restore());
}

function installGuidancePreparation() {
  const prepare = (root = document) => {
    if (root instanceof Element && root.matches(".step-panel")) {
      root.classList.add("quode-demo-guidance-preparing");
      document.body.classList.add("quode-demo-hidden-audio");
    }
    root.querySelectorAll?.(".step-panel").forEach((panel) => {
      panel.classList.add("quode-demo-guidance-preparing");
      document.body.classList.add("quode-demo-hidden-audio");
    });
  };
  document.body.classList.add("quode-demo-active", "quode-demo-hidden-audio");
  prepare();
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node instanceof Element) prepare(node);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    document.body.classList.remove("quode-demo-hidden-audio", "quode-demo-step-animation-paused");
    document.querySelectorAll(".quode-demo-guidance-preparing, .quode-demo-guidance-visible, .quode-demo-guidance-fading")
      .forEach((panel) => panel.classList.remove(
        "quode-demo-guidance-preparing",
        "quode-demo-guidance-visible",
        "quode-demo-guidance-fading",
      ));
  };
}

async function revealPreparedGuidance(panel) {
  const guidance = panel.querySelector(".guidance-copy");
  const guidedLines = document.querySelectorAll(".guided-list > .guided-line");
  const previousResult = guidedLines[guidedLines.length - 1];
  if (previousResult?.classList.contains("step-divider")) {
    await waitForVisualAnimations(previousResult);
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }
  document.body.classList.remove("quode-demo-hidden-audio");
  panel.classList.remove("quode-demo-guidance-preparing");
  panel.classList.add("quode-demo-guidance-visible");
  if (guidance) void guidance.offsetWidth;
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function fadeOutPreparedGuidance(panel) {
  const guidance = panel.querySelector(".guidance-copy");
  if (guidance) void guidance.offsetWidth;
  panel.classList.add("quode-demo-guidance-fading");
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  await waitForVisualAnimations(guidance, 2000);
  panel.classList.remove("quode-demo-guidance-visible", "quode-demo-guidance-fading");
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

class DemoPointer {
  constructor(initialTarget, enabled) {
    this.enabled = enabled;
    const initialBounds = initialTarget.getBoundingClientRect();
    this.x = initialBounds.left + initialBounds.width / 2;
    this.y = initialBounds.top + initialBounds.height / 2;
    if (!enabled) return;
    this.element = document.createElement("div");
    this.element.className = "quode-demo-cursor";
    this.element.innerHTML = `
      <svg viewBox="0 0 80 100" aria-hidden="true">
        <path d="M24.76,22.64V12.4c0-3.18,2.59-5.77,5.77-5.77,1.44,0,2.82,.54,3.89,1.51,1.07,1,1.72,2.33,1.85,3.76l.87,10.08c2.12-1.88,3.39-4.59,3.39-7.48,0-5.51-4.49-10-10-10s-10,4.49-10,10c0,3.29,1.62,6.29,4.23,8.14Z" fill="#67e8f9" stroke="rgba(2,6,23,.95)" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>
        <path d="M55.98,69.53c0-.14,.03-.28,.09-.41l4.48-9.92v-18.37c0-1.81-1.08-3.48-2.76-4.26-6.75-3.13-13.8-4.84-20.95-5.08-.51-.01-.92-.41-.97-.91l-1.6-18.5c-.08-.94-.51-1.82-1.2-2.46-.7-.63-1.6-.99-2.54-.99-2.08,0-3.77,1.69-3.77,3.77V48.48h-2v-13.32c-2.61,.46-4.69,2.65-4.91,5.36-.56,6.79-.53,14.06,.08,21.62,.28,3.44,2.42,6.52,5.58,8.05l4.49,2.18c.35,.17,.56,.52,.56,.9v2.23h25.42v-5.97Z" fill="#67e8f9" stroke="rgba(2,6,23,.95)" stroke-width="4" stroke-linejoin="round" paint-order="stroke"/>
      </svg>`;
    this.element.style.transform = `translate3d(${this.x - 17}px, ${this.y - 5}px, 0)`;
    document.body.append(this.element);
  }

  placeAt(target) {
    const bounds = target.getBoundingClientRect();
    this.x = bounds.left + bounds.width / 2;
    this.y = bounds.top + bounds.height / 2;
    if (!this.enabled) return;
    this.element.getAnimations().forEach((animation) => animation.cancel());
    this.element.style.transform = `translate3d(${this.x - 17}px, ${this.y - 5}px, 0)`;
    this.show();
  }

  async click(target, {
    hideAfter = true,
    moveDuration = demoTiming("demo-move", 650, 80, 3000),
    pressDuration = demoTiming("demo-press", 180, 60, 1000),
    pauseDuration = demoTiming("demo-pause", 420, 40, 3000),
    approachDuration = 280,
    releaseDuration = 80,
  } = {}) {
    if (this.enabled) this.show();
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    await wait(approachDuration);
    const bounds = target.getBoundingClientRect();
    const nextX = bounds.left + bounds.width / 2;
    const nextY = bounds.top + bounds.height / 2;
    if (this.enabled) {
      const animation = this.element.animate([
        { transform: `translate3d(${this.x - 17}px, ${this.y - 5}px, 0)` },
        { transform: `translate3d(${nextX - 17}px, ${nextY - 5}px, 0)` },
      ], { duration: moveDuration, easing: "cubic-bezier(.22,.8,.25,1)", fill: "forwards" });
      await animation.finished;
    }
    this.x = nextX;
    this.y = nextY;
    if (this.enabled) this.element.classList.add("clicking");
    target.classList.add("quode-demo-pressed");
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse" }));
    await wait(pressDuration);
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse" }));
    target.classList.remove("quode-demo-pressed");
    if (this.enabled) this.element.classList.remove("clicking");
    await wait(releaseDuration);
    target.click();
    if (this.enabled && hideAfter) this.hide();
    await wait(pauseDuration);
  }

  show() {
    this.element?.classList.remove("hidden");
  }

  hide() {
    this.element?.classList.add("hidden");
  }

  remove() {
    this.element?.remove();
  }
}

async function enterProgressively(input, answer) {
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  for (const value of answerToKeyValues(answer)) {
    input.value += value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(demoTiming("demo-type", 24, 10, 500));
  }
}

async function enterAnswer(input, answer) {
  await enterProgressively(input, answer);
}

async function playExercise() {
  const firstDisplay = await waitForCondition(
    () => document.querySelector('.answer-display[aria-label="Your final answer"]') || undefined,
    "the hidden final-answer control",
  );
  const pointer = new DemoPointer(firstDisplay, false);
  const stopHiddenAudioMute = installHiddenAudioMute();
  const stopGuidancePreparation = installGuidancePreparation();
  try {
    let questionNumber = 0;
    let completedSteps = 0;
    const publishProgress = (complete = false) => {
      document.documentElement.dataset.quodeDemoQuestionsCompleted = String(questionNumber);
      document.documentElement.dataset.quodeDemoStepsCompleted = String(completedSteps);
      if (complete) {
        window.dispatchEvent(new CustomEvent("quode-demo-complete", {
          detail: { questions: questionNumber, steps: completedSteps },
        }));
      }
    };
    publishProgress();
    while (questionNumber < 99) {
      const directDisplay = await waitForCondition(
        () => document.querySelector('.answer-display[aria-label="Your final answer"]') || undefined,
        "the hidden final-answer control",
      );
      const directInput = directDisplay.closest(".input-example")?.querySelector(".answer-input");
      const expected = directInput?.dataset.expectedAnswer;
      if (!expected) throw new Error("The current answer does not expose an expected keypad value");

      const wrongAnswer = String(expected).replace(/\s+/g, "") === "0" ? "1" : "0";
      await enterAnswer(directInput, wrongAnswer);
      const check = await waitForCondition(
        () => document.querySelector(".answer-row .round-action:not(:disabled)") || undefined,
        "the hidden answer-check control",
      );
      check.click();
      await wait(demoTiming("demo-wrong", 900, 500, 5000));

      const stepwise = await waitForCondition(
        () => document.querySelector(".answer-row .stepwise-button:not(:disabled)") || undefined,
        "the hidden stepwise control",
      );
      document.body.classList.add("quode-demo-step-animation-paused");
      stepwise.click();

      let stepNumber = 0;
      let currentPanel = await waitForCondition(
        () => document.querySelector(".step-panel") || undefined,
        "the first demo step panel",
        20000,
      );
      while (stepNumber < 99) {
        const bulb = await waitForCondition(() => {
          const candidate = currentPanel.querySelector(".hint-button");
          return candidate
            && !candidate.disabled
            && !candidate.classList.contains("bulb-pending")
            && !candidate.classList.contains("bulb-gone")
            ? candidate
            : undefined;
        }, "the demo hint control to become ready", 20000);
        bulb.click();

        const expectedHint = currentPanel
          .querySelector(".current-guidance-reserve .typed-hint")
          ?.textContent;
        await waitForCondition(() => {
          const hint = currentPanel.querySelector(".guidance-copy .typed-hint");
          return expectedHint
            && hint
            && !hint.classList.contains("hint-pending")
            && hint.textContent === expectedHint
            ? hint
            : undefined;
        }, "the complete hidden hint text", 30000);
        checkpoint(1, "displaying intent and hint before step animation", questionNumber + 1, stepNumber + 1);
        await revealPreparedGuidance(currentPanel);
        const stepInput = currentPanel.querySelector(".answer-input");
        if (!stepInput) throw new Error("The guided step has no answer input");
        checkpoint(2, "intent and hint visible, waiting for 5sec", questionNumber + 1, stepNumber + 1);
        await wait(demoTiming("demo-hint-ready", 5000, 200, 15000));
        checkpoint(3, "starting step animation with intent and hint visible", questionNumber + 1, stepNumber + 1);
        document.body.classList.remove("quode-demo-step-animation-paused");
        const animationStarted = await waitForCondition(() => {
          const lines = document.querySelectorAll(".guided-list > .guided-line");
          const equation = lines[lines.length - 1]?.firstElementChild;
          return equation
            && (equation.classList.contains("working-active")
              || equation.classList.contains("arrows-active"))
            ? equation
            : undefined;
        }, "the guided animation to start", demoTiming("demo-animation-start", 1200, 200, 5000))
          .catch(() => undefined);
        // Some authored steps replace the whole expression without attaching
        // a working-active/arrows-active class. They are still valid guided
        // steps and must never abort the remaining questions in the demo.
        if (animationStarted) await waitForVisualAnimations(animationStarted);
        checkpoint(4, "step animation finished - fading out intent and hint", questionNumber + 1, stepNumber + 1);
        await fadeOutPreparedGuidance(currentPanel);
        const stepDisplay = stepInput.closest(".input-example")?.querySelector(".answer-display");
        const stepAnswer = stepInput.dataset.expectedAnswer;
        if (!stepDisplay || !stepAnswer) throw new Error("The guided step has no keypad answer");
        checkpoint(5, "intent and hint hidden - showing the answer for this step", questionNumber + 1, stepNumber + 1);
        await enterAnswer(stepInput, stepAnswer);

        const continueStep = await waitForCondition(() => {
          const candidate = currentPanel.querySelector(".step-action");
          return candidate && !candidate.disabled ? candidate : undefined;
        }, "the hidden step action to become ready", 10000);
        const completedPanel = continueStep.closest(".step-panel");
        document.body.classList.add("quode-demo-step-animation-paused");
        continueStep.click();
        pointer.hide();
        stepNumber += 1;
        completedSteps += 1;
        document.documentElement.dataset.quodeDemoStepsCompleted = String(completedSteps);

        const outcome = await waitForCondition(() => {
          const nextQuestion = document.querySelector(".complete-actions .next-question-button");
          if (nextQuestion) return { type: "question", element: nextQuestion };
          const nextPanel = document.querySelector(".step-panel");
          if (completedPanel && !completedPanel.isConnected && nextPanel && nextPanel !== completedPanel) {
            return { type: "step", element: nextPanel };
          }
          return undefined;
        }, "the completed-step transition to finish", 30000);
        if (outcome.type === "step") {
          currentPanel = outcome.element;
          continue;
        }
        await waitForVisualAnimations(document.querySelector(".workspace"));

        const configuredResultPause = Number(document.documentElement.dataset.quodeDemoResultPause);
        const resultPause = Number.isFinite(configuredResultPause) && configuredResultPause > 0
          ? configuredResultPause
          : 1100;
        await wait(demoTiming("demo-result", resultPause, 200, 5000));
        const next = outcome.element;
        questionNumber += 1;
        publishProgress();
        if (next.disabled) {
          await wait(demoTiming("demo-finish", 1800, 200, 10000));
          publishProgress(true);
          return;
        }
        await pointer.click(next);
        pointer.hide();
        break;
      }

    }
    await wait(demoTiming("demo-finish", 1800, 200, 10000));
    publishProgress(true);
  } finally {
    stopGuidancePreparation();
    stopHiddenAudioMute();
    pointer.remove();
  }
}

function recordingMimeType() {
  for (const mimeType of ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (window.MediaRecorder?.isTypeSupported(mimeType)) return mimeType;
  }
  return "";
}

function downloadRecording(chunks, mimeType) {
  const blob = new Blob(chunks, { type: mimeType || "video/webm" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  link.href = url;
  link.download = `${window.quode?.name || "quode"}-demo-${timestamp}.webm`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function captureDemo() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "browser",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  });
  const mimeType = recordingMimeType();
  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 5_000_000,
  });
  const completion = new Promise((resolve) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      downloadRecording(chunks, mimeType);
      resolve();
    }, { once: true });
  });
  const videoTrack = stream.getVideoTracks()[0];
  videoTrack?.addEventListener("ended", () => {
    if (recorder.state === "recording") recorder.stop();
  }, { once: true });

  recorder.start(1000);
  try {
    await wait(500);
    await playExercise();
  } finally {
    if (recorder.state === "recording") recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
  }
  await completion;
}

function showStartFallback(start) {
  if (document.querySelector(".quode-demo-start")) return;
  const overlay = document.createElement("div");
  overlay.className = "quode-demo-start";
  const card = document.createElement("div");
  card.className = "quode-demo-start-card";
  const heading = document.createElement("h2");
  heading.textContent = "Demo mode is ready";
  const copy = document.createElement("p");
  copy.textContent = "Chrome needs one click to capture this tab. Choose this tab and enable tab audio when prompted.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Start demo recording";
  button.addEventListener("click", async () => {
    button.disabled = true;
    overlay.remove();
    try {
      await start();
    } catch (error) {
      button.disabled = false;
      copy.textContent = error instanceof Error ? error.message : String(error);
      document.body.append(overlay);
    }
  });
  card.append(heading, copy, button);
  overlay.append(card);
  document.body.append(overlay);
}

let demoStarted = false;

async function startPracticeDemo() {
  if (demoStarted) return;
  demoStarted = true;
  const playbackOnly = window.matchMedia("(max-width: 720px)").matches;
  try {
    await waitForCondition(
      () => document.querySelector('.answer-display[aria-label="Your final answer"]') || undefined,
      "the hidden final-answer control",
      30000,
    );
    if (playbackOnly) {
      await playExercise();
      return;
    }
    await captureDemo();
  } catch (error) {
    demoStarted = false;
    if (playbackOnly) {
      console.error("[Quode Demo] Automatic playback failed", error);
      return;
    }
    console.info("[Quode Demo] Automatic tab capture needs confirmation", error);
    showStartFallback(async () => {
      demoStarted = true;
      try {
        await captureDemo();
      } finally {
        demoStarted = false;
      }
    });
  }
}

export function installDemoRecorder() {
  injectStyles();
  const path = window.location.pathname;
  const practice = path.endsWith("/practice");
  const printable = path.endsWith("/print");
  if (practice) {
    if (readDemoMode()) {
      document.body.classList.add("quode-demo-active", "quode-demo-hidden-audio");
      startPracticeDemo();
    }
    return;
  }
  if (printable) return;

  if (addSetupControl()) return;
  const observer = new MutationObserver(() => {
    if (!addSetupControl()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
