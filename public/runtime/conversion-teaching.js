import { createStepFeedback } from './step-feedback.js';
import { dockGameAudio } from './game-audio-control.js';
import { answerField, wholeNumber, report } from './answer-challenge.js';
import { createCompletionPrompt } from './completion-prompt.js';
import { focusHelpPrompt } from './help-prompt-focus.js';
import { mountMathInput } from './math-input.js';
import { createFlowerCelebration } from './flower-celebration.js';
import { renderQuestion, emphasizeQuantities } from './question-sharing.js';

const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
const number = value => {
  const text = String(value).replace(/,/g, '');
  const fraction = text.match(/^\\frac\{(-?\d+)\}\{(\d+)\}$/) || text.match(/^(-?\d+)\/(\d+)$/);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(text);
};
const format = value => Number(value.toPrecision(12)).toLocaleString('en-US', { maximumFractionDigits: 10 });


const compactUnits = text => text.replace(/([0-9\uE001□])(?:\s+|-)(?=(?:m²|mL|cm|km|kg|ft|in(?=\s*(?:[=.,;:!?)]|$))|yd|lb|oz|min|m|g|h|s|L)(?![a-zA-Z]))/g, '$1');
function slabLabel(className, text) {
  const slab = el('div',className);
  slab.append(el('span','',text));
  return slab;
}
function amount(model, name, count) {
  const value = format(count);
  return name === 'dollar' ? '$' + value : name === 'cent' ? value + '¢' : compactUnits(`${value} ${model.unit(name,count)}`);
}
function colouredAmount(model, name, count, className = 'conversion-total') {
  const result = el('span', '');
  if (name === 'dollar') result.append(document.createTextNode('$'));
  result.append(el('span', className, format(count)));
  result.append(document.createTextNode(name === 'dollar' ? '' : name === 'cent' ? '¢' : compactUnits(`0 ${model.unit(name,count)}`).slice(1)));
  return result;
}
export function conversionModel(question) {
  const data = question.portableQuestion?.data;
  if (!data || question.portableQuestion.quode !== 'measurement-unit_conversion') return null;
  const value = number(data.value), answer = number(question.answer);
  if (!(value > 0 && answer > 0 && Number.isFinite(value) && Number.isFinite(answer))) return null;
  const reducing = value > answer;
  const symbols = {"foot": "ft", "inch": "in", "yard": "yd", "metre": "m", "centimetre": "cm", "kilometre": "km", "kilogram": "kg", "gram": "g", "pound": "lb", "ounce": "oz", "hour": "h", "minute": "min", "second": "s", "litre": "L", "millilitre": "mL", "square-metre": "m²"};
  const language = {...question.teaching, units:{...question.teaching?.units}};
  for (const [name, symbol] of Object.entries(symbols)) {
    language.units[name] = {singular:symbol, plural:symbol, abbreviation:symbol};
  }
  if (language.units.triple) language.units.triple = {singular:'group of 3',plural:'groups of 3',abbreviation:'group of 3'};
  const unit = (name, count) => compactUnits(language.units[name]?.[count === 1 ? 'singular' : 'plural'] || name);
  return { language, unit, large:reducing ? data.to : data.from, small:reducing ? data.from : data.to,
    factor:Math.round((reducing ? value / answer : answer / value) * 1e10) / 1e10,
    goal:reducing ? answer : value, target:reducing ? value : answer,
    finalAnswer:amount({unit},data.to,answer) };
}

function wording(model, key, extra = {}) {
  const exampleCount = 2;
  const unit = model.unit;
  const context = {
    factor:format(model.factor), target:format(model.target), count:format(model.goal),
    large:model.language.units[model.large].singular,
    large_abbreviation:model.language.units[model.large].abbreviation,
    small_abbreviation:model.language.units[model.small].abbreviation,
    small_amount:amount(model,model.small,model.factor),
    target_amount:amount(model,model.small,model.target),
    block:['dollar','cent'].includes(model.small) ? amount(model,model.small,model.factor) : `${format(model.factor)}-${model.language.units[model.small].singular}`,
    large_units:unit(model.large,model.goal), small_units:unit(model.small,model.target),
    block_units:model.language.common[model.goal === 1 ? 'blockSingular' : 'blockPlural'],
    example_count:exampleCount, example_total:format(exampleCount * model.factor),
    example_small_units:unit(model.small,exampleCount * model.factor), example_large_units:unit(model.large,exampleCount),
    ...extra,
  };
  let text = key.split('.').reduce((value,part) => value?.[part],model.language);
  if (typeof text !== 'string') throw new Error(`Missing conversion wording: ${key}`);
  // Currency placement belongs to the amount, not to a trailing unit label.
  for (const [name, tokens] of [
    [model.large, [['1','large'],['1','large_abbreviation'],['{count}','large_units'],['{example_count}','example_large_units']]],
    [model.small, [['{factor}','small_abbreviation'],['{total}','small_units'],['{example_total}','example_small_units']]],
  ]) {
    if (!['dollar','cent'].includes(name)) continue;
    for (const [value, label] of tokens)
      text = text.replaceAll(`${value} {${label}}`, name === 'dollar' ? '$' + value : value + '¢');
  }
  if (model.large === 'dollar') text = text.replaceAll('one {large}', '$1').replaceAll('{count} more {large_units}', '{count} more $1 blocks');
  return compactUnits(text.replaceAll('{{','\uE002').replaceAll('}}','\uE003').replace(/\{([a-z_]+)\}/g, (_,name) => {
    if (!(name in context)) throw new Error(`Missing conversion value: ${name}`);
    return String(context[name]);
  }).replaceAll('\uE002','{').replaceAll('\uE003','}'));
}
function richWording(model, key, values, nodes) {
  const holder = el('span','');
  const markers = Object.fromEntries(Object.keys(nodes).map(name => [name,`\uE000${name}\uE001`]));
  const text = wording(model,key,{...values,...markers});
  for (const part of text.split(/(\uE000[a-z_]+\uE001)/)) {
    const name = part.startsWith('\uE000') ? part.slice(1,-1) : null;
    holder.append(name && nodes[name] ? nodes[name].cloneNode(true) : document.createTextNode(part));
  }
  return emphasizeQuantities(holder, model.language.units, model.large);
}

