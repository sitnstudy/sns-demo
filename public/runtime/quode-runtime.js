import { mountMathInput } from './math-input.js';
import "./toolbar-tooltips.js";
import { questionActions, renderQuestion, questionURL, attachQuestionShare } from "./question-sharing.js";
import { installDemoRecorder } from "./demo-recorder.js";

const pathParts = window.location.pathname.split("/").filter(Boolean);
const quodeName = decodeURIComponent(pathParts[0] || "");
const activeSessions = new Set();
let savedStartingQuestions = [];
function findStartingQuestion(value) {
  if (typeof value !== 'string') return undefined;
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  return savedStartingQuestions.find(item => normalize(item.question) === normalize(value));
}

function apiPath(resource = "") {
  if (!quodeName) throw new Error("The URL does not identify a Quode");
  return `/api/quodes/${encodeURIComponent(quodeName)}${resource}`;
}

async function request(path, options) {
  const response = await fetch(path, options);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("The local Quode host returned a non-JSON response");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}

function optionValueCount(argument) {
  if (argument == null) return 0;
  return [...argument.matchAll(/<([^>]+)>/g)].length || 1;
}

function optionsFromLocation(optionDefinitions, search = window.location.search) {
  const parameters = new URLSearchParams(search);
  const options = {};
  optionDefinitions.forEach((option) => {
    if (!parameters.has(option.key)) return;
    const count = optionValueCount(option.argument);
    if (count === 0) {
      const value = parameters.get(option.key);
      if (value !== "false" && value !== "0") options[option.key] = true;
      return;
    }
    const values = parameters.getAll(option.key);
    if (values.length === count && values.every(Boolean)) {
      options[option.key] = count === 1 ? values[0] : values;
    }
  });
  if (parameters.get("generation") === "preset") {
    if (!options["--starting-question"]) {
      const preset = savedStartingQuestions[0];
      if (!preset?.question?.trim()) throw new Error("This Quode has no default preset question.");
      options["--starting-question"] = JSON.stringify(preset);
    }
    options["--count"] = "1";
  }
  if (options['--starting-question'] && savedStartingQuestions.length) {
    const saved = findStartingQuestion(options['--starting-question']);
    if (saved) options['--starting-question'] = JSON.stringify(saved);
  }
  return options;
}

function optionsToSearch(options) {
  const saved = findStartingQuestion(options['--starting-question']);
  if (saved) options = { ...options, '--starting-question': JSON.stringify(saved) };
  const parameters = new URLSearchParams();
  const current = new URLSearchParams(window.location.search);
  ["presentation", "answer-mode", "show-tags", "show-source", "layout", "check", "show-share", "show-solution"].forEach((key) => {
    if (current.has(key)) parameters.set(key, current.get(key));
  });
  Object.entries(options).forEach(([key, value]) => {
    if (value === true) parameters.set(key, "true");
    else if (Array.isArray(value)) value.forEach((item) => parameters.append(key, item));
    else parameters.set(key, String(value));
  });
  return parameters.toString();
}

