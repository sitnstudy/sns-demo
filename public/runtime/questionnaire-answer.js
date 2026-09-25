// Shared safe maths parser, extracted from the standard linear-equation player.
function replaceLatexGroups(source, command, groupCount, transform) {
  let value = source;
  let searchFrom = 0;
  while (true) {
    const commandAt = value.indexOf(command, searchFrom);
    if (commandAt < 0) return value;
    let cursor = commandAt + command.length;
    const groups = [];
    let valid = true;
    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      while (value[cursor] === " ") cursor += 1;
      if (value[cursor] !== "{") {
        // MathLive emits compact TeX fractions such as \frac12 and \frac1{23}.
        // An unbraced fraction argument is exactly one token, never a whole number.
        if ((command === "\\frac" || command === "\\dfrac") && /^[0-9a-zA-Z]$/.test(value[cursor] || "")) {
          groups.push(value[cursor]);
          cursor += 1;
          continue;
        }
        valid = false;
        break;
      }
      let depth = 1;
      const start = cursor + 1;
      cursor += 1;
      while (cursor < value.length && depth) {
        if (value[cursor] === "{") depth += 1;
        if (value[cursor] === "}") depth -= 1;
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
    const replacement = transform(...groups);
    value = `${value.slice(0, commandAt)}${replacement}${value.slice(cursor)}`;
    searchFrom = commandAt;
  }
}

function compileMathExpression(source) {
  let value = String(source ?? "")
    .trim()
    .replaceAll("−", "-").replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\(?:,|;|!|quad|qquad)/g, "");
  value = value.replace(/√\s*([^+\-*/=\s]+)/g, "\\sqrt{$1}");
  value = replaceLatexGroups(value, "\\dfrac", 2, (top, bottom) => `((${top})/(${bottom}))`);
  value = replaceLatexGroups(value, "\\frac", 2, (top, bottom) => `((${top})/(${bottom}))`);
  value = replaceLatexGroups(value, "\\sqrt", 1, (inside) => `§(${inside})`);
  value = value
    .replace(/\^\{([^{}]+)\}/g, "^($1)")
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    .replace(/\s+/g, "")
    .replaceAll("^", "**");
  if (!value || /[a-zA-Z]{2,}/.test(value) || !/^[0-9a-zA-Z§+\-*/().]+$/.test(value)) return undefined;
  const variables = [...new Set(value.match(/[a-zA-Z]/g) || [])].sort();
  value = value
    .replace(/(\d|\)|[a-zA-Z])(?=[a-zA-Z§(])/g, "$1*")
    .replace(/([a-zA-Z]|\))(?=\d)/g, "$1*");
  return { value, variables };
}

function evaluateExpression(compiled, assignments = {}) {
  const source = compiled.value;
  let cursor = 0;
  const skipSpaces = () => {
    while (source[cursor] === " ") cursor += 1;
  };
  const consume = (token) => {
    skipSpaces();
    if (!source.startsWith(token, cursor)) return false;
    cursor += token.length;
    return true;
  };
  const parsePrimary = () => {
    skipSpaces();
    if (consume("(")) {
      const value = parseSum();
      if (!consume(")")) throw new Error("Missing closing parenthesis");
      return value;
    }
    if (consume("§")) {
      if (!consume("(")) throw new Error("Square root requires parentheses");
      const value = parseSum();
      if (!consume(")") || value < 0) throw new Error("Invalid square root");
      return Math.sqrt(value);
    }
    const number = source.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];
    if (number) {
      cursor += number.length;
      return Number(number);
    }
    const variable = source[cursor];
    if (/[a-zA-Z]/.test(variable || "")) {
      cursor += 1;
      return Number(assignments[variable] ?? 0);
    }
    throw new Error("Expected a number, variable, or parenthesized expression");
  };
  const parsePower = () => {
    const base = parsePrimary();
    return consume("**") ? base ** parseUnary() : base;
  };
  const parseUnary = () => {
    if (consume("+")) return parseUnary();
    if (consume("-")) return -parseUnary();
    return parsePower();
  };
  const parseProduct = () => {
    let value = parseUnary();
    while (true) {
      if (source.startsWith("**", cursor)) return value;
      if (consume("*")) value *= parseUnary();
      else if (consume("/")) value /= parseUnary();
      else return value;
    }
  };
  const parseSum = () => {
    let value = parseProduct();
    while (true) {
      if (consume("+")) value += parseProduct();
      else if (consume("-")) value -= parseProduct();
      else return value;
    }
  };
  try {
    const result = parseSum();
    skipSpaces();
    return cursor === source.length && Number.isFinite(result) ? result : undefined;
  } catch {
    return undefined;
  }
}