function stackWorksheet(model, workbook, enabled) {
  const panel = el('section', workbook ? 'teach-workbook' : 'teach-solution');
  const row = el('section', 'teach-step conversion-worked-row');
  row.setAttribute('aria-label', wording(model,'worked.label'));
  const copy = el('div', 'conversion-worked-copy');
  const smallAmount = amount(model,model.small,model.factor);
  const knownRule = wording(model,'worked.knownRule');
  if (enabled('instructions')) copy.append(el('p','teach-intent',knownRule.endsWith('.') ? knownRule : `${knownRule}.`));
  if (enabled('hints')) {
    copy.append(el('p','conversion-worked-hint',wording(model,'worked.hint')));
  }
  const conclusion = el('p','conversion-worked-conclusion');
  const count = el('span',workbook ? 'conversion-count conversion-conclusion-blank' : 'conversion-count',workbook ? '' : format(model.goal));
  if (workbook) { count.setAttribute('role','img'); count.setAttribute('aria-label',wording(model,'worked.blankLabel')); }
  conclusion.append(richWording(model,'worked.conclusion',workbook ? {block_units:model.language.common.blockPlural} : {},{count}));
  const equation = el('div','conversion-worked-equation');
  const factor = el('span',workbook ? 'conversion-count conversion-worked-blank teach-writing-line' : 'conversion-count',workbook ? '' : format(model.goal));
  if (workbook) { factor.setAttribute('role','img'); factor.setAttribute('aria-label',wording(model,'common.missingNumber')); }
  equation.append(richWording(model,'worked.equation',{}, {count:factor,target:el('span','conversion-total',format(model.target))}));
  copy.append(equation);
  if (workbook && enabled('hints')) copy.append(el('p','conversion-worked-example',wording(model,'worked.example')));
  copy.append(conclusion);
  const figure = el('figure','conversion-worked-figure');
  const stage = el('div', 'conversion-worked-stage');
  const frame = el('div', workbook ? 'conversion-target-frame' : 'conversion-target-frame conversion-filled-frame');
  frame.style.setProperty('--target-blocks', model.goal);
  stage.style.setProperty('--worked-min-height', `${Math.max(220, model.goal * 28)}px`);
  const stack = el('div','conversion-stack');
  // A workbook diagram must never reveal the answer by counting its blocks.
  // When the answer is one, leave the container empty.
  const visibleBlocks = workbook ? (model.goal > 1 ? 1 + Math.floor(Math.random() * (model.goal - 1)) : 0) : model.goal;
  for (let i=0;i<visibleBlocks;i++) stack.append(slabLabel('conversion-slab',smallAmount));
  const targetAmount = el('span', '');
  targetAmount.append(colouredAmount(model,model.small,model.target));
  const marker = el('div', 'conversion-height-marker');
  marker.setAttribute('aria-hidden', 'true');
  const label = el('span', 'conversion-height-label'); label.append(targetAmount.cloneNode(true)); marker.append(label);
  frame.append(stack, marker); stage.append(frame);
  figure.append(stage); row.append(copy,figure); panel.append(row);
  for (const paragraph of copy.querySelectorAll('p:not(.conversion-worked-conclusion)')) emphasizeQuantities(paragraph, model.language.units, model.large);
  return panel;
}

function worked(question, workbook, search) {
  const params = new URLSearchParams(search);
  const enabled = name => !['false','0','no'].includes(params.get(name));
  const model = conversionModel(question);
  if (model && question.portableQuestion.data.to === model.large && Number.isInteger(model.goal) && model.goal <= 100) return stackWorksheet(model, workbook, enabled);
  const panel = el('section', workbook ? 'teach-workbook' : 'teach-solution');
  panel.append(el('h3', '', model?.language ? wording(model,workbook ? 'common.workbookTitle' : 'common.answerTitle') : ''));
  for (const [i, step] of question.steps.entries()) {
    const row = el('section', 'teach-step');
    row.setAttribute('aria-label', model?.language ? wording(model,'common.stepLabel',{step:i+1}) : String(i+1));
    const working = el('div', 'teach-working');
    const copy = el('div', 'teach-step-copy');
    if (enabled('instructions')) copy.append(el('p', 'teach-intent', step.intent));
    if (enabled('hints')) copy.append(el('p', 'teach-hint', step.hint));
    if (workbook) {
      working.append(el('div', 'teach-writing-line'));
      const example = el('div', 'teach-example', model?.language ? wording(model,'common.examplePrefix') : '');
      example.append(renderQuestion({question:step.example}, 'paper-math', false)); working.append(example);
    } else working.append(renderQuestion({question:step.result}, 'paper-math', false));
    if (model?.language) for (const paragraph of copy.children) emphasizeQuantities(paragraph, model.language.units, model.large);
    row.append(working, copy); panel.append(row);
  }
  return panel;
}

