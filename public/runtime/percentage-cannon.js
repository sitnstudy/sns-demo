import { createCannonAudio, createCannonVolley } from "./cannon-effects.js";
import { element as el } from "./answer-challenge.js";
import { mountMathInput } from "./math-input.js";
import { createStepFeedback } from "./step-feedback.js";
import { createCompletionPrompt } from "./completion-prompt.js";
import { createAreaReadinessStrip } from "./area-readiness-strip.js";
import { dockGameAudio } from "./game-audio-control.js";

const href = new URL("./percentage-cannon.css", import.meta.url).href;
if (
  ![...document.querySelectorAll('link[rel="stylesheet"]')].some(
    (link) => link.href === href,
  )
) {
  const link = el("link", "");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}
// Decimal maths stays in integers; display never depends on projectile collisions.
export function decimal(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  // Generated percentages have at most nine decimal places. Keeping this
  // arithmetic in safe integers avoids BigInt syntax, which prevents the
  // entire module from loading on iOS 13 and earlier.
  if (fraction.length > 9) return null;
  const n = Number(whole + fraction);
  const d = 10 ** fraction.length;
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) return null;
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return {
    n,
    d,
    normalized: normalizedWhole + (normalizedFraction ? `.${normalizedFraction}` : ""),
  };
}
export function percentageAmount(total, percentage) {
  const p = decimal(percentage);
  if (!p) throw new Error("Invalid percentage");
  let n = Number(total) * p.n,
    d = p.d * 100;
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d))
    throw new Error("Percentage is too precise");
  const whole = n / d;
  let remainder = n % d,
    fraction = "";
  while (remainder) {
    remainder *= 10;
    fraction += String(Math.floor(remainder / d));
    remainder %= d;
  }
  return String(Math.floor(whole)) + (fraction ? "." + fraction : "");
}
export const percentageLevels = [
  {
    name: "Common percentages",
    step: "1",
    questions: [
      [20, "10"],
      [40, "25"],
      [80, "75"],
      [170, "10"],
    ],
  },
  {
    name: "Whole percentages",
    step: "1",
    questions: [
      [200, "13"],
      [100, "37"],
      [300, "17"],
      [500, "89"],
    ],
  },
  {
    name: "Decimal amounts",
    step: "1",
    questions: [
      [86, "13"],
      [170, "1"],
      [73, "17"],
      [91, "37"],
    ],
  },
  {
    name: "Fractional percentages",
    step: "0.5",
    questions: [
      [70, "12.5"],
      [86, "2.5"],
      [54, "37.5"],
    ],
  },
  {
    name: "Your turn",
    step: "0.5",
    questions: [
      [170, "10"],
      [86, "13"],
      [70, "12.5"],
      [200, "17"],
    ],
  },
];
const format = (value) => String(Number(Number(value).toFixed(8)));

