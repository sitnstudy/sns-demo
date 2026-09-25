import { renderFrequencyProse } from './table-renderer.js';
import { mountOrientationPrompt } from './orientation-prompt.js';
import "./toolbar-tooltips.js";
import { renderQuestion } from "./question-sharing.js";
import { conversionModel } from './conversion-teaching.js';
import { mountQuodeTeaching } from './quode-teaching.js';
import { createFlowerCelebration } from './flower-celebration.js';
import { mountMathInput } from './math-input.js';
import { answersEquivalent as defaultEquivalent } from './questionnaire-answer.js';
import { answerExample } from './answer-example.js';
import { positionResultIcon } from './step-feedback.js';

export function presentationOptions(search = window.location.search) {
  const params = new URLSearchParams(search);
  const requestedMode = params.get('mode');
  const mode = ({teach:'learn', solution:'teacher', practice:'learn', test:'exam', preset:'exam'})[requestedMode]
    || (['exam', 'learn', 'teacher'].includes(requestedMode) ? requestedMode : 'exam');
  const view = params.get('view') || params.get('teaching');
  return { mode,
    teaching: mode === 'learn' ? 'stepwise' : view === 'workbook' ? 'workbook' : 'questions',
    include: view === 'workbook' ? 'none' : params.get('include') === 'answers' ? 'answers' : 'solutions',
    layout: mode === 'exam' ? 'grid' : mode === 'learn' ? 'single' : 'list',
    answerMode: mode === 'exam' ? 'multiple-choice' : 'typed',
    check: 'submit',
    showTags: mode !== 'exam' && params.get('show-tags') === 'true', showSource: mode !== 'exam' && params.get('show-source') === 'true' };

}
function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text != null) result.textContent = text;
  return result;
}
function math(source, fullSizeFractions = false) {
  const result = node('span', 'paper-math');
  if (/^[+−-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)$/.test(String(source).trim())) { result.textContent = String(source); return result; }
  let latex = String(source).trim();
  let tallOrderedPair = false;
  if (fullSizeFractions) {
    // Keep numerator/denominator digits readable at the surrounding text size.
    // Scale an ordered pair's outer parentheses around the complete fraction.
    if (latex.startsWith('(') && latex.endsWith(')') && latex.includes(',') && /\\(?:d|t)?frac/.test(latex)) {
      tallOrderedPair = true;
      latex = `\\left(${latex.slice(1, -1)}\\right)`;
    }
    latex = `\\displaystyle ${latex}`;
  }
  if (window.katex) window.katex.render(latex, result, { throwOnError: false, trust: false, strict: 'ignore' });
  else result.textContent = source;
  if (tallOrderedPair && window.katex) {
    // Replace only the visual outer glyphs. KaTeX's accessible MathML and the
    // full-size fraction remain intact. These narrow curves have straight stems
    // like the printed PSAT parentheses, rather than the font's rounded arcs.
    const pair = result.querySelector('.katex-html .base > .minner');
    for (const [side, selector] of [['left', '.mopen'], ['right', '.mclose']]) {
      const delimiter = pair?.querySelector(`:scope > ${selector} > .delimsizing`);
      if (!delimiter) continue;
      const bracket = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      bracket.setAttribute('viewBox', '0 0 16 100');
      bracket.setAttribute('preserveAspectRatio', 'none');
      bracket.setAttribute('aria-hidden', 'true');
      bracket.setAttribute('focusable', 'false');
      bracket.style.cssText = 'position:absolute;inset:0;display:block;width:100%;height:100%;overflow:visible';
      const curve = document.createElementNS(bracket.namespaceURI, 'path');
      curve.setAttribute('d', 'M13 0 C4 3 3 16 3 32 L3 68 C3 84 4 97 13 100 L13 98 C7 94 6 82 6 68 L6 32 C6 18 7 6 13 2 Z');
      curve.setAttribute('fill', 'currentColor');
      if (side === 'right') curve.setAttribute('transform', 'translate(16 0) scale(-1 1)');
      bracket.append(curve);
      delimiter.classList.add('paper-tall-parenthesis');
      delimiter.style.cssText = 'position:relative;display:inline-block;width:.5em;height:2.4em;vertical-align:-.95em';
      delimiter.replaceChildren(bracket);
    }
  }
  return result;
}
function button(text, action) {
  const result = node('button', 'paper-button', text);
  result.type = 'button'; result.addEventListener('click', action); return result;
}
function icon(pathData) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.7', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true' })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', pathData);
  svg.append(path); return svg;
}
function confirmDifficulty(direction) {
  return new Promise(resolve => {
    const dialog = node('dialog', 'paper-difficulty-dialog');
    const heading = node('h2', '', `Try ${direction === 'easier' ? 'easier' : 'more difficult'} questions?`);
    heading.id = 'difficulty-confirm-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    const actions = node('div', 'paper-difficulty-dialog-actions');
    const cancel = button('No', () => dialog.close('cancel'));
    cancel.autofocus = true;
    const confirm = button('Yes', () => dialog.close('confirm'));
    confirm.classList.add('paper-difficulty-confirm');
    actions.append(confirm, cancel);
    dialog.append(heading, actions);
    let outsidePress = false;
    const outside = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { outsidePress = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => {
      if (outsidePress && event.target === dialog && outside(event)) dialog.close('cancel');
      outsidePress = false;
    });
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'confirm';
      dialog.remove(); resolve(confirmed);
    }, { once:true });
    document.body.append(dialog); dialog.showModal();
  });
}
export function mountQuestionnaire(app, { title = 'Practice paper', questions, search = window.location.search,
  answersEquivalent = defaultEquivalent, instruction = '', layoutControls = false, shortTitle = 'PSAT', changeDifficulty,
  tryAnother, questionLabels = [], allowTryAnother = true, onComplete } = {}) {
  const generatedSessions = new Set();
  const generateAnother = tryAnother || (async question => {
    const quode = question.portableQuestion?.quode;
    if (!quode) throw new Error('This question does not identify its generator.');
    // A two-question batch lets us exclude the prompt already on screen while
    // keeping a single generator request. Generators guarantee distinct prompts
    // within a batch, so at least one candidate is fresh.
    const options = {'--count':2};
    const difficulty = question.teaching?.difficulty;
    if (difficulty?.level) options['--difficulty'] = difficulty.level;
    if (difficulty?.context) options['--context'] = difficulty.context;
    if (difficulty?.template) options['--template'] = difficulty.template;
    const response = await fetch(`/api/quodes/${encodeURIComponent(quode)}/exercises`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({options})
    });
    const exercise = await response.json();
    if (!response.ok || !exercise.questions?.[0]) throw new Error(exercise.detail || 'Could not generate another question.');
    if (exercise.sessionId) generatedSessions.add(exercise.sessionId);
    return exercise.questions.find(candidate => candidate.question !== question.question) || exercise.questions[0];
  });
  if (!document.querySelector('link[data-questionnaire]')) {
    const css = node('link'); css.rel = 'stylesheet'; css.href = '/runtime/questionnaire.css';
    css.dataset.questionnaire = ''; document.head.append(css);
  }
  const options = presentationOptions(search);
  const celebration = createFlowerCelebration();
  const mobile = window.matchMedia('(max-width: 650px)');
  let teachingResize, difficultyLoading, difficultyRun = 0;
  let refreshTeaching = () => {};
  app.replaceChildren(); app.classList.add('questionnaire');
  app.dataset.mode = options.mode;
  app.classList.toggle('paper-learning', options.mode === 'learn');
  app.classList.toggle('questionnaire-grid', options.layout === 'grid');
  const heading = node('header', 'paper-heading');
  const headingActions = node('div', 'paper-heading-actions');
  const printButton = button('Print paper', () => window.print());
  printButton.hidden = options.mode === 'learn';
  headingActions.append(printButton);
  heading.append(node('h1', '', title), headingActions);
  const summary = node('p', 'paper-summary', `${questions.length} questions`); summary.setAttribute('role', 'status');
  const sheet = node('div', `paper-sheet paper-${options.layout}`);
  const supplement = node('section', 'paper-teacher-supplement'); supplement.hidden = true;
  const solutionsHeading = node('h2', 'paper-solutions-heading', 'Solutions'); solutionsHeading.hidden = true;
  const navigation = node('nav', 'paper-navigation'); navigation.setAttribute('aria-label', 'Question navigation');
  const dots = node('div', 'paper-dots');
  const navigationParams = new URLSearchParams(search);
  const requestedQuestion = navigationParams.get('question') ?? navigationParams.get('q.question');
  const questionNumber = /^[1-9]\d*$/.test(requestedQuestion || '') ? Number(requestedQuestion) : 1;
  let current = Number.isSafeInteger(questionNumber)
    ? Math.min(questionNumber, Math.max(1, questions.length)) - 1 : 0;
  const states = [];
  const orientationPrompt = mountOrientationPrompt(app, () => {
    const state = states[current];
    if (state?.helpOpen && !state.challenge) state.closeHelp(true, false);
  });
  const updateSummary = () => {
    const answered = states.filter(s => s.value.trim()).length;
    const checked = states.filter(s => s.checked).length;
    summary.textContent = options.mode !== 'exam' && checked ? `${states.filter(s => s.correct).length} correct · ${checked} checked · ${answered}/${states.length} answered` : `${answered}/${states.length} answered`;
  };
  const show = (index, focus = false) => {
    current = Math.max(0, Math.min(states.length - 1, index));
    states.forEach((state, i) => {
      if (i !== current && state.helpOpen && !state.challenge) state.closeHelp(false);
      if (i !== current) {
        if (state.pendingSuccess) { state.feedbackRun++; state.pendingSuccess = false; celebration.cancel(); }
        state.success.hidden = true; clearTimeout(state.feedbackTimer);
      }
      state.card.hidden = options.layout === 'single' && i !== current;
      state.dot.setAttribute('aria-current', i === current ? 'step' : 'false');
      if (state.difficulty) {
        if (i !== current) state.difficulty.collapse?.();
        const inToolbar = layoutControls && i === current;
        state.difficulty.hidden = i !== current;
        state.difficulty.classList.toggle('paper-difficulty-toolbar', inToolbar);
        if (inToolbar) heading.append(state.difficulty);
        else state.card.querySelector('.paper-question-body').prepend(state.difficulty);
      }
    });
    const selected = states[current];
    orientationPrompt.setQuestion(selected?.helpOpen ? selected.question : null);
    refreshTeaching();
    if (selected?.correct && !selected.nextReady && !selected.pendingSuccess) check(selected);
    previous.disabled = current === 0; next.disabled = current === states.length - 1;
    if (focus && states[current]) {
      states[current].card.focus({ preventScroll: true });
      states[current].card.scrollIntoView({ block: 'start' });
    }
    const activeDot = states[current]?.dot;
    if (activeDot && layoutControls) {
      const left = activeDot.getBoundingClientRect().left - dots.getBoundingClientRect().left + dots.scrollLeft;
      // Leave room for the selected circle's ring at either viewport edge.
      const inset = 5;
      if (left - inset < dots.scrollLeft) dots.scrollLeft = left - inset;
      else if (left + activeDot.offsetWidth + inset > dots.scrollLeft + dots.clientWidth)
        dots.scrollLeft = left + activeDot.offsetWidth + inset - dots.clientWidth;
    }
  };
  const previous = button('Previous', () => show(current - 1, true));
  const next = button('Next', () => show(current + 1, true));
  if (layoutControls) {
    for (const [control, label, path] of [[previous, 'Previous', 'M15 5l-7 7 7 7'], [next, 'Next', 'M9 5l7 7-7 7']]) {
      control.setAttribute('aria-label', label); control.title = label;
      control.classList.add('paper-chevron'); control.replaceChildren(icon(path));
    }
  }
  const check = state => {
    if (state.pendingSuccess) return;
    const feedbackRun = state.feedbackRun = (state.feedbackRun || 0) + 1;
    state.pendingSuccess = false; state.nextReady = false;
    state.success.hidden = true;
    if (!state.value.trim()) { if (options.mode !== 'exam') state.feedback.textContent = 'Enter an answer first.'; return; }
    if (options.mode === 'exam') {
      const index = states.indexOf(state);
      if (index < states.length - 1) show(index + 1, true);
      return;
    }
    state.editor?.close();
    state.checked = true;
    state.correct = state.mode === 'multiple-choice' ? state.value === state.question.choices[state.question.correctChoice ?? state.question.choices.indexOf(state.question.answer)] : answersEquivalent(state.question.answer, state.value);
    clearTimeout(state.feedbackTimer);
    state.feedback.textContent = '';
    if (!state.correct) {
      const message = 'Not quite yet. Take another look and try again.';
      let length = matchMedia('(prefers-reduced-motion: reduce)').matches ? message.length : 0;
      const type = () => {
        state.feedback.textContent = message.slice(0, ++length);
        if (length < message.length) state.feedbackTimer = setTimeout(type, 22);
      };
      type();
      celebration.silence(); celebration.error();
    }
    state.retryEntry = !state.correct;
    state.feedback.dataset.correct = String(state.correct);
    state.success.dataset.correct = String(state.correct);
    state.success.setAttribute('aria-label', state.correct ? 'Correct answer' : 'Incorrect answer');
    state.success.replaceChildren(icon(state.correct
      ? 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41Z'
      : 'M6 4.6 12 10.6 18 4.6 19.4 6 13.4 12 19.4 18 18 19.4 12 13.4 6 19.4 4.6 18 10.6 12 4.6 6Z'));
    // Restart the fall even for repeated rejected attempts.
    void state.success.offsetWidth;
    state.success.hidden = false;
    positionResultIcon(state.success);
    if (state.correct) state.editor?.close();
    state.updatePracticeActions?.();
    if (state.correct) {
      state.pendingSuccess = true;
      const landed = Promise.all(state.success.getAnimations().map(animation => animation.finished));
      Promise.all([celebration.play(), landed]).then(([flowersFinished]) => {
        if (!flowersFinished || state.feedbackRun !== feedbackRun || !state.card.isConnected || !state.correct) return;
        state.pendingSuccess = false; state.nextReady = true;
        state.updatePracticeActions?.();
      }).catch(() => {}); // Canceled falls cannot reveal stale Next actions.
    }
    updateSummary();
  };
  const createPendingState = index => {
    const card = node('article', 'paper-question-pending');
    card.tabIndex = -1; card.setAttribute('aria-busy', 'true');
    const questionLabel = questionLabels[index] || String(index + 1);
    const band = node('div', 'paper-band'); band.append(node('span', 'paper-number', questionLabel));
    const body = node('div', 'paper-question-body');
    const message = node('p', 'paper-question-pending-message', 'Preparing this question…');
    message.setAttribute('role', 'status');
    const feedback = node('p', 'paper-feedback');
    const success = node('div', 'paper-success-tick'); success.hidden = true;
    const teachHost = node('div', 'paper-teach-host'); teachHost.hidden = true;
    body.append(message, feedback, success, teachHost); card.append(band, body);
    const dot = button(questionLabel, () => show(index, true));
    dot.className = 'paper-dot'; dot.setAttribute('aria-label', `Go to question ${questionLabel}`);
    dot.title = `Go to question ${questionLabel}`;
    return { pending:true, question:null, card, band, feedback, success, teachHost, dot,
      value:'', checked:false, correct:false, helpOpen:false, closeHelp(){}, renderAnswer(){}, switchAnswer(){} };
  };
  const createState = (question, index) => {
    const answerMode = () => question.teaching?.answerMode || options.answerMode;
    const questionLabel = questionLabels[index] || String(index + 1);
    const card = node('article', 'paper-question'); card.tabIndex = -1;
    const band = node('div', 'paper-band'); band.append(node('span', 'paper-number', questionLabel));
    const body = node('div', 'paper-question-body');
    if (options.mode !== 'exam' && changeDifficulty && (question.teaching?.difficulty || question.portableQuestion?.quode === 'measurement-unit_conversion')) {
      const controls = node('div', 'paper-difficulty');
      controls.setAttribute('aria-label', 'Question difficulty');
      const levels = ['low', 'medium', 'verbose', 'high', 'challenge'];
      const level = Math.max(0, levels.indexOf(question.teaching?.difficulty?.level || 'medium'));
      const descriptions = question.teaching?.difficulty?.descriptions || ['Small numbers · direct conversion', 'Larger numbers · direct conversion', 'Small numbers · word problem', 'Larger numbers · word problem', 'Answer first · then simulate'];
      const track = node('div', 'paper-difficulty-track');
      const brain = () => icon('M12 18V5a3 3 0 0 0-5.8-1A4 4 0 0 0 3 10a4 4 0 0 0 1 7 4 4 0 0 0 8 1m0-13a3 3 0 0 1 5.8-1A4 4 0 0 1 21 10a4 4 0 0 1-1 7 4 4 0 0 1-8 1M7 4v3m10-3v3M3 10h4l2 3m12-3h-4l-2 3M4 17h3m13 0h-3');
      const smallBrain = brain(); smallBrain.classList.add('paper-difficulty-brain', 'small');
      const largeBrain = brain(); largeBrain.classList.add('paper-difficulty-brain');
      track.append(smallBrain);
      const status = node('span', 'paper-difficulty-status');
      status.setAttribute('role', 'status');
      for (const [targetIndex, target] of levels.entries()) {
        const control = button('', async () => {
          if (targetIndex === level) return;
          const direction = targetIndex < level ? 'easier' : 'harder';
          if (!await confirmDifficulty(direction) || !card.isConnected) return;
          if (states.some(state => state.pending)) {
            status.textContent = 'Please wait for the remaining questions to finish preparing.';
            return;
          }
          const buttons = [...app.querySelectorAll('.paper-difficulty button')];
          buttons.forEach(button => { button.disabled = true; });
          status.textContent = '';
          const loading = node('div', 'questionnaire paper-loading paper-difficulty-loading');
          const loadingContent = node('div', 'paper-loading-progress');
          const progress = node('div', 'paper-progress-track paper-progress-indeterminate');
          progress.setAttribute('role', 'progressbar');
          progress.setAttribute('aria-label', 'Changing paper difficulty');
          const fill = node('div', 'paper-progress-fill'); progress.append(fill);
          loadingContent.append(progress); loading.append(loadingContent);
          difficultyLoading = loading; document.body.append(loading);
          const run = ++difficultyRun;
          const sourceStates = [...states];
          const activePosition = current;
          const replaceQuestion = (position, replacement) => {
            if (run !== difficultyRun || states[position] !== sourceStates[position]) return false;
            const previousState = states[position];
            clearTimeout(previousState.feedbackTimer);
            previousState.editor?.element.blur();
            previousState.editor?.close(); previousState.teaching?.destroy();
            previousState.difficulty?.dispose?.();
            const nextState = createState(replacement, position);
            // Set visibility while detached: background results must never appear
            // between insertion and the final show() after the batch completes.
            nextState.card.hidden = options.layout === 'single' && position !== current;
            nextState.dot.setAttribute('aria-current', position === current ? 'step' : 'false');
            if (nextState.difficulty) nextState.difficulty.hidden = position !== current;
            previousState.difficulty?.remove();
            previousState.card.replaceWith(nextState.card); previousState.dot.replaceWith(nextState.dot);
            gridResize.unobserve(previousState.card); gridResize.observe(nextState.card);
            states[position] = nextState; questions[position] = replacement;
            return true;
          };
          const setDifficultyDisabled = disabled => {
            for (const button of app.querySelectorAll('.paper-difficulty button')) button.disabled = disabled;
          };
          try {
            // Replace the question being viewed first, then reveal it immediately.
            const activeReplacement = await changeDifficulty(sourceStates[activePosition].question, target, activePosition);
            if (!card.isConnected || !replaceQuestion(activePosition, activeReplacement)) return;
            const url = new URL(location.href);
            url.searchParams.delete('generation');
            url.searchParams.delete('preset');
            if (url.searchParams.get('mode') === 'preset') url.searchParams.set('mode', 'exam');
            // Keep custom paper definitions in this tab's history, never generated questions in the URL.
            let paperItems = history.state?.paperItems;
            if (url.searchParams.has('items')) {
              paperItems = JSON.parse(url.searchParams.get('items')).map(item => {
                const options = {...item.options};
                delete options['--starting-question'];
                return {...item, options};
              });
            }
            url.searchParams.delete('items');
            url.searchParams.delete('starting-question');
            url.searchParams.delete('--starting-question');
            url.searchParams.set('difficulty', target);
            history.replaceState({...history.state, paperItems}, '', url);
            show(activePosition); updateSummary();
            await states[activePosition].teaching?.ready;
            loading.remove();
            if (difficultyLoading === loading) difficultyLoading = undefined;
            setDifficultyDisabled(true);

            // Preserve positions while a small background pool regenerates the rest.
            const queue = sourceStates.map((_, position) => position).filter(position => position !== activePosition);
            const worker = async () => {
              while (queue.length && run === difficultyRun) {
                const position = queue.shift();
                try {
                  const replacement = await changeDifficulty(sourceStates[position].question, target, position);
                  if (replaceQuestion(position, replacement)) {
                    // The learner may have navigated while this request was pending.
                    if (position === current) { show(current); updateSummary(); }
                    setDifficultyDisabled(true);
                  }
                } catch (error) {
                  const activeStatus = states[activePosition].difficulty?.querySelector('.paper-difficulty-status');
                  if (activeStatus) activeStatus.textContent = error.message || 'Could not change every question.';
                }
              }
            };
            await Promise.all(Array.from({length:Math.min(3, queue.length)}, worker));
            if (run === difficultyRun) { setDifficultyDisabled(false); updateSummary(); }
          } catch (error) {
            status.textContent = error.message || 'Could not change difficulty. Try again.';
            buttons.forEach(button => { button.disabled = false; });
          } finally {
            loading.remove();
            if (difficultyLoading === loading) difficultyLoading = undefined;
          }
        });
        control.classList.add('paper-difficulty-step'); control.dataset.difficulty = target;
        control.setAttribute('aria-label', `Level ${targetIndex + 1}: ${descriptions[targetIndex]}`);
        control.title = control.getAttribute('aria-label');
        if (targetIndex === level) control.setAttribute('aria-current', 'step');
        track.append(control);
      }
      const reveal = node('div', 'paper-difficulty-reveal');
      reveal.id = `paper-difficulty-levels-${index}`;
      reveal.append(track); reveal.inert = true;
      let expanded = false;
      const collapse = () => {
        expanded = false;
        if (reveal.contains(document.activeElement)) toggle.focus({preventScroll:true});
        controls.classList.remove('paper-difficulty-expanded');
        reveal.inert = true; toggle.setAttribute('aria-expanded','false');
      };
      const expand = () => {
        expanded = true; reveal.inert = false;
        controls.classList.add('paper-difficulty-expanded');
        toggle.setAttribute('aria-expanded','true');
      };
      const toggle = button('', () => expanded ? collapse() : expand());
      toggle.className = 'paper-difficulty-toggle';
      toggle.setAttribute('aria-label','Change difficulty');
      toggle.setAttribute('aria-controls',reveal.id);
      toggle.setAttribute('aria-expanded','false');
      toggle.append(largeBrain);
      controls.addEventListener('pointerenter', event => {
        if (event.pointerType === 'mouse' && matchMedia('(hover:hover)').matches) expand();
      });
      controls.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse' && matchMedia('(hover:hover)').matches) collapse();
      });
      const dismissOutside = event => {
        if (expanded && !controls.contains(event.target)) collapse();
      };
      document.addEventListener('pointerdown', dismissOutside, true);
      controls.addEventListener('keydown', event => {
        if (event.key === 'Escape') { collapse(); event.preventDefault(); }
        if (event.target === toggle && event.key === 'ArrowLeft') {
          expand(); track.querySelector('button')?.focus(); event.preventDefault();
        }
      });
      controls.collapse = collapse;
      controls.dispose = () => document.removeEventListener('pointerdown', dismissOutside, true);
      controls.append(reveal,toggle,status); body.append(controls);
    }
    const promptId = `paper-prompt-${index}`;
    if (!question.teaching?.hideInstruction && (question.instruction || instruction)) body.append(node('p', 'paper-instruction', question.instruction || instruction));
    const prompt = node('div', 'paper-prompt'); prompt.id = promptId; prompt.append(renderQuestion(options.mode === 'learn' && question.teaching?.practiceQuestion
      ? {...question, question:question.teaching.practiceQuestion} : question, 'paper-math', false)); body.append(prompt);
    if (options.mode === 'learn' && question.teaching?.table) {
      const prose = prompt.querySelector('.quode-frequency-table').nextElementSibling;
      prose.replaceChildren(renderFrequencyProse(prose.textContent, question.teaching));
    }
    if (options.showTags && question.tags?.length) {
      const tags = node('div', 'paper-tags'); question.tags.forEach(tag => tags.append(node('span', 'paper-tag', tag))); body.append(tags);
    }
    if (options.showSource && question.source) body.append(node('p', 'paper-source', question.source));
    const feedback = node('p', 'paper-feedback'); feedback.setAttribute('role', 'status');
    const success = node('div', 'paper-success-tick');
    success.hidden = true;
    success.setAttribute('role', 'img'); success.setAttribute('aria-label', 'Correct answer');
    success.append(icon('M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41Z'));
    const dot = button(questionLabel, () => show(index, true)); dot.className = 'paper-dot'; dot.setAttribute('aria-label', `Go to question ${questionLabel}`); dot.title = `Go to question ${questionLabel}`;
    const percentageHelp = question.teaching?.kind === 'percentage-cannon';
    const fullscreenHelp = () => mobile.matches || (percentageHelp && matchMedia('(hover: none) and (pointer: coarse)').matches);
    const graphHelp = question.teaching?.graph?.kind === 'cartesian-line';
    const inlineHelp = question.teaching?.helpPresentation === 'inline' || graphHelp;
    const state = { difficulty:body.querySelector('.paper-difficulty'), question, card, band, feedback, success, dot, value: '', checked: false, correct: false };
    card.addEventListener('focusin', () => { current = index; });
    const change = value => { if (state.pendingSuccess) celebration.cancel(); state.feedbackRun = (state.feedbackRun || 0) + 1; state.pendingSuccess = false; state.nextReady = false; clearTimeout(state.feedbackTimer); state.retryEntry = false; success.hidden = true; current = index; state.value = value; if (state.checkButton) state.checkButton.disabled = !value.trim(); state.checked = false; state.correct = false; state.updatePracticeActions?.(); feedback.textContent = ''; dot.classList.toggle('answered', Boolean(value.trim())); updateSummary(); };
    const panels = new Map();
    const drafts = new Map();
    state.renderAnswer = () => {
      for (const [mode, panel] of panels) panel.hidden = mode !== answerMode();
      if (panels.has(answerMode())) return;
      const panel = node('div', 'paper-answer-panel');
      panels.set(answerMode(), panel); body.insertBefore(panel, feedback.parentNode === body ? feedback : null);
      if (answerMode() === 'multiple-choice') {
        const choices = question.choices;
        if (!Array.isArray(choices) || choices.length !== 4 || new Set(choices).size !== 4 || !(Number.isInteger(question.correctChoice) && question.correctChoice >= 0 && question.correctChoice < 4) && choices.filter(c => c === question.answer).length !== 1) {
          panel.append(node('p', 'paper-error', 'Multiple-choice answers are unavailable for this Quode. Use typed answers.'));
        } else {
          const fieldset = node('fieldset', 'paper-choices'); fieldset.setAttribute('aria-labelledby', promptId);
          choices.forEach((choice, choiceIndex) => {
            const label = node('label', 'paper-choice'); const input = node('input'); input.type = 'radio'; input.name = `question-${index}`;
            input.addEventListener('click', () => {
              if (state.value === choice) { input.checked = false; change(''); }
            });
            input.addEventListener('change', () => {
              if (!input.checked) return;
              change(choice); if (options.check === 'immediate') check(state);
            });
            if (options.mode !== 'teacher') label.append(input);
            const displayedChoice = question.teaching?.choiceLayout === 'two-line-system' ? `\\begin{aligned}${choice.replace(';', '\\\\')}\\end{aligned}` : choice;
            label.append(node('span', 'paper-choice-letter', String.fromCharCode(65 + choiceIndex)), question.teaching?.choiceFormat === 'text'
              ? renderQuestion({question:displayedChoice, questionFormat:'text', teaching:{equation:true}}, 'paper-math', false)
              : math(displayedChoice, true)); fieldset.append(label);
          }); panel.append(fieldset);
        }
      } else if (options.mode === 'teacher') {
        const blank = node('div', 'paper-written-answer'); blank.setAttribute('aria-label', 'Space for a written answer'); panel.append(blank);
      } else {
        const row = node('div', 'answer-entry-row'); const input = node('input'); input.type = 'hidden'; input.dataset.expectedAnswer = question.answer;
        const splitSystem = question.teaching?.answerLayout === 'two-equation-fields';
        if (splitSystem) {
          row.classList.add('answer-entry-system');
          const expected = question.answer.split(';').map(part => part.trim());
          const values = ['', '']; const editors = [];
          const joined = () => values.every(value => value.trim()) ? values.join('; ') : '';
          const sync = () => { input.value = joined(); input.dispatchEvent(new Event('input', {bubbles:true})); };
          input.addEventListener('input', () => change(input.value)); row.append(input);
          expected.forEach((answerPart, partIndex) => {
            const field = node('div', 'answer-entry-system-field');
            const partInput = node('input'); partInput.type = 'hidden'; partInput.dataset.expectedAnswer = answerPart;
            partInput.addEventListener('input', () => { values[partIndex] = partInput.value; sync(); });
            const editor = mountMathInput(partInput, {ariaLabel:`Equation ${partIndex + 1} for question ${index + 1}`, onSubmit:() => partIndex === 0 ? editors[1]?.focus() : check(state)});
            const example = question.steps?.[partIndex]?.example;
            field.append(partInput, editor.element);
            if (options.mode === 'learn') {
              const hint = node('p', 'paper-answer-example', 'eg: ');
              hint.id = `paper-answer-example-${index}-${partIndex}`;
              if (example) hint.append(math(example));
              editor.element.setAttribute('aria-describedby', hint.id); field.append(hint);
            }
            row.append(field); editors.push(editor);
          });
          state.editor = {
            element:editors[0].element,
            close(){ editors.forEach(editor => editor.close()); },
            focus(){ editors[0].focus(); },
            setValue(value){ const parts=String(value||'').split(';'); editors.forEach((editor,i)=>{ values[i]=(parts[i]||'').trim(); editor.setValue(values[i]); }); input.value=joined(); },
            setLocked(value){ editors.forEach(editor => editor.setLocked(value)); },
            sync(){ editors.forEach(editor => editor.sync()); },
            syncControls(){ editors.forEach(editor => editor.syncControls()); }
          };
          panel.append(row, node('div', 'paper-written-answer'));
        } else {
          input.addEventListener('input', () => change(input.value)); row.append(input);
          state.editor = mountMathInput(input, { ariaLabel: `Answer to question ${index + 1}`, onSubmit: () => check(state) });
          row.append(state.editor.element);
          if (question.teaching?.answerUnit || Number.isInteger(question.teaching?.answerWidthDigits)) {
            row.classList.add('paper-compact-answer');
            const digits = question.teaching?.answerUnit ? String(question.answer).length : question.teaching.answerWidthDigits;
            row.style.setProperty('--answer-digits', Math.max(1, Math.min(18, digits)));
          }
          if (question.teaching?.answerUnit) row.append(node('span', 'paper-answer-unit', question.teaching.answerUnit));
          panel.append(row, node('div', 'paper-written-answer'));
        }
        if (options.mode === 'learn') {
          panel.classList.add('paper-practice-entry');
          const example = splitSystem ? null : answerExample(question.answer, answersEquivalent);
          if (example !== null) {
            const hint = node('p', 'paper-answer-example', 'eg: ');
            hint.id = `paper-answer-example-${index}`;
            hint.setAttribute('aria-label', `Example format, not the correct answer: ${example}`);
            hint.append(math(example)); row.append(hint);
            state.editor.element.setAttribute('aria-describedby', hint.id);
          }
        }
      }
      if (options.mode === 'learn') {
        const actions = node('div', 'paper-practice-actions');
        state.checkButton = button('Check answer', () => {
          if (state.correct && !state.nextReady) return;
          success.hidden = true;
          if (state.correct) {
            celebration.cancel();
            if (index === questions.length - 1) onComplete?.();
            else show(index + 1, true);
            return;
          }
          state.editor?.close(); check(state); updateSummary();
        });
        state.checkButton.disabled = !state.value.trim();
        const helpButton = button('Help Me', async () => {
          if (state.correct && !state.nextReady) return;
          success.hidden = true;
          if (state.correct && state.nextReady) {
            state.checkButton.disabled = true; helpButton.disabled = true;
            card.setAttribute('aria-busy', 'true');
            try {
              const replacement = await generateAnother(state.question, index);
              if (!replacement) throw new Error('Could not generate another question.');
              clearTimeout(state.feedbackTimer);
              state.editor?.close(); state.teaching?.destroy(); state.difficulty?.dispose?.();
              const nextState = createState(replacement, index);
              state.difficulty?.remove();
              state.card.replaceWith(nextState.card); state.dot.replaceWith(nextState.dot);
              states[index] = nextState; questions[index] = replacement;
              show(index, true); updateSummary();
              await nextState.teaching?.ready;
            } catch (error) {
              feedback.textContent = error.message || 'Could not generate another question. Try again.';
              state.updatePracticeActions?.();
            } finally {
              card.removeAttribute('aria-busy');
            }
            return;
          }
          if (state.helpOpen) return;
          state.editor?.close(); state.helpOpen = true; feedback.textContent = '';
          if (index === current) orientationPrompt.setQuestion(state.question);
          if (inlineHelp && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const entrance = panel.animate([{opacity:1},{opacity:0}], {duration:graphHelp ? 150 : 180,fill:'forwards'});
            state.helpEntrance = entrance; panel.inert = true;
            await entrance.finished.catch(() => {});
            if (state.helpEntrance !== entrance || !state.helpOpen || !card.isConnected) return;
            panel.hidden = true; panel.inert = false; entrance.cancel(); state.helpEntrance = null;
          } else panel.hidden = true;
          refreshTeaching(); state.teaching?.startHelp();
          if (percentageHelp && state.teaching && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const element = state.teaching.element;
            const frames = fullscreenHelp()
              ? [{transform:'translateY(100dvh)'}, {transform:'translateY(0)'}]
              : [{opacity:0}, {opacity:1}];
            const entrance = element.animate(frames, {duration:fullscreenHelp() ? 320 : 250, easing:'ease-out'});
            state.helpEntrance = entrance;
            entrance.finished.then(() => { if (state.helpEntrance === entrance) state.helpEntrance = null; }).catch(() => {});
          }
        });
        state.updatePracticeActions = () => {
          const ready = state.correct && state.nextReady;
          const waiting = state.correct && !state.nextReady;
          // Keep both original actions in place until the tick AND flowers settle.
          state.checkButton.hidden = false;
          state.checkButton.classList.toggle('paper-next-question', ready);
          helpButton.textContent = ready ? 'Try another' : 'Help Me';
          helpButton.hidden = ready && !allowTryAnother;
          state.checkButton.textContent = ready ? (index === questions.length - 1 ? 'Finish' : 'Next Question') : 'Check answer';
          helpButton.disabled = waiting;
          state.checkButton.disabled = waiting || (!ready && !state.value.trim());
        };
        actions.append(state.checkButton, helpButton); panel.append(actions);
      }
    };
    state.switchAnswer = () => {
      drafts.set(state.mode, { value:state.value, checked:state.checked, correct:state.correct, feedbackText:feedback.textContent });
      state.editor?.close();
      Object.assign(state, drafts.get(answerMode()) || { value:'', checked:false, correct:false, feedbackText:'' });
      feedback.textContent = state.feedbackText || '';
      // Restore marking and input state independently for each answer format.
      feedback.dataset.correct = String(state.correct);
      dot.classList.toggle('answered', Boolean(state.value.trim()));
      state.mode = answerMode(); state.renderAnswer();
    };
    state.mode = answerMode(); state.renderAnswer();
    state.teachHost = node('div', 'paper-teach-host'); body.append(state.teachHost);
    state.closeHelp = async (focus = true, focusAnswer = true) => {
      state.helpEntrance?.cancel(); state.helpEntrance = null;
      panels.get(answerMode()).inert = false;
      const teaching = state.teaching;
      if (focus && state.helpClosing) return;
      if (focus && teaching && inlineHelp) {
        state.helpClosing = true;
        await teaching.closeHelp?.();
        if (state.teaching !== teaching) return;
      } else if (focus && teaching && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        state.helpClosing = true;
        teaching.pause();
        const element = teaching.element;
        element.inert = true;
        const style = getComputedStyle(element);
        const frames = fullscreenHelp()
          ? [{transform:style.transform === 'none' ? 'translateY(0)' : style.transform}, {transform:'translateY(100dvh)'}]
          : [{opacity:style.opacity}, {opacity:0}];
        state.helpExit = element.animate(frames, {duration:fullscreenHelp() ? 320 : 250, easing:'ease-in', fill:'forwards'});
        await state.helpExit.finished.catch(() => {});
        if (state.teaching !== teaching) return;
      } else state.helpExit?.cancel();
      state.helpClosing = false;
      state.helpOpen = false; state.teaching?.destroy(); state.teaching = null; state.teachHost.replaceChildren(); state.teachHost.hidden = true;
      if (index === current) orientationPrompt.setQuestion(null);
      panels.get(answerMode()).hidden = false;
      if (focus && inlineHelp && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        panels.get(answerMode()).animate([{opacity:0},{opacity:1}], {duration:graphHelp ? 150 : 220,easing:'ease-out'});
      }
      if (focus && focusAnswer) requestAnimationFrame(() => { if (!card.isConnected || state.helpOpen) return; if (graphHelp) panels.get(answerMode()).querySelector('button')?.focus({preventScroll:true}); else state.editor?.element.focus({preventScroll:true}); if (!inlineHelp) card.scrollIntoView({block:'start', behavior:'instant'}); });
    };
    state.teachHost.addEventListener('teaching-close', event => {
      if(['rectangle-area','percentage-cannon'].includes(question.teaching?.kind) && options.mode==='learn'){
        // Help is practice; the original question still needs a fresh answer.
        state.editor?.setValue('');
        for(const panel of panels.values())for(const input of panel.querySelectorAll('input[type=radio]'))input.checked=false;
        drafts.clear();success.hidden=true;delete feedback.dataset.correct;change('');
      }
      state.closeHelp(true, event.detail?.focusAnswer !== false);
    });

    state.challenge = !['rectangle-area','percentage-cannon'].includes(question.teaching?.kind)
      && !['measurement-unit_conversion','algebra-axis_intercepts','algebra-graph_reading','geometry-rectangle_area','algebra-writing_systems'].includes(question.portableQuestion?.quode)
      && (question.teaching?.submissionMode ?? (question.teaching?.difficulty?.level === 'challenge')) && options.mode === 'learn';
    if (state.challenge) {
      state.helpOpen = true;
      panels.get(answerMode()).hidden = true;
      state.teachHost.addEventListener('teaching-answer', event => {
        state.value = String(event.detail.answer); state.checked = true; state.correct = event.detail.correct;
        dot.classList.toggle('answered', true); updateSummary();
      });
    }
    body.append(feedback, success); card.append(band, body);
    return state;
  };
  questions.forEach((question, index) => {
    const state = question ? createState(question, index) : createPendingState(index);
    sheet.append(state.card); dots.append(state.dot); states.push(state);
  });
  navigation.append(previous, dots, next); navigation.hidden = options.layout !== 'single';
  app.append(heading);
  if (layoutControls) {
    const footer = node('footer', 'paper-footer');
    footer.append(summary, navigation); app.append(sheet, supplement, footer);
  } else app.append(summary, navigation, sheet, supplement);
  // Preserve DOM/print order while stacking odd/even screen questions independently.
  const positionResults = () => states.forEach(state => {
    if (!state.success.hidden) positionResultIcon(state.success);
  });
  window.addEventListener('resize', positionResults);
  const footerResize = new ResizeObserver(positionResults);
  const footerElement = app.querySelector('.paper-footer');
  if (footerElement) footerResize.observe(footerElement);
  const gridResize = new ResizeObserver(() => {
    if (!sheet.classList.contains('paper-grid') || mobile.matches
        || window.matchMedia('print').matches) return;
    const rows = [1, 1];
    states.forEach((state, index) => {
      const column = index % 2;
      const span = Math.max(1, Math.ceil(state.card.getBoundingClientRect().height + 54));
      state.card.style.setProperty('--question-column', column + 1);
      state.card.style.setProperty('--question-row', rows[column]);
      state.card.style.setProperty('--question-span', span);
      rows[column] += span;
    });
  });
  gridResize.observe(sheet);
  states.forEach(state => gridResize.observe(state.card));
  const submitButton = button('Submit paper', () => { check(states[current]); updateSummary(); });
  submitButton.dataset.toolbarTooltip = options.mode === 'exam'
    ? 'Submit your selected answer and continue to the next question when available.'
    : 'Check your answer to the current question and show feedback.';
  submitButton.hidden = options.mode !== 'exam';
  headingActions.prepend(submitButton);
  const applyLayout = () => {
    states.forEach(state => state.editor?.close());
    options.layout = options.mode === 'exam' ? 'grid' : options.mode === 'learn' ? 'single' : 'list';
    sheet.classList.remove('paper-list', 'paper-grid', 'paper-single');
    sheet.classList.add(`paper-${options.layout}`);
    app.classList.toggle('questionnaire-grid', options.layout === 'grid');
    navigation.hidden = options.layout !== 'single';
    const footer = navigation.closest('.paper-footer');
    if (footer) footer.hidden = navigation.hidden;
    show(current);
  };
  if (layoutControls) {
    heading.classList.add('paper-heading-with-layout');
    app.classList.add('questionnaire-with-toolbar');
    const brand = node('div', 'paper-brand');
    brand.hidden = !title.trim();
    const logo = node('img', 'paper-brand-icon');
    logo.src = '/runtime/psat-icon-192.png?v=2'; logo.alt = ''; logo.width = 32; logo.height = 32;
    const printHeading = node('header', 'paper-print-heading');
    const printLogo = logo.cloneNode(); printLogo.alt = 'PSAT';
    const printTitle = node('h1');
    printHeading.append(printLogo, printTitle);
    heading.after(printHeading);
    const homeLink = node('a', 'paper-home-link');
    homeLink.href = location.pathname === '/' ? '/' : '/psat-player/';
    homeLink.setAttribute('aria-label', 'Back to PSAT landing page');
    homeLink.title = 'Back to PSAT landing page';
    homeLink.append(logo);
    const titleNode = heading.querySelector('h1');
    titleNode.textContent = shortTitle;
    titleNode.append(node('span', 'paper-title-detail', title.startsWith(shortTitle) ? title.slice(shortTitle.length) : ` · ${title}`));
    titleNode.setAttribute('aria-label', title);
    brand.append(homeLink, titleNode); heading.prepend(brand);
    for (const control of headingActions.children) {
      const label = control.textContent;
      control.setAttribute('aria-label', label); control.title = label;
      control.textContent = '';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7');
      svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', control === printButton
        ? 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7zM17 11h.01'
        : 'M5 12l4 4L19 6');
      svg.append(path); control.append(svg);
      if (control !== printButton) control.append(node('span', 'paper-action-label', label.replace(' paper', '')));
    }
    const makeTeacherGroup = (label, choices, choose) => {
      const group = node('div', 'paper-teacher-group');
      group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
      group.hidden = options.mode !== 'teacher';
      const controls = new Map();
      for (const [value, name, path, description] of choices) {
        const control = button('', () => {
          if (control.getAttribute('aria-disabled') !== 'true') choose(value);
        });
        control.setAttribute('aria-label', name); control.dataset.toolbarTooltip = description;
        control.append(icon(path)); group.append(control); controls.set(value, control);
      }
      headingActions.append(group);
      return controls;
    };
    const includeButtons = makeTeacherGroup('Answer sheet', [
      ['answers','Include answer sheet','M5 3h14v18H5zM8 8h8M8 14l2 2 5-5','Add all questions and an answer key before the detailed solution sheet.'],
    ], () => { options.include = options.include === 'answers' ? 'solutions' : 'answers'; writeTeachingURL(); updateTeaching(); });
    const writeTeachingURL = () => {
      const url = new URL(location.href);
      if (!url.searchParams.has('preset') && url.searchParams.get('mode') === 'preset') url.searchParams.set('preset','true');
      url.searchParams.set('mode', options.mode);
      url.searchParams.set('answer-mode', options.answerMode);
      if (options.mode === 'teacher') {
        url.searchParams.set('view', options.teaching); url.searchParams.set('include', options.include); url.searchParams.delete('layout');
      }
      else url.searchParams.delete('view');
      if (options.mode === 'learn') url.searchParams.delete('layout');
      for (const key of ['teaching', 'show-solution', 'show-share']) url.searchParams.delete(key);
      history.replaceState(history.state, '', url);
    };
    const updateTeaching = () => {
      const teach = options.mode === 'learn';
      const workbook = options.mode === 'teacher' && options.teaching === 'workbook';
      const solution = options.mode === 'teacher' && !workbook;
      printTitle.textContent = options.mode === 'exam' ? 'PSAT practice exam'
        : workbook ? 'PSAT workbook' : solution ? 'PSAT solutions sheet' : 'PSAT practice questions';
      includeButtons.get('answers').parentElement.hidden = !solution;
      includeButtons.get('answers').setAttribute('aria-pressed', String(solution && options.include === 'answers'));
      sheet.classList.toggle('paper-solution-document', solution);
      sheet.setAttribute('aria-label', solution ? 'Solutions' : 'Questions');
      app.classList.toggle('paper-teach', teach);
      app.classList.toggle('paper-teach-simulation', options.mode === 'learn');
      printButton.hidden = options.mode === 'learn';
      submitButton.hidden = options.mode !== 'exam';
      app.classList.toggle('paper-multiple', states.length > 1);
      refreshTeaching = () => {
        states.forEach(state => {
          state.editor?.close();
          const showHelp = teach && state.helpOpen;
          state.teachHost.hidden = !(showHelp || workbook || solution);
          state.teaching?.pause();
          if ((showHelp || workbook || solution) && !state.card.hidden) {
            if (!state.pending && !state.teaching) { state.teaching = mountQuodeTeaching(state.question, location.search); state.teachHost.append(state.teaching.element); }
            if (state.pending) return;
            state.teaching.setView(solution ? 'solution' : options.teaching);
            if (showHelp && state.challenge) state.teaching.startHelp();
          }
        });
        supplement.replaceChildren();
        supplement.hidden = !solution || options.include !== 'answers';
        if (solution) sheet.before(supplement);
        solutionsHeading.hidden = supplement.hidden;
        if (!supplement.hidden) sheet.prepend(solutionsHeading);
        else solutionsHeading.remove();
        if (!supplement.hidden) {
          const questionSet = node('section', 'paper-teacher-questions');
          questionSet.setAttribute('aria-label', 'Questions only');
          questionSet.append(node('h2', '', 'Questions'));
          const questionSheet = node('div', 'paper-sheet paper-grid');
          questionSet.append(questionSheet);
          const answerSet = node('section', 'paper-teacher-answers');
          answerSet.setAttribute('aria-label', 'Answer key');
          answerSet.append(node('h2', '', 'Answers'));
          const answerList = node('ol', 'paper-teacher-answer-grid');
          answerList.setAttribute('role', 'list');
          answerSet.append(answerList);
          states.forEach((state, index) => {
            const question = node('article', 'paper-question');
            question.append(state.band.cloneNode(true));
            const body = node('div', 'paper-question-body');
            const originalBody = state.card.querySelector('.paper-question-body');
            for (const element of originalBody.children) {
              if (!element.matches('.paper-instruction,.paper-prompt,.paper-tags,.paper-source,.paper-answer-panel')) continue;
              const copy = element.cloneNode(true);
              copy.removeAttribute('id');
              body.append(copy);
            }
            question.append(body); questionSheet.append(question);
            const entry = node('li', 'paper-teacher-answer-entry');
            const number = node('span', 'paper-teacher-answer-number', `${index + 1}.`);
            entry.append(number);
            const model = conversionModel(state.question);
            const answer = node('div', 'paper-teacher-answer');
            if (model) answer.textContent = model.finalAnswer;
            else if (state.question.teaching?.choiceFormat === 'text') answer.append(renderQuestion({question:state.question.answer, questionFormat:'text'}, 'paper-math', false));
            else answer.append(math(state.question.answer));
            entry.append(answer); answerList.append(entry);
          });
          supplement.append(questionSet, answerSet);
        }

      };
      applyLayout();
    };
    writeTeachingURL(); updateTeaching();
    teachingResize = updateTeaching;
    mobile.addEventListener('change', teachingResize);
    mobile.addEventListener('change', applyLayout);
  }
  applyLayout(); updateSummary();
  return {
    get ready() { return Promise.all(states.map(state => state.teaching?.ready)); },
    async setQuestion(index, question) {
      const previousState = states[index];
      if (!previousState || !question) return;
      clearTimeout(previousState.feedbackTimer);
      previousState.editor?.close(); previousState.teaching?.destroy(); previousState.difficulty?.dispose?.();
      const nextState = createState(question, index);
      previousState.difficulty?.remove(); previousState.card.replaceWith(nextState.card); previousState.dot.replaceWith(nextState.dot);
      gridResize.unobserve(previousState.card); gridResize.observe(nextState.card);
      states[index] = nextState; questions[index] = question;
      show(current); updateSummary();
      await nextState.teaching?.ready;
    },
    setQuestionError(index, message) {
      const state = states[index];
      if (!state?.pending) return;
      state.card.removeAttribute('aria-busy');
      state.card.querySelector('.paper-question-pending-message').textContent = message || 'Could not prepare this question.';
      state.dot.classList.add('paper-question-error');
      state.dot.title = `Question ${index + 1} could not be prepared`;
    },
    destroy() { footerResize.disconnect(); window.removeEventListener('resize', positionResults); gridResize.disconnect(); difficultyLoading?.remove(); orientationPrompt.destroy(); celebration.destroy(); delete app.dataset.mode; mobile.removeEventListener('change', applyLayout); if (teachingResize) mobile.removeEventListener('change', teachingResize); states.forEach(s => { clearTimeout(s.feedbackTimer); s.difficulty?.dispose?.(); s.editor?.close(); s.teaching?.destroy(); }); for (const session of generatedSessions) fetch(`/api/exercises/${encodeURIComponent(session)}`, {method:'DELETE', keepalive:true}).catch(() => {}); generatedSessions.clear(); app.replaceChildren(); app.classList.remove('questionnaire', 'questionnaire-grid', 'questionnaire-with-toolbar', 'paper-teach', 'paper-teach-simulation', 'paper-multiple', 'paper-learning'); }
  };
}
