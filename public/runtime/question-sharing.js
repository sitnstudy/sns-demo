import { renderGraph } from './graph-renderer.js';
import { renderTable } from './table-renderer.js';
const isPsatPage = () => Boolean(document.querySelector('script[data-app="psat"]'));
const psatScope = () => document.querySelector('script[data-app="psat"]')?.dataset.scope || '/psat-player/';

// Portable records contain data only. Answers and worked steps are recomputed.
export function questionURL(question) {
  const record = question.portableQuestion;
  if (!record || record.formatVersion !== 1 || !/^[a-z0-9_-]+$/.test(record.quode)) {
    throw new Error('This question does not provide a supported sharing record.');
  }
  const isPSAT = isPsatPage();
  const url = new URL(isPSAT ? psatScope() : `/${encodeURIComponent(record.quode)}/practice`, location.origin);
  if (isPSAT) url.searchParams.set('items', JSON.stringify([{ quode: record.quode, instruction: question.instruction, options: { '--starting-question': JSON.stringify(record) } }]));
  else url.searchParams.set('--starting-question', JSON.stringify(record));
  url.searchParams.set('answer-mode', new URLSearchParams(location.search).get('answer-mode') || 'typed');
  if (isPSAT && ['teach','solution'].includes(new URLSearchParams(location.search).get('mode'))) {
    url.searchParams.set('mode','solution');
    url.searchParams.set('view',new URLSearchParams(location.search).get('view') || ({solution:'answer'}[new URLSearchParams(location.search).get('teaching')] || new URLSearchParams(location.search).get('teaching')) || 'stepwise');
    for (const key of ['instructions','hints','answers','step-separator']) {
      const value = new URLSearchParams(location.search).get(key);
      if (value !== null) url.searchParams.set(key,value);
    }
  }
  if (isPSAT) {
    if (!url.searchParams.has('mode')) url.searchParams.set('mode', 'exam');
  } else url.searchParams.set('show-solution', 'true');
  return url.href;
}

// Emphasize authored plain-language quantities, never HTML or maths widgets.
export function emphasizeQuantities(element, units = {}, groupUnit = null) {
  if (!Object.keys(units).length) return element;
  const groupUnits = ['yard','foot','kilometre','kilogram','pound','hour','litre','dollar','two-dollar-coin','five-cent-coin','two-square-metre-patch','pair','triple'];
  const groupLabels = (groupUnit ? [groupUnit] : groupUnits).flatMap(key => units[key] ? Object.values(units[key]) : []);
  if (groupUnit) groupLabels.push(groupUnit, groupUnit + 's', ...(groupUnit === 'foot' ? ['feet'] : []));
  const pattern = /(?<![\d.,/])[+-]?\d[\d,]*(?:\.\d+)?(?:\/\d+)?/gu;
  const nodes = []; let text = '';
  const collect = node => {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push({node, start:text.length, end:text.length + node.textContent.length});
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches('strong, .conversion-quantity, math-field, .katex, script, style, input, textarea')) {
        // A barrier prevents a number before a widget joining units after it.
        text += '\u0000';
      } else for (const child of node.childNodes) collect(child);
    }
  };
  for (const child of element.childNodes) collect(child);
  for (const match of [...text.matchAll(pattern)].reverse()) {
    const start = nodes.find(entry => entry.end > match.index);
    const endOffset = match.index + match[0].length;
    const end = nodes.find(entry => entry.end >= endOffset);
    if (!start || !end) continue;
    const boundaries = [start.node.parentElement, end.node.parentElement];
    const range = document.createRange();
    range.setStart(start.node, match.index-start.start); range.setEnd(end.node, endOffset-end.start);
    const strong = document.createElement('span'); strong.className = 'conversion-quantity';
    const suffix = text.slice(endOffset).trimStart();
    const isGroup = start.node.parentElement.closest('.conversion-count') || groupLabels.some(label => suffix.startsWith(label) && !/[a-zA-Z]/.test(suffix.charAt(label.length)));
    strong.classList.add(isGroup ? 'conversion-group-number' : 'conversion-number');
    strong.append(range.extractContents()); range.insertNode(strong);
    for (const boundary of boundaries) {
      if (boundary !== element && boundary.tagName === 'SPAN' && !boundary.textContent && !boundary.children.length) boundary.remove();
    }
  }
  return element;
}

export function renderQuestion(question, className = '', displayMode = true) {
  const element = document.createElement('div');
  element.className = className;
  if (question.questionFormat === 'text') {
    if (question.teaching?.graph) {
      element.append(renderGraph(question.teaching.graph));
      const text = document.createElement('div'); text.textContent = question.question; element.append(text);
    } else if (question.teaching?.table) {
      element.append(renderTable(question.teaching.table));
      const text = document.createElement('div');
      text.textContent = question.question.replaceAll('□', '______');
      element.append(text);
    } else if (question.teaching?.equation) {
      // Equation questions keep their authored prose in the PSAT font and use
      // the same KaTeX maths as their animated working, without interpreting HTML.
      for (const [index, part] of question.question.split('$').entries()) {
        if (index % 2 && window.katex) {
          const span = document.createElement('span');
          window.katex.render(part, span, {throwOnError:false, trust:false});
          element.append(span);
        } else element.append(document.createTextNode(part));
      }
    } else element.textContent = question.question.replaceAll('□', '______');
    const data = question.portableQuestion?.data;
    const groupUnit = data ? (Number(data.value) > Number(question.answer) ? data.to : data.from) : null;
    if (question.teaching?.highlightQuantities !== false) emphasizeQuantities(element, question.teaching?.units, groupUnit);
    element.style.whiteSpace = 'pre-wrap';
    element.style.overflowWrap = 'anywhere';
  } else if (window.katex) {
    window.katex.render(question.question.replace(/^\$|\$$/g, ''), element, { displayMode, throwOnError: false, trust: false, strict: 'ignore' });
  } else element.textContent = question.question;
  return element;
}