export function mountPercentageCannon(
  question,
  search = location.search,
  options = {},
) {
  const source = question.teaching?.percentage || question.teaching || {};
  const labels = question.teaching?.labels || {};
  const words = (key, fallback, values = {}) =>
    (labels[key] || fallback).replace(/\{(\w+)\}/g, (_, name) =>
      String(values[name] ?? ""),
    );
  const authoredLevels = question.teaching?.levels;
  const pools =
    options.levels ||
    (authoredLevels?.length === 5 &&
    authoredLevels.every((item) => item.questions?.length)
      ? authoredLevels
      : percentageLevels);
  const level = Math.max(1, Math.min(5, Number(source.level) || 1));
  let round = {
    total: Number(source.total || 170),
    target: String(source.targetPercent ?? source.targetPercentage ?? 10),
    step: String(source.step ?? source.percentageStep ?? pools[level - 1].step),
  };
  const originalRound = { ...round };
  if (
    !Number.isInteger(round.total) ||
    round.total < 1 ||
    round.total > 500 ||
    !decimal(round.target) ||
    Number(round.target) > 100 ||
    !decimal(round.step) ||
    Number(round.step) <= 0
  )
    throw new Error("Invalid percentage cannon question");
  let selected = 0,
    busy = false,
    solved = false,
    revealed = false,
    destroyed = false,
    active = true,
    view = "",
    attempt = "",
    holdTimer,
    holdInterval,
    generation = 0;
  const root = el("section", "paper-teaching percentage-cannon");
  const sound = createCannonAudio();
  const volley = createCannonVolley(root, sound);
  // AbortSignal event-listener options arrived late in Safari. Track the
  // listeners ourselves so the activity remains usable on older iPhones.
  const listeners = [];
  const on = (node, type, fn) => {
    node.addEventListener(type, fn);
    listeners.push([node, type, fn]);
  };
  const button = (text, fn, cls = "") => {
    const b = el("button", `pc-button ${cls}`, text);
    b.type = "button";
    if (fn) on(b, "click", fn);
    return b;
  };
  const stepFeedback = createStepFeedback({
    className: "pc-step-feedback",
  });
  let readinessHost;
  const ready = el("dialog", "pc-ready conversion-ready-dialog");
  ready.setAttribute("aria-label", "Ready for the original question?");
  ready.append(el("p", "", "Ready for the original question?"));
  const readyActions = el("div", "conversion-ready-actions");
  readyActions.append(
    button("No, try again", () => fresh()),
    button("Yes, I’m ready", () =>
      root.dispatchEvent(new CustomEvent("teaching-close", { bubbles: true })),
    ),
  );
  ready.append(readyActions);
  const readiness = createAreaReadinessStrip(ready, () => readinessHost, {
    isMobile: () => true,
  });
  const completion = createCompletionPrompt(
    ready,
    () => active && !destroyed && solved && view === "stepwise",
    {
      delay: 1000,
      modal: false,
      beforeShow: readiness.beforeShow,
      afterShow: readiness.afterShow,
    },
  );
  on(ready, "cancel", (event) => {
    event.preventDefault();
    fresh();
  });
  let wall,
    bricks = [],
    equation,
    calculation,
    feedback,
    fire,
    minus,
    plus,
    retry,
    editor,
    input,
    releaseAudio,
    stage;
  const independent = () => level === 5;
  const correct = () => percentageAmount(round.total, round.target);
  const amount = () => percentageAmount(round.total, format(selected));
  let prompt, promptNodes;
  function restorePrompt() {
    if (promptNodes && prompt) { prompt.replaceChildren(...promptNodes); prompt.classList.remove('pc-focused-prompt'); }
    promptNodes = undefined; prompt = undefined;
  }
  function focusPrompt() {
    restorePrompt();
    prompt = root.closest('.paper-question')?.querySelector('.paper-prompt');
    if (!prompt) return;
    promptNodes = [...prompt.childNodes];
    const text = round.total === originalRound.total && round.target === originalRound.target
      ? prompt.textContent : `Find ${round.target}% of ${round.total}.`;
    const parts = text.split(/(\d+(?:\.\d+)?%?)/g);
    prompt.replaceChildren(...parts.map(part => {
      const node = el('span', /^\d/.test(part) ? 'pc-vital-fact' : 'pc-muted-prose', part);
      if (part.includes('%')) node.classList.add('pc-percent');
      return node;
    }));
    prompt.classList.add('pc-focused-prompt');
  }
  function stopHold() {
    clearTimeout(holdTimer);
    clearInterval(holdInterval);
  }
  function stop() {
    volley.cancel();
    sound.stop();
    stepFeedback.cancel();
    completion.cancel();
    readiness.cancel();
    stage?.querySelectorAll(".pc-fragment").forEach(n=>n.remove());
    generation++;
    stopHold();
    busy = false;
    root.classList.remove("pc-firing");
    editor?.close();
  }
  function paint(quantity, broken = false) {
    const bounded = Math.min(round.total, Math.max(0, Number(quantity)));
    bricks.forEach((brick, i) => {
      const fraction = Math.max(0, Math.min(1, bounded - i));
      brick.style.setProperty("--fill", `${format(fraction * 100)}%`);
      brick.classList.toggle("pc-broken", broken && fraction > 0);
      brick.classList.toggle("pc-selected", fraction > 0);
      brick.classList.toggle("pc-partial", fraction > 0 && fraction < 1);
    });
    wall.setAttribute(
      "aria-label",
      `${round.total} bricks. ${format(bounded)} units ${broken ? "broken" : "coloured"}.`,
    );
  }
  function expression(node, percent) {
    node.replaceChildren(
      el("span", "pc-percent", `${percent}%`),
      el("span", "pc-operator", "of"),
      el("span", "pc-total", String(round.total)),
      el("span", "pc-operator", "="),
      el("span", "pc-result", percentageAmount(round.total, percent)),
    );
  }
  function fractionExpression(
    node,
    percent,
    total = round.total,
    result = percentageAmount(total, percent),
  ) {
    const fraction = el("span", "pc-fraction");
    fraction.append(el("span", "pc-percent", percent), el("span", "", "100"));
    node.replaceChildren(
      fraction,
      el("span", "pc-operator", "×"),
      el("span", "pc-total", String(total)),
      el("span", "pc-operator", "="),
      el("span", "pc-result", result),
    );
    node.setAttribute(
      "aria-label",
      `${percent} divided by 100 times ${total} equals ${result || "blank"}`,
    );
  }
  function render() {
    if (!wall) return;
    const percent = independent() ? round.target : format(selected);
    const hide = independent() && !solved;
    equation.hidden = hide;
    calculation.hidden = hide;
    // Do not populate hidden answers: Level 5 reveals the calculation only once solved.
    if (hide) {
      equation.replaceChildren();
      calculation.replaceChildren();
      calculation.removeAttribute("aria-label");
    } else {
      expression(equation, percent);
      fractionExpression(calculation, percent);
    }
    equation.setAttribute("aria-hidden", String(hide));
    calculation.setAttribute("aria-hidden", String(hide));
    root.dataset.selected = format(selected);
    plus.disabled = busy || solved || selected >= 100;
    minus.disabled = busy || solved || selected <= 0;
    fire.disabled =
      busy ||
      solved ||
      (independent() && (revealed || !input?.value.trim()));
    editor?.setLocked(busy || revealed);
    retry.hidden = !independent() || !revealed || solved;
    if (!busy) {
      const shownAmount = independent()
        ? revealed
          ? solved
            ? correct()
            : attempt
          : 0
        : amount();
      paint(shownAmount, solved);
      bricks.forEach((brick, i) => {
        const incorrectFill =
          independent() && revealed && !solved
            ? Math.max(0, Math.min(1, Number(attempt) - i))
            : 0;
        const start = 0;
        const end = incorrectFill;
        brick.style.setProperty("--difference-start", `${start * 100}%`);
        brick.style.setProperty(
          "--difference-width",
          `${(end - start) * 100}%`,
        );
        brick.classList.toggle(
          "pc-shortfall",
          false,
        );
        brick.classList.toggle(
          "pc-excess",
          incorrectFill > 0,
        );
      });
    }
  }
  function adjust(direction) {
    if (busy || solved || independent() || !active) return;
    // Ten-point stops plus the exact target preserve a short, reversible path.
    const stops = [...new Set([0, ...Array.from({length:10}, (_,i)=>(i+1)*10), Number(round.target)])].sort((a,b)=>a-b);
    const lowerStops = direction < 0 ? stops.filter(n => n < selected) : [];
    selected = direction > 0
      ? (stops.find(n => n > selected) ?? 100)
      : (lowerStops.length ? lowerStops[lowerStops.length - 1] : 0);
    feedback.textContent = "";
    render();
  }
  function bindHold(node, direction) {
    // Act on contact, not Safari's later synthesized click. A slight finger
    // movement or viewport change must not swallow the first adjustment.
    on(node, "click", (event) => {
      if (event.detail === 0) adjust(direction); // Keyboard/assistive activation.
    });
    on(node, "pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary || node.disabled) return;
      stopHold();
      node.setPointerCapture?.(event.pointerId);
      adjust(direction);
      holdTimer = setTimeout(() => {
        holdInterval = setInterval(() => adjust(direction), 65);
      }, 300);
    });
    on(node, "pointerup", stopHold);
    on(node, "pointercancel", stopHold);
    on(node, "lostpointercapture", stopHold);
    on(node, "pointerleave", (event) => {
      if (!node.hasPointerCapture?.(event.pointerId)) stopHold();
    });
  }
  function fresh() {
    stop();
    selected = 0;
    solved = false;
    revealed = false;
    attempt = "";
    editor?.setValue("");
    feedback.textContent = "";
    root.classList.remove("pc-success");
    if (active) sound.start();
    render();
  }
  async function fireShot() {
    if (busy || solved || !active || (independent() && revealed)) return;
    let entered;
    if (independent()) {
      attempt = input.value.trim();
      entered = decimal(attempt);
      if (!entered) {
        feedback.textContent =
          "Enter a nonnegative number, such as 17 or 8.75.";
        editor.element.focus();
        return;
      }
    }
    stopHold();
    editor?.close();
    busy = true;
    render();
    const firedAmount = independent() ? attempt : amount();
    paint(firedAmount);
    sound.start();
    root.classList.add("pc-firing");
    const token = ++generation;
    const finished = await volley.shoot(stage, bricks, firedAmount);
    if (!finished || destroyed || token !== generation) return;
    root.classList.remove("pc-firing");
    busy = false;
    revealed = true;
    const expected = decimal(correct());
    const compare = independent()
      ? Number(attempt) - Number(correct())
      : Number(selected) - Number(round.target);
    solved = independent()
      ? entered.normalized === expected.normalized
      : compare === 0;
    if (solved) sound.stop();
    if (independent()) {
      feedback.textContent = solved
        ? words("correct", "Correct!")
        : words("incorrect", "Incorrect.");
    } else {
      const relation = solved
        ? words("correct", "Correct!")
        : compare < 0
          ? words("tooLittle", "Too little.")
          : words("tooMuch", "Too much.");
      const result = el("strong", "pc-feedback-equation", `${format(selected)}% of ${round.total} = ${amount()}`);
      feedback.replaceChildren(
        `${relation} `,
        result,
        ".",
        solved ? "" : ` ${words("retryHint", "Adjust the percentage and fire again.")}`,
      );
    }
    root.classList.toggle("pc-success", solved);
    render();
    stepFeedback.show(solved, {
      persist: solved,
      onLanded: () => {
        if (active && solved) completion.schedule();
      },
    });
  }
  function build() {
    editor?.close();
    const header = el("header", "pc-header");
    const close = button(
      "×",
      () =>
        root.dispatchEvent(
          new CustomEvent("teaching-close", { bubbles: true }),
        ),
      "pc-close",
    );
    close.setAttribute("aria-label", "Back to question");
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="5" stroke-linecap="square" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    const audioButton = button('', () => { sound.toggle(); updateAudio(); }, 'conversion-audio-fab pc-audio');
    audioButton.classList.remove('pc-button');
    function updateAudio() {
      audioButton.setAttribute('aria-label', sound.muted ? 'Unmute audio' : 'Mute audio');
      audioButton.setAttribute('aria-pressed', String(sound.muted));
      audioButton.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${sound.muted?'<path stroke="#d32f2f" d="m16 9 5 6m0-6-5 6"/>':'<path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'}</svg>`;
    }
    updateAudio(); header.append(close);
    root.dataset.level = String(level);
    stage = el("div", "pc-stage");
    const cannon = el("div", "pc-cannon");
    cannon.setAttribute("aria-hidden", "true");
    cannon.innerHTML = '<svg viewBox="0 0 240 240"><g stroke="#101313" stroke-width="8" stroke-linejoin="round"><path d="M22 209L51 175 68 190 36 223Z" fill="#535b5d"/><path d="M42 162Q19 110 62 80Q80 65 107 69L177 17 218 57 171 130Q162 169 115 185Q63 207 42 162Z" fill="#4b5356"/><path d="M170 13Q178 5 186 13L226 53Q234 63 225 71Q218 77 210 69L171 30Q164 22 170 13Z" fill="#626a6c"/><circle cx="119" cy="166" r="57" fill="#ac643e"/><circle cx="119" cy="166" r="42" fill="#454e50"/><path d="M110 125H128V207H110Z M78 157H160V175H78Z" fill="#995b3b"/><circle cx="119" cy="166" r="18" fill="#b97046"/></g></svg><span class="pc-muzzle"></span>';
    const teaching = el("div", "pc-teaching");
    const task = el("p", "pc-task", `${round.target}% of ${round.total}`);
    equation = el("div", "pc-equation");
    calculation = el("div", "pc-calculation");
    const controls = el("div", "pc-controls");
    const keypadRegion = el("div", "pc-keypad-region");
    keypadRegion.setAttribute("aria-hidden", "true");
    minus = button("−");
    minus.setAttribute(
      "aria-label",
      "Decrease percentage",
    );
    plus = button("+");
    plus.setAttribute(
      "aria-label",
      "Increase percentage",
    );
    minus.classList.add("pc-minus");
    plus.classList.add("pc-plus");
    minus.hidden = plus.hidden = independent();
    bindHold(minus, -1);
    bindHold(plus, 1);
    const entry = el("div", "pc-entry");
    entry.hidden = !independent();
    entry.append(
      el("label", "pc-entry-label", words("answerPrompt", "How many units?")),
    );
    input = el("input", "");
    input.type = "hidden";
    input.dataset.expectedAnswer = "0.01";
    editor = mountMathInput(input, {
      ariaLabel: "How many units?",
      onSubmit: fireShot,
      keypadRegion: () => keypadRegion,
    });
    on(input, "input", render);
    editor.keypad.classList.add("pc-keypad");
    entry.append(input, editor.element);
    fire = button("", fireShot, "pc-fire");
    fire.setAttribute("aria-label", "Fire");
    fire.title = "Fire";
    fire.innerHTML = '<svg viewBox="0 0 48 40" aria-hidden="true"><circle cx="24" cy="22" r="14" fill="#30383d" stroke="#101313" stroke-width="2"/><path d="M15 18Q17 12 24 12" fill="none" stroke="#aab6bb" stroke-width="3" stroke-linecap="round"/></svg>';
    controls.append(minus, fire, plus, keypadRegion);
    teaching.append(task, equation, calculation, entry, controls);
    const wallPanel = el("div", "pc-wall-panel");
    wall = el("div", "pc-wall");
    wall.setAttribute("role", "img");
    const columns = Math.min(
      round.total,
      Math.ceil(Math.sqrt(round.total * 1.2)),
    );
    wall.style.setProperty("--columns", columns);
    wall.style.setProperty("--rows", Math.ceil(round.total / columns));
    bricks = [];
    for (let i = 0; i < round.total; i++) {
      const brick = el("span", "pc-brick");
      brick.setAttribute("aria-hidden", "true");
      // Index order is also fill/break order: left to right, bottom to top.
      brick.style.gridRow = String(Math.ceil(round.total / columns) - Math.floor(i / columns));
      brick.style.gridColumn = String(i % columns + 1);
      brick.style.setProperty("--delay", `${Math.min(i * 2, 250)}ms`);
      brick.append(el("span", "pc-brick-fill"));
      wall.append(brick);
      bricks.push(brick);
    }
    wallPanel.append(wall);
    stage.append(cannon, teaching, wallPanel);
    feedback = el("p", "pc-feedback");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    const footer = el("footer", "pc-footer area-readiness-strip");
    readinessHost = footer;
    retry = button("Try again", fresh);
    footer.append(retry, ready);
    root.replaceChildren(header, stage, feedback, footer, audioButton);
    releaseAudio?.();
    releaseAudio=dockGameAudio(audioButton,root);
    render();
    if (root.dataset.guidedHelp === "true") focusPrompt();
  }
  function documentView(workbook) {
    const panel = el(
      "section",
      `pc-document ${workbook ? "teach-workbook" : "teach-solution"}`,
    );
    panel.append(
      el("h3", "", `Find ${originalRound.target}% of ${originalRound.total}`),
    );
    panel.append(
      el(
        "p",
        "",
        words("documentHint", "{percent}% means {percent} out of every 100.", {
          percent: originalRound.target,
        }),
      ),
    );
    const calculation = el("p", "pc-calculation");
    fractionExpression(
      calculation,
      originalRound.target,
      originalRound.total,
      workbook ? "________" : percentageAmount(originalRound.total, originalRound.target),
    );
    panel.append(calculation);
    return panel;
  }
  on(root, "keydown", (event) => {
    if (event.key === "Tab" && root.dataset.guidedHelp === "true") {
      const nodes = [
        ...root.querySelectorAll(
          "button:not(:disabled),select:not(:disabled),math-field",
        ),
      ].filter((n) => n.getClientRects().length);
      const first = nodes[0],
        last = nodes.length ? nodes[nodes.length - 1] : undefined;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === root)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    if (event.target.closest("math-field,select,input")) return;
    if (
      ["ArrowRight", "ArrowUp", "+", "ArrowLeft", "ArrowDown", "-"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
      adjust(["ArrowRight", "ArrowUp", "+"].includes(event.key) ? 1 : -1);
    } else if (event.key === "Enter" && !event.target.closest("button")) {
      event.preventDefault();
      fireShot();
    }
  });
  on(window, "blur", stopHold);
  on(document, "visibilitychange", () => {
    if (document.hidden) {
      stop();
      render();
    }
  });
  root.tabIndex = 0;
  return {
    element: root,
    setView(nextView) {
      if (destroyed) return;
      if (view === nextView) {
        active = nextView === "stepwise";
        // Background question loading pauses and resumes the visible activity.
        if (active && root.dataset.guidedHelp === "true") focusPrompt();
        return;
      }
      restorePrompt();
      stop();
      view = nextView;
      root.dataset.view = view;
      active = view === "stepwise";
      if (active) build();
      else root.replaceChildren(documentView(view === "workbook"));
    },
    startHelp() {
      if (destroyed) return;
      if (view !== "stepwise") this.setView("stepwise");
      active = true;
      root.dataset.guidedHelp = "true";
      focusPrompt();
      sound.start();
      root.focus({ preventScroll: true });
    },
    pause() {
      restorePrompt();
      active = false;
      stop();
      render();
    },
    closeHelp() {
      this.pause();
      return Promise.resolve();
    },
    destroy() {
      if (destroyed) return;
      stop();
      restorePrompt();
      releaseAudio?.();
      sound.destroy();
      destroyed = true;
      listeners.splice(0).forEach(([node, type, fn]) =>
        node.removeEventListener(type, fn),
      );
      root.replaceChildren();
    },
  };
}