function nearlyEqual(left, right) {
  return Number.isFinite(left) && Number.isFinite(right)
    && Math.abs(left - right) <= 1e-8 * Math.max(1, Math.abs(left), Math.abs(right));
}

function compileEquation(source) {
  const sides = String(source ?? "").split("=");
  if (sides.length !== 2) return undefined;
  const left = compileMathExpression(sides[0]);
  const right = compileMathExpression(sides[1]);
  if (!left || !right) return undefined;
  return { left, right, variables: [...new Set([...left.variables, ...right.variables])].sort() };
}

function equationsEquivalent(expected, entered) {
  const expectedEquation = compileEquation(expected);
  const enteredEquation = compileEquation(entered);
  if (!expectedEquation || !enteredEquation) return false;
  if (expectedEquation.variables.join() !== enteredEquation.variables.join()) return false;
  const variable = expectedEquation.variables[0];
  if (!variable || expectedEquation.variables.length !== 1) return false;
  const difference = (equation, variableValue) => {
    const assignments = { [variable]: variableValue };
    const left = evaluateExpression(equation.left, assignments);
    const right = evaluateExpression(equation.right, assignments);
    return left === undefined || right === undefined ? undefined : left - right;
  };
  const affine = (equation) => {
    const atZero = difference(equation, 0);
    const atOne = difference(equation, 1);
    const atTwo = difference(equation, 2);
    if (![atZero, atOne, atTwo].every(Number.isFinite)) return undefined;
    const coefficient = atOne - atZero;
    if (!nearlyEqual(atTwo, atZero + 2 * coefficient) || nearlyEqual(coefficient, 0)) return undefined;
    return { coefficient, constant: atZero, root: -atZero / coefficient };
  };
  const expectedAffine = affine(expectedEquation);
  const enteredAffine = affine(enteredEquation);
  return Boolean(expectedAffine && enteredAffine && nearlyEqual(expectedAffine.root, enteredAffine.root));
}

function expressionsEquivalent(expected, entered) {
  const expectedExpression = compileMathExpression(expected);
  const enteredExpression = compileMathExpression(entered);
  if (!expectedExpression || !enteredExpression) return false;
  if (expectedExpression.variables.join() !== enteredExpression.variables.join()) return false;
  const samples = expectedExpression.variables.length ? [-2, 0.5, 3, 7, -11] : [0];
  return samples.every((sample) => {
    const assignments = Object.fromEntries(expectedExpression.variables.map((variable, index) => [variable, sample ** (index + 1) + index]));
    return nearlyEqual(
      evaluateExpression(expectedExpression, assignments),
      evaluateExpression(enteredExpression, assignments),
    );
  });
}

function answersEquivalent(expected, entered) {
  // Ordered pairs require both integer coordinates and actual parentheses.
  // MathLive emits \left/\right fences; spaces are presentation only.
  const pairClean = value => String(value ?? '').replace(/\\(?:left|right)/g,'').replaceAll('−','-').replace(/\s+/g,'');
  if (/^\(-?\d+,-?\d+\)$/.test(pairClean(expected))) {
    const actual = pairClean(entered);
    return /^\(-?\d+,-?\d+\)$/.test(actual) && actual === pairClean(expected);
  }
  const cleanEntered = String(entered ?? "").trim();
  if (!cleanEntered) return false;
  const compact = (value) => String(value)
    .trim()
    .replaceAll("−", "-").replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, "")
    .replace(/\s+/g, "");
  if (compact(expected) === compact(cleanEntered)) return true;
  const expectedIsEquation = String(expected).includes("=");
  if (expectedIsEquation !== cleanEntered.includes("=")) return false;
  return expectedIsEquation
    ? equationsEquivalent(expected, cleanEntered)
    : expressionsEquivalent(expected, cleanEntered);
}

export { answersEquivalent };