function solutionDetails(question) {
  const details = document.createElement('details');
  details.className = 'shared-solution';
  const summary = document.createElement('summary');
  summary.textContent = 'Step-by-step solution';
  details.append(summary);
  const list = document.createElement('ol');
  for (const step of question.steps || []) {
    const item = document.createElement('li');
    const intent = step.intent.includes('\\') ? renderQuestion({question: step.intent}) : document.createElement('p');
    if (!step.intent.includes('\\')) intent.textContent = step.intent;
    const hint = step.hint.includes('\\') ? renderQuestion({question: step.hint}) : document.createElement('p');
    if (!step.hint.includes('\\')) hint.textContent = step.hint;
    const result = renderQuestion({ question: step.result });
    item.append(intent, hint, result); list.append(item);
  }
  details.append(list);
  return details;
}

function installSharingStyles() {
  if (document.querySelector('style[data-question-sharing]')) return;
  const style = document.createElement('style'); style.dataset.questionSharing = '';
  style.textContent = `
    .question-share-actions{display:inline-flex;vertical-align:middle;position:relative;margin:0 0 0 .4rem;white-space:normal;font:14px/1.4 system-ui,sans-serif}
    .copy-question-button{display:inline-grid;place-items:center;flex:none;width:44px;height:44px;padding:8px;border:0;border-radius:8px;background:transparent;color:#202020;cursor:pointer;vertical-align:middle}
    .copy-question-button svg{width:26px;height:26px;display:block;pointer-events:none}
    .copy-question-button:hover{background:rgba(0,0,0,.07)}
    .copy-question-button:focus-visible{outline:3px solid #2263a8;outline-offset:2px}
    .question-share-actions [role=status]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    .question-share-actions .share-feedback{position:absolute;right:0;top:100%;z-index:20;min-width:190px;max-width:280px;padding:10px;background:white;color:#202020;box-shadow:0 3px 16px #0003;border-radius:8px;overflow-wrap:anywhere}
    .question-share-actions textarea{display:block;width:100%;min-height:80px;margin-top:8px;box-sizing:border-box;font:12px/1.4 system-ui,sans-serif}
    .question-with-share>.katex-display{display:inline-block;vertical-align:middle}
    .question-solution-actions{display:block;max-width:100%;min-width:0;overflow-wrap:anywhere}
    .shared-solution{margin:.6rem 0;text-align:left;max-width:100%;min-width:0;white-space:normal}
    .shared-solution summary{cursor:pointer}.shared-solution li{margin:.8rem 0}.shared-solution .katex-display{overflow:auto}
    @media print{.question-share-actions,.shared-solution{display:none!important}}
  `;
  document.head.append(style);
}

export function questionActions(question, search = location.search, { share = true, solution = true, urlFactory = () => questionURL(question) } = {}) {
  installSharingStyles();
  const actions = document.createElement(share ? 'span' : 'div');
  actions.className = share ? 'question-share-actions' : 'question-solution-actions';
  const parameters = new URLSearchParams(search);
  if (share && parameters.get('show-share') !== 'false' && question.portableQuestion) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'copy-question-button';
    button.setAttribute('aria-label', 'Share question'); button.title = 'Share question';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', 'M12 15V2m-4 4 4-4 4 4M7 10H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2');
    svg.append(path); button.append(svg);
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    let timer;
    const feedback = (message, url) => {
      clearTimeout(timer); actions.querySelector('.share-feedback')?.remove();
      status.textContent = message;
      const panel = document.createElement('span'); panel.className = 'share-feedback'; panel.textContent = message;
      actions.append(panel);
      if (url) {
        const input = document.createElement('textarea'); input.readOnly = true; input.setAttribute('aria-label', 'Question link');
        input.value = url; panel.append(input); input.focus(); input.select();
      } else timer = setTimeout(() => panel.remove(), 2500);
    };
    button.addEventListener('click', async () => {
      let url;
      try { url = urlFactory(); }
      catch { feedback('This question could not be shared.'); return; }
      actions.querySelector('.share-feedback')?.remove(); status.textContent = '';
      if (typeof navigator.share === 'function') {
        try {
          // Invoke before any await, preserving the tap's transient user activation.
          await navigator.share({ title: isPsatPage() ? 'PSAT question' : 'Quode question', url });
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        feedback('Question link copied');
      } catch { feedback('Copy the selected question link', url); }
    });
    actions.append(button, status);
  }
  if (solution && parameters.get('show-solution') === 'true' && question.steps?.length) actions.append(solutionDetails(question));
  return actions;
}

export function attachQuestionShare(question, prompt) {
  const actions = questionActions(question, location.search, { solution: false });
  if (actions.childElementCount) {
    const math = prompt.matches('.guided-math') ? prompt : prompt.querySelector('.guided-math') || prompt;
    math.classList.add('question-with-share'); math.append(actions);
  }
  return prompt;
}