export function mountConversionTeaching(question, search = location.search) {
  const submissionMode = question.teaching?.difficulty?.level === 'challenge';
  let pauseSubmission = () => {};
  let resetSubmission = () => {};
  const root = el('div', 'paper-teaching');
  const model = conversionModel(question);
  const unit = model?.unit;
  const views = new Map();
  const cleanups = [];
  const stepFeedback = createStepFeedback(); cleanups.push(() => stepFeedback.destroy());
  const celebration = createFlowerCelebration({isMuted:() => muted}); cleanups.push(() => celebration.destroy());
  let fit = () => {};
  let beginHelp = () => {};
  const leaveHelp = () => root.dispatchEvent(new CustomEvent('teaching-close', {bubbles:true}));
  let closeCompletionPrompt = () => {};
  let closeStartPrompt = () => {};
  let showCompletionPrompt = () => {};
  let answerEditor;
  let audio;
  let music;
  let fadeTimer;
  let musicGain;
  let outputGain;
  let musicFinished = false;
  let muted = false;
  try { muted = localStorage.getItem('psat-audio-muted') === 'true'; } catch {}
  const audioButton = el('button', 'conversion-audio-fab');
  audioButton.type = 'button'; audioButton.hidden = true;
  const updateAudioButton = () => {
    audioButton.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    audioButton.setAttribute('aria-pressed', String(muted));
    audioButton.title = muted ? 'Unmute audio' : 'Mute audio';
    audioButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4Z"/>${muted ? '<path stroke="#d32f2f" d="m16 9 5 6m0-6-5 6"/>' : '<path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>'}</svg>`;
  };
  updateAudioButton(); root.append(audioButton);
  cleanups.push(dockGameAudio(audioButton, root));
  audioButton.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem('psat-audio-muted', String(muted)); } catch {}
    if (outputGain) {
      outputGain.gain.cancelScheduledValues(audio.currentTime);
      outputGain.gain.setTargetAtTime(muted ? 0 : 1, audio.currentTime, .025);
    }
    if (muted) { stopMusic(); celebration.silence(); } else startMusic();
    updateAudioButton();
  });
  // Bundled CC0 Korobeiniki recording; provenance is in audio/CREDITS.md.
  const stopMusic = () => {
    clearTimeout(fadeTimer); fadeTimer = undefined;
    music?.pause();
  };
  const resetMusic = () => {
    stopMusic();
    if (music) music.currentTime = 0;
  };
  const ensureAudio = () => {
    if (audio) return true;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    audio = new Audio();
    outputGain = audio.createGain(); outputGain.gain.value = muted ? 0 : 1; outputGain.connect(audio.destination);
    musicGain = audio.createGain(); musicGain.connect(outputGain);
    return true;
  };
  const startMusic = () => {
    if (document.hidden || muted || musicFinished ||
        !root.isConnected || root.dataset.view !== 'stepwise') return;
    try {
      if (!ensureAudio()) return;
      if (!music) {
        music = new window.Audio(new URL('./audio/korobeiniki.mp3', import.meta.url).href);
        music.loop = true;
        audio.createMediaElementSource(music).connect(musicGain);
      }
      if (!music.paused) return;
      musicGain.gain.cancelScheduledValues(audio.currentTime);
      musicGain.gain.setValueAtTime(.22, audio.currentTime);
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      // Autoplay restrictions or a missing file must not interrupt the game.
      music.play().catch(() => {});
    } catch { /* Audio availability must not interrupt the simulation. */ }
  };
  const visibilityChanged = () => { if (document.hidden) stopMusic(); };
  document.addEventListener('visibilitychange', visibilityChanged);
  cleanups.push(stopMusic, () => document.removeEventListener('visibilitychange', visibilityChanged));
  const tick = (landing = false) => {
    try {
      if (!ensureAudio()) return;
      audioButton.hidden = false;
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      startMusic();
      const notes = [261.63, 293.66, 329.63, 392, 440];
      const frequency = notes[Math.floor(count) % notes.length];
      for (const [index, ratio] of (landing ? [1, 1.25, 1.5] : [2, 1]).entries()) {
        const tone = audio.createOscillator(), volume = audio.createGain();
        const now = audio.currentTime + index * .045;
        tone.type = 'triangle'; tone.frequency.setValueAtTime(frequency * ratio, now);
        volume.gain.setValueAtTime(.0001, now);
        volume.gain.linearRampToValueAtTime(.025, now + .008);
        volume.gain.exponentialRampToValueAtTime(.0001, now + .18);
        tone.connect(volume); volume.connect(outputGain);
        tone.onended = () => { tone.disconnect(); volume.disconnect(); };
        tone.start(now); tone.stop(now + .2);
      }
    } catch { /* Audio availability must not interrupt the simulation. */ }
  };
  cleanups.push(() => {
    if (music) { music.removeAttribute('src'); music.load(); }
    audio?.close().catch(() => {});
  });
  let count = 0;
  const simulation = () => {
    if (!model || model.goal > 20) { const fallback = worked(question, false, search); fallback.prepend(el('p', '', model?.language ? wording(model,model.goal > 20 ? 'interactive.tooMany' : 'interactive.unavailable') : '')); const back = el('button', 'paper-button', 'Back to question'); back.type = 'button'; back.addEventListener('click', leaveHelp); fallback.append(back); return fallback; }
    const panel = el('section', 'conversion-simulation');
    panel.classList.toggle('conversion-submission', submissionMode);
    const targetAmount = el('span', '');
    targetAmount.append(colouredAmount(model,model.small,model.target));
    const intro = el('p', 'conversion-target');
    intro.append(richWording(model, 'interactive.target', {}, {
      target_amount: targetAmount, target: el('span', 'conversion-total', format(model.target)),
    }));
    const controls = el('div', 'conversion-controls');
    const equation = el('div', 'conversion-equation'); equation.setAttribute('aria-live', 'polite'); equation.setAttribute('aria-atomic', 'true');
    equation.dataset.emptyMessage = submissionMode ? `How many ${format(model.factor)}-${model.small} blocks?` : 'Add some blocks to the stack.';
    const buttons = el('p', 'conversion-direct-instruction', 'Click here to stack a block');
    buttons.setAttribute('role', 'status');
    const challenge = el('form', 'conversion-challenge'); challenge.hidden = true;
    const answerLine = el('div', 'conversion-answer-line');
    const answer = el('input', 'conversion-factor-value'); answer.type = 'hidden'; answer.dataset.expectedAnswer = String(model.goal);
    answer.setAttribute('aria-label', wording(model,'interactive.answerLabel'));
    const challengeParts = wording(model,'interactive.challenge',{count:'\uE000'}).split('\uE000');
    const multiplication = el('span', '', challengeParts[0]);
    const total = el('span', '', challengeParts[1]);
    const equationBlank = el('span', 'conversion-count conversion-equation-blank', '____');
    const liveCount = el('span', 'conversion-count conversion-live-count', format(count));
    const mark = el('span', 'conversion-answer-tick'); mark.hidden = true;
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    const result = el('p', 'conversion-complete'); result.setAttribute('role','status');
    let solved = false;
    const checkAnswer = (submitted = false) => {
      if (solved || challenge.hidden) return;
      const text = answer.value.trim();
      if (/^\d+(?:\.\d+)?$/.test(text) && Math.abs(Number(text) - model.goal) < 1e-10) {
        solved = true; answerEditor.setLocked(true); answerEditor.element.blur(); mark.hidden = false;
        panel.dataset.solved = 'true'; result.textContent = '';
        equationBlank.textContent = format(model.goal);
        mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', wording(model,'common.correct'));
        stepFeedback.show(true); requestAnimationFrame(fit);
      } else {
        result.textContent = submitted ? wording(model,'common.tryAgain') : '';
        if (submitted && /^\d+(?:\.\d+)?$/.test(text)) stepFeedback.show(false);
      }
    };
    answerEditor = mountMathInput(answer, { ariaLabel:wording(model,'interactive.inputLabel'), onSubmit:() => checkAnswer(true) });
    answerEditor.element.classList.add('conversion-factor-answer');
    cleanups.push(() => answerEditor.close());
    answer.addEventListener('input', () => checkAnswer());
    challenge.addEventListener('submit', event => { event.preventDefault(); checkAnswer(true); });
    answerLine.append(multiplication, liveCount, equationBlank, total);
    const finalSentence = el('p', 'conversion-worked-conclusion conversion-final-entry');
    const sentenceParts = wording(model,'worked.conclusion',{count:'\uE000',block_units:model.language.common.blockPlural}).split('\uE000');
    finalSentence.append(document.createTextNode(sentenceParts[0]), answer, answerEditor.element, document.createTextNode(sentenceParts[1]), mark);
    emphasizeQuantities(finalSentence, model.language.units, model.large);
    challenge.append(
      emphasizeQuantities(el('p','teach-intent',wording(model,'worked.knownRule')), model.language.units, model.large),
      emphasizeQuantities(el('p','conversion-worked-hint',wording(model,'worked.hint')), model.language.units, model.large),
      answerLine,
      emphasizeQuantities(el('p','conversion-worked-example',wording(model,'worked.example')), model.language.units, model.large),
      finalSentence, result,
    );
    controls.append(equation, challenge);
    const stage = el('div', 'conversion-stage'); stage.setAttribute('role','img');
    const frame = el('div', 'conversion-target-frame');
    frame.style.setProperty('--target-blocks', model.goal);
    const stack = el('div', 'conversion-stack');
    const heightLabel = el('span', 'conversion-height-label');
    heightLabel.append(targetAmount.cloneNode(true));
    const heightMarker = el('div', 'conversion-height-marker');
    heightMarker.setAttribute('aria-hidden', 'true');
    heightMarker.append(heightLabel);
    const wordmark = el('div', 'conversion-tetris-wordmark');
    wordmark.setAttribute('aria-hidden', 'true');
    for (const letter of 'TETRIS') wordmark.append(el('span', '', letter));
    frame.append(wordmark, stack, heightMarker);
    if (!submissionMode) frame.append(buttons); stage.append(frame);
    const stackArea = el('div', 'conversion-stack-area'); stackArea.append(intro, stage);
    const placeIntro = () => {
      if (root.dataset.guidedHelp !== 'true') return;
      if (innerWidth <= 650) {
        if (intro.parentNode !== root) root.prepend(intro);
      } else if (stackArea.lastElementChild !== intro) stackArea.append(intro);
    };
    fit = () => {
      if (!panel.isConnected || panel.hidden || !panel.getClientRects().length) return;
      placeIntro();
      // The expanded completion panel overlays the well instead of resizing it.
      if (controls.querySelector('.conversion-ready-inline[open]')) return;
      root.style.setProperty('--conversion-controls-height', `${controls.getBoundingClientRect().height}px`);
      if (innerWidth <= 650 && panel.dataset.complete === 'true') {
        stage.style.height = `${Math.max(260, controls.getBoundingClientRect().height)}px`;
        return;
      }
      const footer = document.querySelector('.paper-footer');
      const footerTop = footer?.getClientRects().length ? footer.getBoundingClientRect().top : innerHeight;
      const bottom = innerWidth <= 650 ? controls.getBoundingClientRect().top : footerTop;
      const captionHeight = innerWidth > 650 && root.dataset.guidedHelp === 'true' ? intro.getBoundingClientRect().height + 16 : 0;
      const available = Math.max(100, bottom - stage.getBoundingClientRect().top - 40 - captionHeight);
      stage.style.height = `${available}px`;
    };
    window.addEventListener('resize', fit);
    const observer = new ResizeObserver(fit); observer.observe(controls); observer.observe(intro);
    const prompt = root.closest('.paper-question')?.querySelector('.paper-prompt');
    const restorePrompt = focusHelpPrompt(prompt);
    if (prompt) observer.observe(prompt);
    cleanups.push(() => { restorePrompt(); window.removeEventListener('resize',fit); observer.disconnect(); });
    const followStack = () => {
      if (innerWidth <= 650 && panel.dataset.running !== 'true') {
        const anchor = panel.dataset.complete === 'true' ? root.closest('.paper-question') : panel;
        window.scrollTo({top:Math.max(0, anchor.getBoundingClientRect().top + scrollY - 80), behavior:'instant'});
      }
      requestAnimationFrame(fit);
    };
    let manualClicks = 0, automatic = false, stackEpoch = 0;
    let started = false;
    let dropping = false;
    let dropAnimation;
    let completionAccepted = false;
    let completionPending = false;
    const startDialog = el('dialog', 'conversion-ready-dialog');
    startDialog.setAttribute('aria-label', 'Let’s play Tetris to find the answer.');
    startDialog.append(el('p', '', 'Let’s play Tetris to find the answer.'));
    const startActions = el('div', 'conversion-ready-actions');
    const playButton = el('button', 'conversion-ready-continue', 'Let’s play');
    playButton.type = 'button'; startActions.append(playButton); startDialog.append(startActions);
    root.append(startDialog);
    closeStartPrompt = () => { if (startDialog.open) startDialog.close(); };
    cleanups.push(() => { closeStartPrompt(); startDialog.remove(); });
    const completionDialog = el('dialog', 'conversion-ready-dialog');
    completionDialog.setAttribute('aria-label', 'Ready for the original question?');
    completionDialog.append(el('p', '', 'Ready for the original question?'));
    const dialogActions = el('div', 'conversion-ready-actions');
    const retryButton = el('button', 'conversion-ready-retry', 'No, try again');
    const readyButton = el('button', 'conversion-ready-continue', 'Yes, I’m ready');
    retryButton.type = readyButton.type = 'button';
    dialogActions.append(retryButton, readyButton); completionDialog.append(dialogActions);
    completionDialog.classList.add('conversion-ready-inline');
    equation.after(completionDialog);
    let entryHeight = 0;
    let entryReveal, cardReveal;
    let revealEpoch = 0;
    const completionPrompt = createCompletionPrompt(completionDialog,
      () => completionPending && root.isConnected && root.dataset.view === 'stepwise',
      {modal: false,
        beforeShow: () => {
          entryHeight = controls.getBoundingClientRect().height;
          completionDialog.style.animation = 'none';
          completionDialog.style.opacity = '0';
        },
        afterShow: async () => {
          const token = ++revealEpoch;
          const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
          entryReveal?.cancel(); cardReveal?.cancel();
          const finalHeight = controls.getBoundingClientRect().height;
          entryReveal = controls.animate([
            {height:`${entryHeight}px`}, {height:`${finalHeight}px`},
          ], {duration:reducedMotion ? 0 : 350, easing:'ease-in-out'});
          try { await entryReveal.finished; } catch { return; }
          if (token !== revealEpoch || !completionDialog.open) return;
          completionDialog.style.opacity = '1';
          cardReveal = completionDialog.animate([{opacity:0},{opacity:1}],
            {duration:reducedMotion ? 0 : 250,easing:'ease-out'});
        },
      });
    closeCompletionPrompt = () => {
      revealEpoch++; entryReveal?.cancel(); cardReveal?.cancel(); completionPrompt.cancel();
      completionDialog.style.removeProperty('opacity');
    };
    showCompletionPrompt = completionPrompt.schedule;
    cleanups.push(() => { closeCompletionPrompt(); completionDialog.remove(); });
    cleanups.push(() => entryReveal?.cancel());
    cleanups.push(() => dropAnimation?.cancel());
    const update = () => {
      liveCount.textContent = format(count);
      const total = submissionMode ? count * model.factor : Math.min(model.target, count * model.factor);
      const done = Math.abs(count - model.goal) < 1e-10;
      const equationContent = el('span', count === 0 ? 'conversion-empty-message' : '');
      equationContent.append(count === 0
        ? equation.dataset.emptyMessage
        : richWording(model,'interactive.equation',{large_units:unit(model.large,count),small_units:unit(model.small,total)}, {count:el('span','conversion-count',format(count)),total:el('span','conversion-total',format(total))}));
      equation.replaceChildren(equationContent);
      stack.replaceChildren();
      const whole = Math.floor(count), partial = count - whole;
      const visible = Math.min(whole, submissionMode ? model.goal : 20);
      if (!submissionMode && whole > visible) stack.append(el('div','conversion-grouped',wording(model,'interactive.moreBlocks',{count:format(whole-visible),large_units:unit(model.large,whole-visible)})));
      for (let i = 0; i < visible; i++) stack.append(slabLabel('conversion-slab',amount(model,model.small,model.factor)));
      if (partial > 1e-10) {
        const slab = slabLabel('conversion-slab conversion-partial',amount(model,model.small,partial * model.factor));
        slab.style.setProperty('--block-fraction', partial); stack.append(slab);
      }
      stack.style.setProperty('--slab-count', Math.max(1, stack.childElementCount));
      stage.setAttribute('aria-label',wording(model,'interactive.stackLabel',{count:format(count),total:format(total),large_units:unit(model.large,count),small_units:unit(model.small,total)}));
      completionPending = submissionMode
        ? panel.dataset.result === 'correct' && !completionAccepted
        : done && !dropping && started && !completionAccepted;
      const complete = !submissionMode && done && !dropping && !completionPending;
      panel.dataset.complete = String(complete);
      panel.dataset.running = String(started && !complete);
      if (!submissionMode && done && !dropping && !musicFinished) {
        musicFinished = true;
        stepFeedback.show(true);
        if (musicGain && music && !music.paused) {
          const now = audio.currentTime;
          musicGain.gain.cancelScheduledValues(now);
          musicGain.gain.setValueAtTime(musicGain.gain.value, now);
          musicGain.gain.exponentialRampToValueAtTime(.0001, now + 1.4);
          fadeTimer = setTimeout(stopMusic, 1450);
        }
      }
      if (!submissionMode) {
        stage.setAttribute('aria-disabled', String(dropping || automatic || done));
        buttons.hidden = automatic || done;
      }
      challenge.hidden = submissionMode || (!complete && !(root.dataset.guidedHelp === 'true' && innerWidth > 650));
      showCompletionPrompt();
      requestAnimationFrame(fit);
    };
    const retrySimulation = () => {
      if (submissionMode) { resetSubmission(); return; }
      completionPending = false; completionAccepted = false; closeCompletionPrompt();
      resetMusic(); stepFeedback.cancel(); musicFinished = false;
      stackEpoch++; automatic = false; manualClicks = 0;
      count = 0;
      update(); startMusic(); stage.focus({preventScroll:true}); followStack();
    };
    retryButton.addEventListener('click', retrySimulation);
    completionDialog.addEventListener('cancel', event => { event.preventDefault(); retrySimulation(); });
    completionDialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault(); retrySimulation();
      }
    });
    readyButton.addEventListener('click', () => {
      completionAccepted = true; completionPending = false; closeCompletionPrompt();
      if (root.dataset.guidedHelp === 'true') { leaveHelp(); return; }
      update(); followStack();
      finalSentence.tabIndex = -1; finalSentence.focus({preventScroll:true});
    });
    const completionViewportChanged = () => {
      if (innerWidth > 650) closeStartPrompt();
    };
    window.addEventListener('resize', completionViewportChanged);
    cleanups.push(() => window.removeEventListener('resize', completionViewportChanged));
    const addBlock = async () => {
      if (dropping || count >= model.goal) return;
      started = true; dropping = true;
      tick(); count = Math.min(model.goal, Math.floor(count) + 1); update();
      const brick = stack.lastElementChild;
      const distance = Math.max(0, brick.getBoundingClientRect().bottom - stack.getBoundingClientRect().top);
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      dropAnimation = brick.animate([
        { transform: `translateY(-${distance}px)` },
        { transform: 'translateY(0)', offset: .88 },
        { transform: 'translateY(-3px)', offset: .94 },
        { transform: 'translateY(0)' },
      ], { duration: reducedMotion ? 0 : 520, easing: 'ease-in' });
      try { await dropAnimation.finished; } catch { return; }
      dropping = false; tick(true); update(); followStack();
    };
    const activateStack = async () => {
      if (dropping || automatic || count >= model.goal || root.dataset.view !== 'stepwise') return;
      if (manualClicks < 4) { manualClicks++; await addBlock(); return; }
      automatic = true; update();
      const token = stackEpoch;
      while (count < model.goal && token === stackEpoch && root.isConnected) {
        await addBlock();
      }
    };
    if (!submissionMode) {
      stage.setAttribute('role', 'button'); stage.tabIndex = 0;
      stage.addEventListener('click', activateStack);
      stage.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!event.repeat) activateStack(); }
      });
    }
    playButton.addEventListener('click', () => { closeStartPrompt(); activateStack(); });
    const pauseStack = () => {
      stackEpoch++; automatic = false; dropAnimation?.cancel(); dropping = false;
    };
    if (!submissionMode) pauseSubmission = pauseStack;
    cleanups.push(pauseStack);
    if (submissionMode) {
      buttons.remove();
      const form = el('form','conversion-count-entry'); form.noValidate = true;
      const label = el('label','conversion-count-label');
      const {input,editor} = answerField('Number of blocks', () => form.requestSubmit());
      editor.element.classList.add('conversion-factor-answer'); label.append(input,editor.element);
      cleanups.push(() => editor.close());
      const run = el('button','paper-button','Stack Up'); run.type = 'submit'; run.disabled = true;
      const retry = el('button','challenge-feedback conversion-retry-message'); retry.type = 'button'; retry.dataset.correct = 'false';
      const mobileRetry = el('button','conversion-mobile-retry');
      mobileRetry.type = 'button'; mobileRetry.hidden = true;
      controls.append(mobileRetry);
      const feedback = el('div','conversion-feedback'); feedback.setAttribute('role','status');
      feedback.style.opacity = '0';
      let feedbackAnimation;
      const setFeedback = message => {
        if (!message) mobileRetry.hidden = true;
        const opacity = getComputedStyle(feedback).opacity;
        feedbackAnimation?.cancel();
        feedback.inert = !message;
        const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
        if (message) feedback.replaceChildren(message);
        feedback.style.opacity = message ? '1' : '0';
        const animation = feedback.animate([{opacity}, {opacity:feedback.style.opacity}], {duration});
        feedbackAnimation = animation;
        if (!message) animation.finished.then(() => {
          if (feedbackAnimation === animation) feedback.replaceChildren();
        }).catch(() => {});
      };
      cleanups.push(() => feedbackAnimation?.cancel());
      const spill = el('div','conversion-overflow'); spill.setAttribute('aria-hidden','true'); frame.append(spill);
      const entrySlot = el('div', 'conversion-entry-slot');
      const entryFields = el('div', 'conversion-entry-fields');
      form.append(label,run); entryFields.append(form,feedback);
      entrySlot.append(entryFields,completionDialog); controls.append(entrySlot);
      const blockNoun = model.large === 'pair' ? 'pairs' : model.large === 'triple' ? 'groups of 3' : model.large.includes('coin') ? 'coins' : model.large === 'two-square-metre-patch' ? 'patches' : 'blocks';
      let executing = false, attempt = 0;
      input.addEventListener('input', () => {
        run.disabled = !input.value.trim() || executing || ['under','over','correct'].includes(panel.dataset.result);
      });
      resetSubmission = () => {
        completionPending = false; completionAccepted = false; closeCompletionPrompt();
        attempt++; dropAnimation?.cancel(); dropping = false; executing = false;
        resetMusic(); celebration.cancel(); stepFeedback.cancel(); musicFinished = false; count = 0;
        spill.replaceChildren(); frame.classList.remove('conversion-overfilled');
        panel.dataset.result = ''; setFeedback(null); feedback.removeAttribute('data-correct');
        editor.setValue(''); editor.setLocked(false); run.disabled = true;
        update(); startMusic(); requestAnimationFrame(fit);
      };
      pauseSubmission = () => { editor.close(); if (executing) resetSubmission(); };
      cleanups.push(() => { attempt++; });
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (executing || input.dataset.answerLocked === 'true' || ['under','over','correct'].includes(panel.dataset.result)) return;
        if (!input.value.trim()) return;
        const submitted = wholeNumber(input);
        if (submitted === null) { setFeedback(el('p','challenge-feedback','Enter a whole number (0 or more).')); return; }
        audioButton.hidden = false;
        const token = ++attempt; executing = true; editor.setLocked(true); run.disabled = true;
        setFeedback(null); panel.dataset.result = 'running';
        musicFinished = false;
        for (let i=0; i<Math.min(submitted,model.goal); i++) {
          await addBlock();
          if (token !== attempt || !root.isConnected) return;
        }
        if (submitted > model.goal) {
          frame.classList.add('conversion-overfilled');
          const extra = submitted-model.goal;
          const brick = slabLabel('conversion-slab',`${format(extra)} extra ${extra === 1 ? 'block' : 'blocks'}`); spill.append(brick);
          dropAnimation = brick.animate([
            {transform:'translateY(-55px) rotate(0deg)',opacity:0},
            {transform:'translateY(0) rotate(9deg)',opacity:1},
          ],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650,fill:'forwards',easing:'ease-in'});
          try { await dropAnimation.finished; } catch { return; }
          if (token !== attempt || !root.isConnected) return;
          count = submitted; tick(true); update();
        }
        // Finish the stacking soundtrack before revealing either outcome.
        // The landing chord lasts up to 290ms; allow it to decay as music fades.
        musicFinished = true;
        if (audio && musicGain) {
          const now = audio.currentTime;
          musicGain.gain.cancelScheduledValues(now);
          musicGain.gain.setValueAtTime(musicGain.gain.value, now);
          musicGain.gain.exponentialRampToValueAtTime(.0001, now + .45);
        }
        await new Promise(resolve => setTimeout(resolve, 450));
        if (token !== attempt || !root.isConnected) return;
        stopMusic();
        await new Promise(resolve => setTimeout(resolve, 180));
        if (token !== attempt || !root.isConnected) return;
        executing = false;
        const correct = submitted === model.goal;
        panel.dataset.result = correct ? 'correct' : submitted < model.goal ? 'under' : 'over';
        if (correct) setFeedback(null);
        else {
          retry.dataset.correct = 'false';
          retry.textContent = submitted < model.goal ? `More ${blockNoun} needed. Try again.` : 'Too many blocks. Try again.';
          setFeedback(retry);
        }
        editor.setLocked(false);
        stepFeedback.show(correct);
        if (!correct) celebration.error();
        report(root,submitted,correct);
        completionPending = correct; showCompletionPrompt();
        requestAnimationFrame(fit);
        if (!correct) {
          // Let the failed stack settle before presenting the mobile retry action.
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (token !== attempt || !root.isConnected) return;
          mobileRetry.textContent = submitted < model.goal ? 'You need more blocks. Try again.' : 'Too many blocks. Try again.';
          mobileRetry.hidden = false;
        }
      });
      const reviseAnswer = () => {
        if (!['under','over','correct'].includes(panel.dataset.result)) return;
        resetSubmission(); editor.focus();
      };
      retry.addEventListener('click', reviseAnswer);
      mobileRetry.addEventListener('click', () => {
        started = root.dataset.guidedHelp === 'true';
        resetSubmission(); editor.close();
      });
      // Reset on click so opening the mobile keypad cannot move the field
      // between pointerdown and pointerup and cancel the click.
      editor.element.addEventListener('click', reviseAnswer, true);
      editor.element.addEventListener('keyup', event => { if (event.key === 'Tab') reviseAnswer(); });
    }
    const stopButton = el('button', 'conversion-stop-button');
    stopButton.type = 'button'; stopButton.title = 'Close simulation'; stopButton.setAttribute('aria-label', 'Close simulation');
    stopButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#d32f2f" stroke-width="5" stroke-linecap="square" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    stopButton.addEventListener('click', () => {
      if (submissionMode) { resetSubmission(); leaveHelp(); return; }
      if (root.dataset.guidedHelp === 'true') { leaveHelp(); return; }
      pauseStack(); manualClicks = 0; resetMusic(); audio?.suspend().catch(() => {});
      started = false; dropping = false; musicFinished = false;
      completionPending = false; completionAccepted = false; closeCompletionPrompt();
      count = 0;
      update();
      if (innerWidth <= 650) root.closest('.paper-question')?.scrollIntoView({block:'start', behavior:'instant'});
      requestAnimationFrame(fit);
    });
    root.append(stopButton);
    cleanups.push(() => stopButton.remove());
    beginHelp = () => {
      root.dataset.guidedHelp = 'true';
      placeIntro();
      started = true; audioButton.hidden = false; update(); startMusic(); requestAnimationFrame(fit);
    };
    panel.append(controls, stackArea); update(); return panel;
  };
  return { element:root, startHelp() { root.dataset.guidedHelp = 'true'; beginHelp(); }, pause() { stepFeedback.cancel(); pauseSubmission(); closeStartPrompt(); closeCompletionPrompt(); stopMusic(); answerEditor?.close(); }, destroy() { cleanups.forEach(fn => fn()); }, setView(view) {
    stepFeedback.cancel(); closeStartPrompt(); closeCompletionPrompt();
    if (view !== 'stepwise') { pauseSubmission(); stopMusic(); }
    answerEditor?.close();
    if (!views.has(view)) { const panel = view === 'stepwise' ? simulation() : worked(question, view === 'workbook', search); views.set(view,panel); root.append(panel); }
    for (const [key, panel] of views) panel.hidden = key !== view;
    root.dataset.view = view;
    if (view === 'stepwise') { audioButton.hidden = false; startMusic(); }
    requestAnimationFrame(fit); requestAnimationFrame(showCompletionPrompt);
  } };
}
