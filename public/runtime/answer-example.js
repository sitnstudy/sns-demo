import { answersEquivalent } from './questionnaire-answer.js';

// Keep signs, decimal places, grouping and digit counts without giving the answer.
function flipDigits(number, shift) {
  let first = true;
  return number.replace(/\d/g, digit => {
    const leading = first;
    first = false;
    if (leading && /^0\./.test(number)) return digit;
    // Preserve a nonzero leading digit, including in an intercept coordinate.
    if (leading && digit !== '0')
      return String((Number(digit) - 1 + shift) % 9 + 1);
    return String((Number(digit) + shift) % 10);
  });
}

// Format guidance only: never return an example accepted as the answer.
export function answerExample(answer, equivalent = answersEquivalent) {
  const source = String(answer).trim().replace(/\\(?:left|right)/g, '').replaceAll('−', '-');
  const pair = source.match(/^\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/);
  const numbers = [...source.matchAll(/\d[\d,]*(?:\.\d+)?/g)];
  // In an intercept, retain the zero on the axis and change the other coordinate.
  if (pair) {
    const coordinate = Number(pair[1]) === 0 ? 2 : 1;
    for (let shift = 1; shift <= 9; shift++) {
      const values = [pair[1], pair[2]];
      values[coordinate - 1] = values[coordinate - 1].replace(/\d+/, value => flipDigits(value, shift));
      const example = `(${values.join(', ')})`;
      if (!equivalent(answer, example)) return example;
    }
  } else {
    for (const number of numbers) {
      for (let shift = 1; shift <= 9; shift++) {
        const example = source.slice(0, number.index) + flipDigits(number[0], shift) + source.slice(number.index + number[0].length);
        if (!equivalent(answer, example)) return example;
      }
    }
  }
  // Symbol-only answers have no digit count to preserve.
  if (!numbers.length) {
    for (let value = 2; value <= 10; value++) {
      const example = `${value}(${source})`;
      if (!equivalent(answer, example)) return example;
    }
  }
  return null;
}
