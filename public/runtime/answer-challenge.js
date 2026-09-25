import { mountMathInput } from './math-input.js';
// Shared submission UI: no answer feedback is emitted while a draft is edited.
const styleURL = new URL('./answer-challenge.css', import.meta.url).href;
if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === styleURL)) {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = styleURL; document.head.append(link);
}
export const element = (tag, cls, text) => {
  const node = document.createElement(tag); node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
export function answerField(label, onSubmit) {
  const input = element('input', 'challenge-input');
  input.type = 'hidden';
  input.dataset.expectedAnswer = '0';
  input.maxLength = 9;
  const editor = mountMathInput(input, {ariaLabel:label, onSubmit});
  editor.element.classList.add('challenge-input');
  return {input,editor};
}
export function wholeNumber(input) {
  const text = input.value.trim();
  return /^\d{1,9}$/.test(text) ? Number(text) : null;
}
export function report(root, answer, correct) {
  root.dispatchEvent(new CustomEvent('teaching-answer', {bubbles:true, detail:{answer,correct}}));
}