function renderMath(target, source, displayMode = false) {
  if (!window.katex) {
    target.textContent = source;
    return;
  }
  try {
    window.katex.render(source, target, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  } catch {
    target.textContent = source;
  }
}

function presentationOptions(search = window.location.search) {
  const parameters = new URLSearchParams(search);
  return {
    questions: parameters.get("presentation") === "questions",
    multipleChoice: parameters.get("answer-mode") === "multiple-choice",
    showTags: parameters.get("show-tags") === "true",
    showSource: parameters.get("show-source") === "true",
  };
}

function questionMetadata(question) {
  const settings = presentationOptions();
  const details = document.createElement("div");
  details.className = "question-metadata";
  if (settings.showTags) (question.tags || []).forEach((tag) => {
    const badge = document.createElement("span");
    badge.className = "tag";
    badge.textContent = tag;
    details.append(badge);
  });
  if (settings.showSource && question.source) {
    const source = document.createElement("span");
    source.className = "question-source";
    source.textContent = question.source;
    details.append(source);
  }
  const actions = questionActions(question, location.search, { share: false });
  if (actions.childElementCount) details.append(actions);
  details.hidden = !details.childElementCount;
  return details;
}

function mountSetupInput(input, container, metadata, option) {
  input.type = 'hidden';
  const label = input.getAttribute('aria-label');
  const numeric = ['--count','--digits','--terms','--max-bricks','--rows','--selected-rows'].includes(option.key);
  if (numeric) {
    input.dataset.expectedAnswer = '0';
    const editor = mountMathInput(input,{ariaLabel:label});
    editor.element.classList.add('setup-keyboard-input');
    editor.element.style.width = '110px'; editor.element.style.maxWidth = '100%';
    // A custom math field inside the option label must not toggle its checkbox.
    editor.element.addEventListener('click',event => event.preventDefault());
    container.append(editor.element);
    const sync = () => editor.setLocked(input.disabled);
    new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['disabled']});
    input.focus = () => editor.focus(); sync();
    return;
  }
  const select = document.createElement('select'); select.setAttribute('aria-label',label);
  select.style.maxWidth = '100%'; select.style.minWidth = '0';
  container.style.minWidth = '0'; container.style.maxWidth = '100%';
  select.append(new Option('Choose…',''));
  const starting = option.key === '--starting-question';
  const entries = metadata.startingQuestions || [];
  if (starting) savedStartingQuestions = entries;
  const choices = starting ? entries.map(entry => entry.question.replace(/[\r\n]+/g,' ')) : metadata.setupChoices?.[option.key] || [];
  choices.forEach(value => select.append(new Option(value,value)));
  const sync = () => { select.disabled = input.disabled; };
  new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['disabled']});
  select.addEventListener('change',() => { input.value = select.value; input.dispatchEvent(new Event('input',{bubbles:true})); });
  input.focus = () => select.focus(); container.append(select); sync();
}
function attachStartingQuestions(input, container, metadata) {
  mountSetupInput(input, container, metadata, {key:'--starting-question'});
}

async function trace(message, context = {}, level = "trace") {
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([, value]) =>
      value == null || ["string", "number", "boolean"].includes(typeof value)),
  );
  console[level === "error" ? "error" : "info"]("[Quode]", message, safeContext);
  try {
    await fetch("/api/client-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, message, context: safeContext }),
      keepalive: true,
    });
  } catch {
    // Diagnostics must never interrupt an exercise.
  }
}

async function generate(options = {}) {
  const saved = findStartingQuestion(options['--starting-question']);
  if (saved) options = { ...options, '--starting-question': JSON.stringify(saved) };
  const exercise = await request(apiPath("/exercises"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ options }),
  });
  activeSessions.add(exercise.sessionId);
  return exercise;
}

async function finish(sessionId) {
  if (!sessionId || !activeSessions.has(sessionId)) return false;
  const response = await fetch(`/api/exercises/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  activeSessions.delete(sessionId);
  if (!response.ok && response.status !== 404) throw new Error(`Could not clear exercise (${response.status})`);
  return response.ok;
}

function setupPath() {
  return `/${encodeURIComponent(quodeName)}/`;
}

function practicePath(options = {}) {
  const search = optionsToSearch(options);
  return `/${encodeURIComponent(quodeName)}/practice${search ? `?${search}` : ""}`;
}

function printPath(options = {}) {
  const search = optionsToSearch(options);
  return `/${encodeURIComponent(quodeName)}/print${search ? `?${search}` : ""}`;
}

window.addEventListener("error", (event) => {
  trace("Uncaught browser error", {
    error: event.error?.message || event.message,
    source: event.filename || "unknown",
    line: event.lineno || 0,
  }, "error");
});

window.addEventListener("unhandledrejection", (event) => {
  trace("Unhandled promise rejection", {
    error: event.reason instanceof Error ? event.reason.message : String(event.reason),
  }, "error");
});

window.addEventListener("pagehide", () => {
  activeSessions.forEach((sessionId) => {
    fetch(`/api/exercises/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  });
  activeSessions.clear();
});

export const quode = Object.freeze({
  name: quodeName,
  getMeta: async () => {
    const meta = await request(apiPath());
    savedStartingQuestions = meta.startingQuestions || [];
    return meta;
  },
  generate,
  finish,
  renderMath,
  renderQuestion,
  questionURL,
  attachQuestionShare,
  presentationOptions,
  questionMetadata,
  attachStartingQuestions,
  mountSetupInput,
  trace,
  optionValueCount,
  optionsFromLocation,
  optionsToSearch,
  setupPath,
  practicePath,
  printPath,
});

window.quode = quode;
installDemoRecorder();
