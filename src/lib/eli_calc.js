// ORG Mode para Eli (2.15): calculadora básica. Evalúa expresiones con + − × ÷, paréntesis,
// porcentajes y decimales con coma o punto, sin eval (la política de seguridad no lo permite).

const OPS = { '+': 1, '-': 1, '*': 2, '/': 2 };

// Normaliza lo que se escribe: × ÷ − → * / -, coma decimal → punto
export const normalizeExpression = (text) =>
  String(text || '')
    .replace(/[×xX]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/,/g, '.')
    .replace(/\s+/g, '');

const tokenize = (expr) => {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const num = expr.slice(i, j);
      if ((num.match(/\./g) || []).length > 1 || num === '.') throw new Error('Número no válido');
      tokens.push({ t: 'num', v: parseFloat(num) });
      i = j;
    } else if ('+-*/()%'.includes(ch)) {
      tokens.push({ t: ch });
      i++;
    } else {
      throw new Error(`Carácter no válido: ${ch}`);
    }
  }
  return tokens;
};

// Analizador recursivo: expr = term (('+'|'-') term)*; term = factor (('*'|'/') factor)*;
// factor = ('-'|'+') factor | primary '%'?; primary = num | '(' expr ')'
export const evaluate = (text) => {
  const expr = normalizeExpression(text);
  if (!expr) return null;
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  let parseExpr;
  const parsePrimary = () => {
    const tok = peek();
    if (!tok) throw new Error('Expresión incompleta');
    if (tok.t === 'num') {
      pos++;
      return tok.v;
    }
    if (tok.t === '(') {
      pos++;
      const v = parseExpr();
      // Paréntesis sin cerrar al final: se cierran solos
      if (peek() && peek().t === ')') pos++;
      else if (peek()) throw new Error('Falta «)»');
      return v;
    }
    throw new Error('Expresión incompleta');
  };
  const parseFactor = () => {
    const tok = peek();
    if (tok && (tok.t === '-' || tok.t === '+')) {
      pos++;
      const v = parseFactor();
      return tok.t === '-' ? -v : v;
    }
    let v = parsePrimary();
    while (peek() && peek().t === '%') {
      pos++;
      v = v / 100;
    }
    return v;
  };
  const parseTerm = () => {
    let v = parseFactor();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = tokens[pos++].t;
      const r = parseFactor();
      if (op === '/' && r === 0) throw new Error('No se puede dividir entre 0');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  parseExpr = () => {
    let v = parseTerm();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[pos++].t;
      // «200 + 10%» = 220 (como en las calculadoras de bolsillo)
      const start = pos;
      let r = parseTerm();
      const last = tokens[pos - 1];
      const isPercent = last && last.t === '%' && pos - start === 2;
      if (isPercent) r = v * r;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const value = parseExpr();
  if (pos < tokens.length) {
    if (tokens[pos].t in OPS) throw new Error('Expresión incompleta');
    throw new Error('Expresión no válida');
  }
  if (!isFinite(value)) throw new Error('Resultado no válido');
  return value;
};

// 1234.5 → «1.234,5» (máx. 10 decimales, sin ceros de sobra)
export const formatNumber = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '';
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toLocaleString('es-ES', { maximumFractionDigits: 10, useGrouping: true });
};

// Para copiar o seguir calculando: sin puntos de miles, con coma decimal
export const plainNumber = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '';
  return String(Math.round(n * 1e10) / 1e10).replace('.', ',');
};
