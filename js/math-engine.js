/*
 * Derivo — math engine
 * ------------------------------------------------------------
 * A self-contained math typesetting and editing engine:
 *   - document model (rows of atoms and structures)
 *   - LaTeX reader / writer (used for saving, copy & paste)
 *   - TeX-style layout (fractions, scripts, radicals, big operators, matrices…)
 *   - every stretchy symbol (radicals, brackets, braces, bars, fraction rules,
 *     accents, arrows) is drawn by this file as vector paths — no outside fonts
 *     or libraries. Letters, digits and fixed-size operators use the system's
 *     math font (Cambria Math on Windows).
 *   - MathField: a keyboard-first equation editor with autocomplete.
 * Exposes window.MathNotesMath.
 */
(function (global) {
'use strict';

/* =========================================================================
 * Fonts and measuring
 * ========================================================================= */
const FONT_MATH = '"Cambria Math","Latin Modern Math","STIX Two Math","STIXMath","Asana Math","DejaVu Math TeX Gyre","Cambria","Times New Roman",serif';
const FONT_TEXT = '"Cambria","Latin Modern Roman","STIX Two Text","Times New Roman",serif';

const mctx = document.createElement('canvas').getContext('2d');
const mcache = new Map();
function measure(str, font) {
  const key = font + '\u0000' + str;
  let m = mcache.get(key);
  if (m) return m;
  mctx.font = '100px ' + (font === 't' ? FONT_TEXT : FONT_MATH);
  const r = mctx.measureText(str);
  m = {
    w: r.width / 100,
    h: Math.max(0, r.actualBoundingBoxAscent || 0) / 100,
    d: Math.max(0, r.actualBoundingBoxDescent || 0) / 100
  };
  mcache.set(key, m);
  return m;
}

/* Unicode mathematical italic letters (what Word and LaTeX use for variables) */
const GREEK_VAR_IT = { 'ϵ': 0x1D716, 'ϑ': 0x1D717, 'ϕ': 0x1D719, 'ϱ': 0x1D71A, 'ϖ': 0x1D71B };
function italic(ch) {
  const c = ch.codePointAt(0);
  if (c >= 97 && c <= 122) return c === 104 ? '\u210E' : String.fromCodePoint(0x1D44E + c - 97);
  if (c >= 65 && c <= 90) return String.fromCodePoint(0x1D434 + c - 65);
  if (c >= 0x3B1 && c <= 0x3C9) return String.fromCodePoint(0x1D6FC + c - 0x3B1);
  if (GREEK_VAR_IT[ch]) return String.fromCodePoint(GREEK_VAR_IT[ch]);
  return ch;
}

/* =========================================================================
 * Symbol tables
 * ========================================================================= */
const GREEK = { alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ϵ', varepsilon:'ε', zeta:'ζ', eta:'η', theta:'θ', vartheta:'ϑ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν', xi:'ξ', omicron:'ο', pi:'π', varpi:'ϖ', rho:'ρ', varrho:'ϱ', sigma:'σ', varsigma:'ς', tau:'τ', upsilon:'υ', phi:'ϕ', varphi:'φ', chi:'χ', psi:'ψ', omega:'ω' };
const GREEK_UP = { Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π', Sigma:'Σ', Upsilon:'Υ', Phi:'Φ', Psi:'Ψ', Omega:'Ω' };
const ORD = { infty:'∞', partial:'∂', nabla:'∇', emptyset:'∅', varnothing:'∅', hbar:'ℏ', ell:'ℓ', angle:'∠', forall:'∀', exists:'∃', nexists:'∄', neg:'¬', lnot:'¬', prime:'′', ldots:'…', dots:'…', cdots:'⋯', vdots:'⋮', ddots:'⋱', therefore:'∴', because:'∵', aleph:'ℵ', Re:'ℜ', Im:'ℑ', wp:'℘', top:'⊤', triangle:'△', square:'□', degree:'°', backslash:'∖' };
const BIN = { pm:'±', mp:'∓', times:'×', cdot:'·', div:'÷', ast:'∗', star:'⋆', circ:'∘', bullet:'•', cup:'∪', cap:'∩', setminus:'∖', wedge:'∧', land:'∧', vee:'∨', lor:'∨', oplus:'⊕', otimes:'⊗', odot:'⊙' };
const REL = { le:'≤', leq:'≤', ge:'≥', geq:'≥', ne:'≠', neq:'≠', approx:'≈', equiv:'≡', cong:'≅', sim:'∼', simeq:'≃', propto:'∝', in:'∈', notin:'∉', ni:'∋', subset:'⊂', subseteq:'⊆', supset:'⊃', supseteq:'⊇', to:'→', rightarrow:'→', leftarrow:'←', gets:'←', leftrightarrow:'↔', Rightarrow:'⇒', Leftarrow:'⇐', Leftrightarrow:'⇔', implies:'⟹', iff:'⟺', longrightarrow:'⟶', mapsto:'↦', perp:'⊥', parallel:'∥', mid:'∣', ll:'≪', gg:'≫', uparrow:'↑', downarrow:'↓', models:'⊨', vdash:'⊢', coloneqq:'≔' };
const BB = { R:'ℝ', N:'ℕ', Z:'ℤ', Q:'ℚ', C:'ℂ', P:'ℙ', H:'ℍ' };
const BIGOPS = { sum:'∑', prod:'∏', coprod:'∐', int:'∫', iint:'∬', iiint:'∭', oint:'∮', bigcup:'⋃', bigcap:'⋂', bigoplus:'⨁', bigotimes:'⨂' };
const TEXTOPS = { lim:'lim', limsup:'lim sup', liminf:'lim inf', max:'max', min:'min', sup:'sup', inf:'inf', argmax:'arg max', argmin:'arg min' };
const INTEGRALS = { int:1, iint:1, iiint:1, oint:1 };
const AUTO_LIMITS = { sum:1, prod:1, coprod:1, lim:1, bigcup:1, bigcap:1 };
const FNS = ['sin','cos','tan','sec','csc','cot','arcsin','arccos','arctan','sinh','cosh','tanh','coth','ln','log','lg','exp','det','gcd','arg','dim','ker','deg','hom','Pr','mod'];
const FN_SET = new Set(FNS);
const ACCENTS = { vec:'vec', hat:'hat', widehat:'hat', bar:'bar', overline:'bar', dot:'dot', ddot:'ddot', tilde:'tilde', widetilde:'tilde' };
const MATRIX_ENVS = { matrix:['',''], pmatrix:['(',')'], bmatrix:['[',']'], Bmatrix:['{','}'], vmatrix:['|','|'], Vmatrix:['‖','‖'], cases:['{',''], array:['',''], aligned:['',''] };

const SYM = Object.assign({}, GREEK, GREEK_UP, ORD, BIN, REL);
const CHAR = {};      // char -> {cls, it}
const CHAR_TEX = {};  // char -> LaTeX
function addChars(map, cls, it) {
  for (const k in map) {
    const ch = map[k];
    if (!CHAR[ch]) CHAR[ch] = { cls, it };
    if (!CHAR_TEX[ch]) CHAR_TEX[ch] = '\\' + k;
  }
}
addChars(GREEK, 'ord', true);
addChars(GREEK_UP, 'ord', false);
addChars(ORD, 'ord', false);
addChars(BIN, 'bin', false);
addChars(REL, 'rel', false);
for (const k in BB) { CHAR[BB[k]] = { cls:'ord', it:false }; CHAR_TEX[BB[k]] = '\\mathbb{' + k + '}'; }
Object.assign(CHAR_TEX, { '−':'-', '′':"'", '″':"''", '∗':'*', '{':'\\{', '}':'\\}', '#':'\\#', '%':'\\%', '&':'\\&', '$':'\\$', '_':'\\_', '~':'\\sim', '^':'\\hat{}', '\\':'\\backslash' });
const PLAIN = { '+':'bin', '−':'bin', '=':'rel', '<':'rel', '>':'rel', ':':'rel', ',':'punct', ';':'punct', '(':'open', '[':'open', ')':'close', ']':'close', '!':'close', '?':'close' };

function charInfo(ch) {
  if (CHAR[ch]) return CHAR[ch];
  if (PLAIN[ch]) return { cls: PLAIN[ch], it: false };
  if (/^[A-Za-z]$/.test(ch)) return { cls:'ord', it:true };
  return { cls:'ord', it:false };
}

/* Autocomplete words typed inside math: [typed, LaTeX, label for help] */
const SHORTCUT_LIST = [
  ['pi','\\pi','π'],['inf','\\infty','∞'],['oo','\\infty','∞'],['infty','\\infty','∞'],
  ['sum','\\sum','∑'],['prod','\\prod','∏'],['int','\\int','∫'],['iint','\\iint','∬'],
  ['iiint','\\iiint','∭'],['oint','\\oint','∮'],['lim','\\lim','lim'],['sqrt','\\sqrt{#?}','√▢'],
  ['cbrt','\\sqrt[3]{#?}','∛▢'],['nroot','\\sqrt[#?]{#?}','ⁿ√▢'],['frac','\\frac{#?}{#?}','▢⁄▢'],
  ['ddx','\\frac{d}{dx}','d/dx'],['dydx','\\frac{dy}{dx}','dy/dx'],['del','\\partial','∂'],
  ['partial','\\partial','∂'],['grad','\\nabla','∇'],['nabla','\\nabla','∇'],
  ['+-','\\pm','±'],['-+','\\mp','∓'],['xx','\\times','×'],['div','\\div','÷'],
  ['!=','\\ne','≠'],['<=','\\le','≤'],['>=','\\ge','≥'],['~~','\\approx','≈'],['===','\\equiv','≡'],
  ['~=','\\cong','≅'],['prop','\\propto','∝'],['->','\\to','→'],['<-','\\leftarrow','←'],
  ['=>','\\Rightarrow','⇒'],['<=>','\\Leftrightarrow','⇔'],['<->','\\leftrightarrow','↔'],['mapsto','\\mapsto','↦'],
  ['elem','\\in','∈'],['notin','\\notin','∉'],['subset','\\subset','⊂'],['subseteq','\\subseteq','⊆'],
  ['cup','\\cup','∪'],['cap','\\cap','∩'],['empty','\\emptyset','∅'],['forall','\\forall','∀'],
  ['exists','\\exists','∃'],['AA','\\forall','∀'],['EE','\\exists','∃'],['land','\\land','∧'],['lor','\\lor','∨'],
  ['RR','\\mathbb{R}','ℝ'],['NN','\\mathbb{N}','ℕ'],['ZZ','\\mathbb{Z}','ℤ'],['QQ','\\mathbb{Q}','ℚ'],['CC','\\mathbb{C}','ℂ'],
  ['deg','^{\\circ}','°'],['...','\\ldots','…'],['cdots','\\cdots','⋯'],['angle','\\angle','∠'],
  ['perp','\\perp','⊥'],['therefore','\\therefore','∴'],['hbar','\\hbar','ℏ'],['ell','\\ell','ℓ'],
  ['abs','\\left|#?\\right|','|▢|'],['norm','\\left\\|#?\\right\\|','‖▢‖'],['vec','\\vec{#?}','v⃗'],
  ['hat','\\hat{#?}','x̂'],['bar','\\overline{#?}','x̄'],['binom','\\binom{#?}{#?}','(n k)'],
  ['mat','\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}','2×2 matrix'],
  ['mat3','\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}','3×3 matrix'],
  ['cases','\\begin{cases}#?&#?\\\\#?&#?\\end{cases}','{ cases'],
  ['sin','\\sin','sin'],['cos','\\cos','cos'],['tan','\\tan','tan'],['sec','\\sec','sec'],['csc','\\csc','csc'],['cot','\\cot','cot'],
  ['arcsin','\\arcsin','arcsin'],['arccos','\\arccos','arccos'],['arctan','\\arctan','arctan'],
  ['sinh','\\sinh','sinh'],['cosh','\\cosh','cosh'],['tanh','\\tanh','tanh'],
  ['ln','\\ln','ln'],['log','\\log','log'],['exp','\\exp','exp'],['max','\\max','max'],['min','\\min','min'],['det','\\det','det'],
  ['alpha','\\alpha','α'],['beta','\\beta','β'],['gamma','\\gamma','γ'],['delta','\\delta','δ'],['epsilon','\\epsilon','ϵ'],
  ['varepsilon','\\varepsilon','ε'],['zeta','\\zeta','ζ'],['eta','\\eta','η'],['theta','\\theta','θ'],['iota','\\iota','ι'],
  ['kappa','\\kappa','κ'],['lambda','\\lambda','λ'],['mu','\\mu','μ'],['nu','\\nu','ν'],['xi','\\xi','ξ'],['rho','\\rho','ρ'],
  ['sigma','\\sigma','σ'],['tau','\\tau','τ'],['upsilon','\\upsilon','υ'],['phi','\\phi','ϕ'],['varphi','\\varphi','φ'],['chi','\\chi','χ'],['psi','\\psi','ψ'],
  ['omega','\\omega','ω'],['Gamma','\\Gamma','Γ'],['Delta','\\Delta','Δ'],['Theta','\\Theta','Θ'],['Lambda','\\Lambda','Λ'],
  ['Xi','\\Xi','Ξ'],['Pi','\\Pi','Π'],['Sigma','\\Sigma','Σ'],['Phi','\\Phi','Φ'],['Psi','\\Psi','Ψ'],['Omega','\\Omega','Ω']
];
const SHORTCUTS = {};
SHORTCUT_LIST.forEach(function (s) { SHORTCUTS[s[0]] = s[1]; });
const WORDS = SHORTCUT_LIST.map(s => s[0]).filter(w => /^[A-Za-z]+$/.test(w));

/* Names offered after typing "\" */
const COMMANDS = (function () {
  const m = {};
  const add = (name, tex) => { if (!(name in m)) m[name] = tex; };
  SHORTCUT_LIST.forEach(s => { if (/^[A-Za-z0-9]+$/.test(s[0])) add(s[0], s[1]); });
  for (const k in SYM) add(k, '\\' + k);
  for (const k in BIGOPS) add(k, '\\' + k);
  for (const k in TEXTOPS) add(k, '\\' + k);
  FNS.forEach(f => add(f, '\\' + f));
  add('frac', '\\frac{#?}{#?}'); add('sqrt', '\\sqrt{#?}'); add('root', '\\sqrt[#?]{#?}');
  add('text', '\\text{}'); add('binom', '\\binom{#?}{#?}');
  for (const k in ACCENTS) add(k, '\\' + k + '{#?}');
  for (const k in BB) add('mathbb' + k, '\\mathbb{' + k + '}');
  add('pmatrix', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}');
  add('bmatrix', '\\begin{bmatrix}#?&#?\\\\#?&#?\\end{bmatrix}');
  add('vmatrix', '\\begin{vmatrix}#?&#?\\\\#?&#?\\end{vmatrix}');
  add('cases', '\\begin{cases}#?&#?\\\\#?&#?\\end{cases}');
  add('quad', '\\quad'); add('space', '\\;');
  return m;
})();

/* =========================================================================
 * Model
 * ========================================================================= */
function row(items) {
  const r = { t:'row', items: items || [], parent: null };
  r.items.forEach(a => { a.parent = r; });
  return r;
}
function C(ch, src) {
  const inf = charInfo(ch);
  const a = { t:'c', ch, cls: inf.cls, it: inf.it };
  if (src !== undefined) a.src = src;
  return a;
}
function slotsAll(n) {
  switch (n.t) {
    case 'frac': return [n.num, n.den];
    case 'sqrt': return n.idx ? [n.idx, n.body] : [n.body];
    case 'big': return [n.sub, n.sup];
    case 'sc': return [n.sub, n.sup].filter(Boolean);
    case 'dl': case 'acc': case 'txt': return [n.body];
    case 'mat': return [].concat.apply([], n.cells);
    default: return [];
  }
}
/* Slots the caret can move through. Empty optional limits are skipped unless inside. */
function navSlots(n, inside) {
  if (n.t === 'big') return inside ? [n.sub, n.sup] : [n.sub, n.sup].filter(r => r.items.length);
  return slotsAll(n);
}
function setParents(r) {
  r.items.forEach(a => { a.parent = r; setNodeParents(a); });
}
function setNodeParents(n) {
  slotsAll(n).forEach(s => { s.parent = n; setParents(s); });
}
function cloneRow(r) { return row(r.items.map(cloneNode)); }
function cloneNode(n) {
  const o = {};
  for (const k in n) {
    if (k === 'parent') continue;
    const v = n[k];
    if (v && v.t === 'row') o[k] = cloneRow(v);
    else if (k === 'cells') o.cells = v.map(rw => rw.map(cloneRow));
    else o[k] = v;
  }
  slotsAll(o).forEach(s => { s.parent = o; });
  return o;
}
function isEmptyStruct(n) { return slotsAll(n).every(s => !s.items.length); }
function pathOf(pos) {
  const steps = [];
  let r = pos.row;
  while (r.parent) {
    const n = r.parent, pr = n.parent;
    steps.unshift([pr.items.indexOf(n), slotsAll(n).indexOf(r)]);
    r = pr;
  }
  return { steps, i: pos.i };
}
function resolvePath(root, p) {
  let r = root;
  for (const st of p.steps) {
    const n = r.items[st[0]];
    if (!n) break;
    const s = slotsAll(n)[st[1]];
    if (!s) break;
    r = s;
  }
  return { row: r, i: Math.min(p.i, r.items.length) };
}
function firstEmptySlot(nodes) {
  for (const n of nodes) {
    if (n.t === 'big' || n.t === 'sc') continue;
    for (const s of slotsAll(n)) {
      if (!s.items.length) return s;
      const f = firstEmptySlot(s.items);
      if (f) return f;
    }
  }
  return null;
}

/* =========================================================================
 * LaTeX reader
 * ========================================================================= */
function tokenize(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      let j = i + 1;
      if (j < s.length && /[A-Za-z]/.test(s[j])) {
        while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
        toks.push({ k:'cmd', v: s.slice(i + 1, j) });
        i = j;
      } else {
        toks.push({ k:'cmd', v: s[j] || '' });
        i = j + 1;
      }
      continue;
    }
    if (c === '#' && (s[i + 1] === '?' || s[i + 1] === '@')) { toks.push({ k:'ph' }); i += 2; continue; }
    if ('{}^_&'.indexOf(c) >= 0) { toks.push({ k: c }); i++; continue; }
    if (c === '%') { while (i < s.length && s[i] !== '\n') i++; continue; }
    const cp = s.codePointAt(i);
    const ch = String.fromCodePoint(cp);
    toks.push({ k:'ch', v: ch, ws: /\s/.test(ch) });
    i += ch.length;
  }
  return toks;
}

const NOSTOP = () => false;
function Parser(t) { this.t = t; this.i = 0; }
Parser.prototype = {
  peek() { return this.t[this.i]; },
  next() { return this.t[this.i++]; },
  skipWs() { while (this.peek() && this.peek().k === 'ch' && this.peek().ws) this.i++; },
  eat(k, v) { const p = this.peek(); if (p && p.k === k && (v === undefined || p.v === v)) { this.i++; return true; } return false; },
  parseRow(stop) {
    const items = [];
    for (;;) {
      this.skipWs();
      const tk = this.peek();
      if (!tk || tk.k === '}' || stop(tk)) break;
      this.atom(items, stop);
    }
    return items;
  },
  arg() {
    this.skipWs();
    const tk = this.peek();
    if (!tk) return row([]);
    if (tk.k === '{') { this.next(); const it = this.parseRow(NOSTOP); this.eat('}'); return row(it); }
    if (tk.k === 'ph') { this.next(); return row([]); }
    const tmp = [];
    this.atom(tmp, NOSTOP);
    return row(tmp);
  },
  rawGroup() {
    this.skipWs();
    if (!this.peek()) return '';
    if (this.peek().k !== '{') { const tk = this.next(); return tk.v || ''; }
    this.next();
    let depth = 1, out = '';
    while (this.peek()) {
      const tk = this.next();
      if (tk.k === '{') { depth++; out += '{'; continue; }
      if (tk.k === '}') { if (--depth === 0) break; out += '}'; continue; }
      if (tk.k === 'ch') out += tk.v;
      else if (tk.k === 'cmd') out += (tk.v.length === 1 ? tk.v : '\\' + tk.v);
      else if (tk.k === 'ph') { /* placeholder: nothing */ }
      else out += tk.k;
    }
    return out;
  },
  delim() {
    this.skipWs();
    const tk = this.next();
    if (!tk) return '';
    if (tk.k === 'ch') return tk.v === '.' ? '' : tk.v;
    if (tk.k === 'cmd') {
      const m = { '{':'{', '}':'}', '|':'‖', langle:'⟨', rangle:'⟩', lvert:'|', rvert:'|', vert:'|', Vert:'‖', lVert:'‖', rVert:'‖', lbrace:'{', rbrace:'}', lfloor:'⌊', rfloor:'⌋', lceil:'⌈', rceil:'⌉', lbrack:'[', rbrack:']' };
      return m[tk.v] !== undefined ? m[tk.v] : '';
    }
    return '';
  },
  fence(open, close, items, endTest, stop) {
    const save = this.i;
    const inner = this.parseRow(t => endTest(t) || stop(t));
    const tk = this.peek();
    if (tk && endTest(tk)) {
      this.next();
      items.push({ t:'dl', l: open, r: close, body: row(inner) });
      return;
    }
    this.i = save;
    items.push(C(open === '‖' ? '‖' : open));
  },
  script(items, which) {
    const g = this.arg();
    const prev = items[items.length - 1];
    if (prev && prev.t === 'big' && !prev[which].items.length) { prev[which] = g; return; }
    if (prev && prev.t === 'sc' && !prev[which]) { prev[which] = g; return; }
    const sc = { t:'sc', sub:null, sup:null };
    sc[which] = g;
    items.push(sc);
  },
  atom(items, stop) {
    const tk = this.next();
    switch (tk.k) {
      case 'ph': return;
      case '{': { const inner = this.parseRow(NOSTOP); this.eat('}'); items.push.apply(items, inner); return; }
      case '^': return this.script(items, 'sup');
      case '_': return this.script(items, 'sub');
      case '&': return;
      case 'ch': return this.char(tk.v, items, stop);
      case 'cmd': return this.cmd(tk.v, items, stop);
    }
  },
  char(ch, items, stop) {
    if (ch === "'") { items.push(C('′')); return; }
    if (ch === '-') { items.push(C('−')); return; }
    if (ch === '*') { items.push(C('∗')); return; }
    if (ch === '(') return this.fence('(', ')', items, t => t.k === 'ch' && t.v === ')', stop);
    if (ch === '[') return this.fence('[', ']', items, t => t.k === 'ch' && t.v === ']', stop);
    if (ch === '|') return this.fence('|', '|', items, t => t.k === 'ch' && t.v === '|', stop);
    items.push(C(ch));
  },
  cmd(name, items, stop) {
    if (SYM[name]) { items.push(C(SYM[name])); return; }
    if (BIGOPS[name] || TEXTOPS[name]) { items.push({ t:'big', op: name, sub: row([]), sup: row([]) }); return; }
    if (FN_SET.has(name)) { items.push({ t:'fn', name }); return; }
    if (ACCENTS[name]) { items.push({ t:'acc', a: ACCENTS[name], body: this.arg() }); return; }
    switch (name) {
      case 'frac': case 'dfrac': case 'tfrac': case 'cfrac':
        items.push({ t:'frac', num: this.arg(), den: this.arg(), bar: true }); return;
      case 'binom': case 'dbinom': case 'tbinom': {
        const f = { t:'frac', num: this.arg(), den: this.arg(), bar: false };
        items.push({ t:'dl', l:'(', r:')', body: row([f]) }); return;
      }
      case 'sqrt': {
        this.skipWs();
        let idx = null;
        if (this.peek() && this.peek().k === 'ch' && this.peek().v === '[') {
          this.next();
          idx = row(this.parseRow(t => t.k === 'ch' && t.v === ']'));
          this.eat('ch', ']');
        }
        items.push({ t:'sqrt', idx, body: this.arg() }); return;
      }
      case 'left': {
        const l = this.delim();
        const inner = this.parseRow(t => (t.k === 'cmd' && t.v === 'right') || stop(t));
        let r = '';
        if (this.eat('cmd', 'right')) r = this.delim();
        items.push({ t:'dl', l, r, body: row(inner) }); return;
      }
      case 'right': this.delim(); return;
      case 'mathbb': case 'Bbb': case 'mathbf': case 'boldsymbol': case 'mathit': case 'mathcal': case 'mathsf': {
        const g = this.arg();
        if (name === 'mathbb' || name === 'Bbb') g.items.forEach(a => items.push(a.t === 'c' && BB[a.ch] ? C(BB[a.ch]) : a));
        else items.push.apply(items, g.items);
        return;
      }
      case 'text': case 'textrm': case 'mathrm': case 'textit': case 'mbox': case 'textbf': case 'operatorname': {
        const s = this.rawGroup();
        if (name === 'operatorname') { items.push({ t:'fn', name: s }); return; }
        items.push({ t:'txt', body: row(Array.from(s).map(ch => ({ t:'c', ch, cls:'txt', it:false }))) });
        return;
      }
      case 'begin': {
        const env = this.rawGroup();
        if (env === 'array') this.rawGroup();  // column spec
        const rows = [];
        let cur = [];
        for (;;) {
          const it = this.parseRow(t => t.k === '&' || (t.k === 'cmd' && (t.v === '\\' || t.v === 'end' || t.v === 'cr')) || stop(t));
          cur.push(row(it));
          const tk = this.next();
          if (!tk) { rows.push(cur); break; }
          if (tk.k === '&') continue;
          if (tk.k === 'cmd' && (tk.v === '\\' || tk.v === 'cr')) { rows.push(cur); cur = []; continue; }
          if (tk.k === 'cmd' && tk.v === 'end') { this.rawGroup(); rows.push(cur); break; }
          rows.push(cur); break;
        }
        if (rows.length > 1) {
          const last = rows[rows.length - 1];
          if (last.length === 1 && !last[0].items.length) rows.pop();
        }
        const cols = Math.max.apply(null, rows.map(r => r.length));
        rows.forEach(r => { while (r.length < cols) r.push(row([])); });
        items.push({ t:'mat', env: MATRIX_ENVS[env] ? env : 'matrix', cells: rows });
        return;
      }
      case ',': case 'thinspace': items.push({ t:'sp', w:0.167 }); return;
      case ':': case '>': case 'medspace': items.push({ t:'sp', w:0.222 }); return;
      case ';': case 'thickspace': items.push({ t:'sp', w:0.278 }); return;
      case ' ': items.push({ t:'sp', w:0.25 }); return;
      case 'quad': items.push({ t:'sp', w:1 }); return;
      case 'qquad': items.push({ t:'sp', w:2 }); return;
      case '{': return this.fence('{', '}', items, t => t.k === 'cmd' && t.v === '}', stop);
      case '}': items.push(C('}')); return;
      case '|': return this.fence('‖', '‖', items, t => t.k === 'cmd' && t.v === '|', stop);
      case 'langle': return this.fence('⟨', '⟩', items, t => t.k === 'cmd' && t.v === 'rangle', stop);
      case 'lvert': return this.fence('|', '|', items, t => t.k === 'cmd' && t.v === 'rvert', stop);
      case 'lfloor': return this.fence('⌊', '⌋', items, t => t.k === 'cmd' && t.v === 'rfloor', stop);
      case 'lceil': return this.fence('⌈', '⌉', items, t => t.k === 'cmd' && t.v === 'rceil', stop);
      case 'rangle': items.push(C('⟩')); return;
      case 'displaystyle': case 'textstyle': case 'limits': case 'nolimits': case '!': case '\\': case 'cr': case 'nonumber': return;
      case '%': case '$': case '#': case '&': case '_': items.push(C(name)); return;
      case 'backslash': items.push(C('∖')); return;
      default:
        if (name) items.push({ t:'fn', name });
    }
  }
};
function parseLatex(s) {
  const p = new Parser(tokenize(String(s || '')));
  const items = [];
  while (p.peek()) {
    items.push.apply(items, p.parseRow(NOSTOP));
    if (p.peek()) p.next();  // skip a stray "}"
  }
  const r = row(items);
  setParents(r);
  return r;
}

/* =========================================================================
 * LaTeX writer
 * ========================================================================= */
function cat(parts) {
  let out = '';
  for (const s of parts) {
    if (!s) continue;
    if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z0-9]/.test(s)) out += ' ';
    out += s;
  }
  return out;
}
function texRow(r) { return cat(r.items.map(texNode)); }
function grp(r) { return '{' + texRow(r) + '}'; }
const DELIM_TEX = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '': '.' };
function texNode(a) {
  switch (a.t) {
    case 'c':
      if (a.cls === 'txt') return a.ch;
      return CHAR_TEX[a.ch] || a.ch;
    case 'fn': return FN_SET.has(a.name) ? '\\' + a.name : '\\operatorname{' + a.name + '}';
    case 'big': {
      let s = '\\' + a.op;
      if (a.sub.items.length) s += '_' + grp(a.sub);
      if (a.sup.items.length) s += '^' + grp(a.sup);
      return s;
    }
    case 'sc': return (a.sub ? '_' + grp(a.sub) : '') + (a.sup ? '^' + grp(a.sup) : '');
    case 'frac': return '\\frac' + grp(a.num) + grp(a.den);
    case 'sqrt': return '\\sqrt' + (a.idx ? '[' + texRow(a.idx) + ']' : '') + grp(a.body);
    case 'dl': {
      if (a.l === '(' && a.r === ')' && a.body.items.length === 1 && a.body.items[0].t === 'frac' && a.body.items[0].bar === false) {
        const f = a.body.items[0];
        return '\\binom' + grp(f.num) + grp(f.den);
      }
      return cat(['\\left' + (DELIM_TEX[a.l] !== undefined ? DELIM_TEX[a.l] : '.'), texRow(a.body), '\\right' + (DELIM_TEX[a.r] !== undefined ? DELIM_TEX[a.r] : '.')]);
    }
    case 'acc': return '\\' + ({ vec:'vec', hat:'hat', bar:'overline', dot:'dot', ddot:'ddot', tilde:'tilde' })[a.a] + grp(a.body);
    case 'txt': return '\\text{' + a.body.items.map(c => '{}\\%$#&_'.indexOf(c.ch) >= 0 ? '\\' + c.ch : c.ch).join('') + '}';
    case 'mat': return '\\begin{' + a.env + '}' + a.cells.map(rw => rw.map(texRow).join('&')).join('\\\\') + '\\end{' + a.env + '}';
    case 'sp': return a.w >= 1.9 ? '\\qquad' : a.w >= 0.9 ? '\\quad' : a.w >= 0.27 ? '\\;' : a.w >= 0.2 ? '\\:' : '\\,';
  }
  return '';
}

/* =========================================================================
 * Layout — boxes in em units, y pointing up, baseline at y = 0
 * ========================================================================= */
const AXIS = 0.25;   // height of the math axis (centre of fraction bars, minus signs)
const RULE = 0.05;   // thickness of fraction bars and radical vincula

function mkBox(w, h, d) { return { w, h, d, kids: [], p: [], r: [] }; }
function put(dst, src, dx, dy) { dst.kids.push({ b: src, dx, dy }); }

function atomCls(a) {
  switch (a.t) {
    case 'c': return a.cls === 'txt' ? 'ord' : a.cls;
    case 'fn': case 'big': return 'op';
    default: return 'ord';
  }
}
function spaceBetween(a, b, s) {
  const thin = 0.167, med = 0.222, thick = 0.278;
  let w = 0;
  if (a === 'open' || b === 'close' || b === 'punct') w = 0;
  else if (a === 'bin' || b === 'bin') w = med;
  else if (a === 'rel' || b === 'rel') w = (a === 'rel' && b === 'rel') ? 0 : thick;
  else if (a === 'punct') w = thin;
  else if (a === 'op' && (b === 'ord' || b === 'op')) w = thin;
  else if (a === 'ord' && b === 'op') w = thin;
  if (s < 0.9 && w !== thin) w *= 0.45;
  return w * s;
}

function layoutRow(r, st, need) {
  const s = st.s, items = r.items;
  const box = mkBox(0, 0, 0);
  if (!items.length) {
    let xs;
    if (!r.parent) { box.w = 0.45 * s; box.h = 0.68 * s; box.d = 0.2 * s; xs = [0.06 * s]; }
    else if (need) {
      box.w = 0.56 * s; box.h = 0.7 * s; box.d = 0.08 * s;
      box.p.push({ k:'ph', x: 0.06 * s, y: -0.06 * s, w: 0.44 * s, h: 0.74 * s });
      xs = [0.12 * s];
    } else { xs = [0]; }
    box.r.push({ row: r, xs, y: 0, h: Math.max(box.h, 0.68 * s), d: Math.max(box.d, 0.2 * s) });
    return box;
  }
  const parts = [];
  let lastBox = null, lastItem = null;
  for (const a of items) {
    if (a.t === 'sc') parts.push({ b: layScripts(a, lastBox, lastItem, st), cls: 'sc', a });
    else {
      const b = layAtom(a, st);
      parts.push({ b, cls: atomCls(a), a });
      lastBox = b; lastItem = a;
    }
  }
  // decide which binary operators are really unary/ordinary (TeX rules)
  const real = parts.filter(p => p.cls !== 'sc');
  for (let k = 0; k < real.length; k++) {
    if (real[k].cls !== 'bin') continue;
    const prev = k > 0 ? real[k - 1].cls : null;
    const next = k < real.length - 1 ? real[k + 1].cls : null;
    if (prev === null || prev === 'bin' || prev === 'rel' || prev === 'open' || prev === 'punct' || prev === 'op' ||
        next === null || next === 'rel' || next === 'close' || next === 'punct') real[k].cls = 'ord';
  }
  const xs = [0];
  let x = 0, prev = null;
  for (let k = 0; k < parts.length; k++) {
    const P = parts[k];
    let g = 0;
    if (P.cls !== 'sc') { g = prev === null ? 0 : spaceBetween(prev, P.cls, s); prev = P.cls; }
    if (k > 0) xs.push(x + g / 2);
    x += g;
    put(box, P.b, x, 0);
    x += P.b.w;
    box.h = Math.max(box.h, P.b.h);
    box.d = Math.max(box.d, P.b.d);
  }
  xs.push(x);
  box.w = x;
  box.r.push({ row: r, xs, y: 0, h: Math.max(box.h, 0.68 * s), d: Math.max(box.d, 0.2 * s) });
  return box;
}

function glyphBox(str, s, f) {
  const m = measure(str, f);
  const b = mkBox(m.w * s, m.h * s, m.d * s);
  b.p.push({ k:'t', x: 0, y: 0, s, str, f });
  return b;
}

function layAtom(a, st) {
  const s = st.s;
  switch (a.t) {
    case 'c': {
      if (a.cls === 'txt') return glyphBox(a.ch === ' ' ? '\u00A0' : a.ch, s, 't');
      if (a.ch === '′' || a.ch === '″') {           // primes sit high, like a superscript
        const b = glyphBox(a.ch, s * 0.82, 'm');
        const m = measure(a.ch, 'm');
        const lift = Math.max(0, 0.68 * s - m.h * s * 0.82);
        const box = mkBox(b.w + 0.03 * s, b.h + lift, 0);
        put(box, b, 0.02 * s, lift);
        return box;
      }
      if (a.it) {
        const b = glyphBox(italic(a.ch), s, 'm');
        b.w += 0.015 * s;
        return b;
      }
      return glyphBox(a.ch, s, 'm');
    }
    case 'fn': return glyphBox(a.name, s, 'm');
    case 'big': return layBig(a, st);
    case 'frac': return layFrac(a, st);
    case 'sqrt': return laySqrt(a, st);
    case 'dl': return layDelim(a, st);
    case 'acc': return layAcc(a, st);
    case 'txt': {
      const body = layoutRow(a.body, st, st.active.has(a));
      const b = mkBox(body.w + 0.1 * s, body.h, body.d);
      put(b, body, 0.05 * s, 0);
      return b;
    }
    case 'mat': return layMat(a, st);
    case 'sp': return mkBox(a.w * s, 0, 0);
  }
  return mkBox(0, 0, 0);
}

/* ---------- fractions ---------- */
function layFrac(n, st) {
  const s = st.s, a = AXIS * s, t = RULE * s;
  const cs = { s: st.disp ? s : Math.max(0.55, s * 0.8), disp: false, active: st.active };
  const nb = layoutRow(n.num, cs, true), db = layoutRow(n.den, cs, true);
  const gap = (st.disp ? 0.15 : 0.1) * s;
  const pad = 0.08 * s, side = 0.07 * s;
  const inner = Math.max(nb.w, db.w) + 2 * pad;
  const W = inner + 2 * side;
  const numY = a + t / 2 + gap + Math.max(nb.d, 0.02 * cs.s);
  const denY = a - t / 2 - gap - Math.max(db.h, 0.62 * cs.s);
  const b = mkBox(W, numY + nb.h, Math.max(0, -denY + db.d));
  put(b, nb, side + (inner - nb.w) / 2, numY);
  put(b, db, side + (inner - db.w) / 2, denY);
  if (n.bar !== false) b.p.push({ k:'r', x: side, y: a - t / 2, w: inner, h: t });
  return b;
}

/* ---------- sub/superscripts ---------- */
function layScripts(n, base, bi, st) {
  const s = st.s, ss = Math.max(0.5, s * 0.7);
  const cs = { s: ss, disp: false, active: st.active };
  const sup = n.sup ? layoutRow(n.sup, cs, true) : null;
  const sub = n.sub ? layoutRow(n.sub, cs, true) : null;
  const simple = !bi || bi.t === 'c' || bi.t === 'fn';
  const bh = base ? base.h : 0.6 * s, bd = base ? base.d : 0;
  let u = 0, v = 0;
  if (sup) { u = simple ? 0.36 * s : Math.max(0.36 * s, bh - 0.3 * s); u = Math.max(u, sup.d + 0.12 * s); }
  if (sub) {
    v = simple ? 0.15 * s : Math.max(0.15 * s, bd + 0.08 * s);
    v = Math.max(v, sub.h - 0.36 * s);
    if (sup) v = Math.max(v, 0.24 * s);
  }
  if (sup && sub) {
    const gap = (u - sup.d) - (sub.h - v), min = 0.18 * s;
    if (gap < min) { u += (min - gap) / 2; v += (min - gap) / 2; }
  }
  const kern = (bi && bi.t === 'c' && bi.it) ? 0.04 * s : 0.02 * s;
  const w = Math.max(sup ? sup.w + kern : 0, sub ? sub.w + 0.01 * s : 0) + 0.03 * s;
  const b = mkBox(w, sup ? u + sup.h : 0, sub ? v + sub.d : 0);
  if (sup) put(b, sup, kern, u);
  if (sub) put(b, sub, 0.01 * s, -v);
  return b;
}

/* ---------- big operators: sums, products, integrals, limits ---------- */
function layBig(n, st) {
  const s = st.s, a = AXIS * s, active = st.active.has(n);
  const isInt = !!INTEGRALS[n.op], sym = BIGOPS[n.op];
  const cs = { s: Math.max(0.5, s * 0.7), disp: false, active: st.active };
  const sub = (n.sub.items.length || active) ? layoutRow(n.sub, cs, active) : null;
  const sup = (n.sup.items.length || active) ? layoutRow(n.sup, cs, active) : null;
  let op;
  if (sym) {
    const F = s * (st.disp ? (isInt ? 2.0 : 1.55) : (isInt ? 1.3 : 1.12));
    const m = measure(sym, 'm');
    const y0 = a - (m.h - m.d) * F / 2;
    op = mkBox(m.w * F + (isInt ? 0.06 * s : 0.02 * s), y0 + m.h * F, -(y0 - m.d * F));
    op.p.push({ k:'t', x: 0, y: y0, s: F, str: sym, f:'m' });
  } else {
    op = glyphBox(TEXTOPS[n.op] || n.op, s, 'm');
  }
  if (!sub && !sup) return op;
  if (st.disp && !isInt) {
    const W = Math.max(op.w, sub ? sub.w : 0, sup ? sup.w : 0);
    const b = mkBox(W, op.h, op.d);
    put(b, op, (W - op.w) / 2, 0);
    if (sup) { const y = op.h + 0.1 * s + sup.d; put(b, sup, (W - sup.w) / 2, y); b.h = y + sup.h; }
    if (sub) { const y = -op.d - 0.1 * s - sub.h; put(b, sub, (W - sub.w) / 2, y); b.d = -y + sub.d; }
    return b;
  }
  let supX, subX, u, v;
  if (isInt) {
    supX = op.w; subX = op.w * 0.55;
    u = sup ? op.h - 0.62 * Math.max(sup.h, 0.45 * s) : 0;
    v = op.d - 0.06 * s;
  } else if (sym) {
    supX = subX = op.w + 0.03 * s;
    u = sup ? Math.max(0.36 * s, op.h - 0.55 * sup.h) : 0;
    v = Math.max(0.16 * s, op.d * 0.9);
  } else {
    supX = subX = op.w + 0.03 * s;
    u = 0.36 * s; v = Math.max(0.16 * s, op.d + 0.12 * s);
  }
  const b = mkBox(op.w, op.h, op.d);
  put(b, op, 0, 0);
  let w = op.w;
  if (sup) { put(b, sup, supX, u); b.h = Math.max(b.h, u + sup.h); w = Math.max(w, supX + sup.w); }
  if (sub) { put(b, sub, subX, -v); b.d = Math.max(b.d, v + sub.d); w = Math.max(w, subX + sub.w); }
  b.w = w + 0.04 * s;
  return b;
}

/* ---------- radicals: drawn as one connected shape ---------- */
function laySqrt(n, st) {
  const s = st.s, t = RULE * s;
  const body = layoutRow(n.body, st, true);
  const gap = (st.disp ? 0.14 : 0.11) * s;
  const bh = Math.max(body.h, 0.7 * s), bd = Math.max(body.d, 0.04 * s);
  const top = bh + gap + t;             // top edge of the vinculum
  const bottom = -bd - 0.07 * s;        // lowest point of the sign
  const H = top - bottom;
  const hb = 0.1 * s;                   // width of the little hook
  const yB = bottom + Math.min(0.5 * s, 0.56 * H);
  const yA = yB - 0.07 * s;
  const Cx = hb + 0.17 * s;             // bottom vertex
  const dx = Math.min(0.34 * H, 0.26 * s + 0.07 * H);
  let idx = null, shift = 0;
  if (n.idx) {
    const cs = { s: Math.max(0.5, s * 0.6), disp: false, active: st.active };
    idx = layoutRow(n.idx, cs, true);
    const room = hb + 0.12 * s;
    if (idx.w > room) shift = idx.w - room;
  }
  const Dx = Cx + 0.03 * s + dx;        // where the up-stroke meets the vinculum
  const bodyX = Dx + 0.07 * s;
  const endX = bodyX + body.w + 0.07 * s;
  const X = v => v + shift;
  const b = mkBox(X(endX) + 0.03 * s, top, -bottom);
  b.p.push({ k:'p', sw: t * 1.1, cap:'round', d: [['M', X(0.005 * s), yA], ['L', X(hb), yB]] });
  const th = 0.09 * s;
  b.p.push({ k:'p', fill: true, d: [['M', X(hb - 0.012 * s), yB + 0.018 * s], ['L', X(hb + th), yB - 0.004 * s], ['L', X(Cx + 0.05 * s), bottom], ['L', X(Cx), bottom], ['Z']] });
  b.p.push({ k:'p', sw: t, join:'miter', d: [['M', X(Cx + 0.025 * s), bottom + 0.01 * s], ['L', X(Dx), top - t / 2], ['L', X(endX), top - t / 2]] });
  put(b, body, X(bodyX), 0);
  if (idx) {
    const iy = yB + 0.1 * s + idx.d;
    put(b, idx, X(hb + 0.12 * s) - idx.w, iy);
    b.h = Math.max(b.h, iy + idx.h);
  }
  return b;
}

/* ---------- stretchy delimiters ---------- */
const CLOSE_OF = { ')':'(', ']':'[', '}':'{', '⟩':'⟨', '⌋':'⌊', '⌉':'⌈' };
function drawDelim(ch, yb, yt, s) {
  const H = yt - yb, mid = (yt + yb) / 2;
  const shape = CLOSE_OF[ch] || ch, mirror = !!CLOSE_OF[ch];
  const P = [];
  let w = 0;
  const rect = (x, y, rw, rh) => P.push({ k:'p', fill: true, d: [['M', x, y], ['L', x + rw, y], ['L', x + rw, y + rh], ['L', x, y + rh], ['Z']] });
  switch (shape) {
    case '(': {
      const bulge = Math.min(0.42 * s, 0.17 * s + 0.06 * H);
      const x0 = 0.07 * s, x1 = x0 + bulge;
      const th = Math.min(0.12 * s, 0.06 * s + 0.014 * H), e = 0.022 * s;
      const k = H * 0.2;
      const xo = (8 * x0 - 2 * x1) / 6, xi = (8 * (x0 + th) - 2 * (x1 + e)) / 6;
      P.push({ k:'p', fill: true, d: [['M', x1 + e, yt], ['C', xi, yt - k, xi, yb + k, x1 + e, yb], ['L', x1, yb], ['C', xo, yb + k, xo, yt - k, x1, yt], ['Z']] });
      w = x1 + e + 0.05 * s;
      break;
    }
    case '[': {
      const tb = 0.058 * s, x0 = 0.09 * s, ser = 0.2 * s;
      rect(x0, yb, tb, H); rect(x0, yt - tb * 0.9, ser, tb * 0.9); rect(x0, yb, ser, tb * 0.9);
      w = x0 + ser + 0.05 * s;
      break;
    }
    case '{': {
      const xt = 0.07 * s, xm = xt + 0.17 * s, xe = xm + 0.16 * s;
      const r = Math.min(0.16 * s, H / 7);
      P.push({ k:'p', sw: 0.062 * s, cap:'round', join:'round', d: [['M', xe, yt], ['Q', xm, yt, xm, yt - r], ['L', xm, mid + r], ['Q', xm, mid, xt, mid], ['Q', xm, mid, xm, mid - r], ['L', xm, yb + r], ['Q', xm, yb, xe, yb]] });
      w = xe + 0.05 * s;
      break;
    }
    case '|': rect(0.1 * s, yb, 0.056 * s, H); w = 0.26 * s; break;
    case '‖': rect(0.1 * s, yb, 0.052 * s, H); rect(0.22 * s, yb, 0.052 * s, H); w = 0.38 * s; break;
    case '⟨': {
      const x0 = 0.08 * s, x1 = x0 + Math.min(0.36 * s, 0.14 * s + 0.08 * H);
      P.push({ k:'p', sw: 0.055 * s, join:'miter', d: [['M', x1, yt], ['L', x0, mid], ['L', x1, yb]] });
      w = x1 + 0.06 * s;
      break;
    }
    case '⌊': rect(0.09 * s, yb, 0.056 * s, H); rect(0.09 * s, yb, 0.22 * s, 0.052 * s); w = 0.36 * s; break;
    case '⌈': rect(0.09 * s, yb, 0.056 * s, H); rect(0.09 * s, yt - 0.052 * s, 0.22 * s, 0.052 * s); w = 0.36 * s; break;
    case '': w = 0.04 * s; break;
    default: {
      const m = measure(ch, 'm');
      const y0 = AXIS * s - (m.h - m.d) * s / 2;
      P.push({ k:'t', x: 0, y: y0, s, str: ch, f:'m' });
      w = m.w * s;
    }
  }
  const b = mkBox(w, yt, -yb);
  if (mirror) P.forEach(p => { if (p.d) p.d = p.d.map(seg => { const o = [seg[0]]; for (let i = 1; i < seg.length; i += 2) o.push(w - seg[i], seg[i + 1]); return o; }); });
  b.p = P;
  return b;
}
function wrapDelims(inner, l, r, s) {
  const a = AXIS * s;
  const half = Math.max(inner.h - a, inner.d + a, 0.5 * s) + 0.08 * s;
  const yb = a - half, yt = a + half;
  const L = drawDelim(l, yb, yt, s), R = drawDelim(r, yb, yt, s);
  const pad = 0.025 * s;
  const b = mkBox(L.w + pad + inner.w + pad + R.w, Math.max(yt, inner.h), Math.max(-yb, inner.d));
  put(b, L, 0, 0);
  put(b, inner, L.w + pad, 0);
  put(b, R, L.w + pad + inner.w + pad, 0);
  return b;
}
function layDelim(n, st) {
  const body = layoutRow(n.body, st, st.active.has(n));
  return wrapDelims(body, n.l, n.r, st.s);
}

/* ---------- accents (vector arrow, hat, bar, dots, tilde) ---------- */
function layAcc(n, st) {
  const s = st.s, t = 0.045 * s;
  const body = layoutRow(n.body, st, true);
  const single = n.body.items.length === 1 && n.body.items[0].t === 'c';
  const skew = single && n.body.items[0].it ? 0.07 * s : 0;
  const bh = Math.max(body.h, single ? 0.46 * s : 0.5 * s);
  const b = mkBox(body.w, body.h, body.d);
  put(b, body, 0, 0);
  const cx = body.w / 2 + skew;
  const aw = single ? Math.max(body.w * 0.95, 0.42 * s) : Math.max(body.w, 0.42 * s);
  const x0 = cx - aw / 2;
  let top = bh;
  switch (n.a) {
    case 'bar': {
      const y = bh + 0.1 * s;
      b.p.push({ k:'r', x: x0, y, w: aw, h: RULE * s });
      top = y + RULE * s;
      break;
    }
    case 'vec': {
      const y = bh + 0.15 * s, x1 = x0 + Math.max(aw, 0.5 * s);
      b.p.push({ k:'p', sw: t, cap:'butt', d: [['M', x0, y], ['L', x1 - 0.08 * s, y]] });
      b.p.push({ k:'p', fill: true, d: [['M', x1, y], ['L', x1 - 0.17 * s, y + 0.085 * s], ['L', x1 - 0.125 * s, y], ['L', x1 - 0.17 * s, y - 0.085 * s], ['Z']] });
      top = y + 0.09 * s;
      break;
    }
    case 'hat': {
      const hw = single ? 0.2 * s : Math.min(aw / 2, 0.7 * s), hh = 0.13 * s + (single ? 0 : 0.03 * hw);
      const y = bh + 0.09 * s;
      b.p.push({ k:'p', sw: t, join:'miter', d: [['M', cx - hw, y], ['L', cx, y + hh], ['L', cx + hw, y]] });
      top = y + hh + 0.03 * s;
      break;
    }
    case 'dot': case 'ddot': {
      const y = bh + 0.14 * s;
      const xsDots = n.a === 'dot' ? [cx] : [cx - 0.11 * s, cx + 0.11 * s];
      xsDots.forEach(xx => b.p.push({ k:'o', cx: xx, cy: y, r: 0.052 * s }));
      top = y + 0.06 * s;
      break;
    }
    case 'tilde': {
      const hw = single ? 0.22 * s : Math.min(aw / 2, 0.7 * s), y = bh + 0.13 * s;
      b.p.push({ k:'p', sw: t, cap:'round', d: [['M', cx - hw, y - 0.02 * s], ['C', cx - 0.4 * hw, y + 0.14 * s, cx + 0.4 * hw, y - 0.12 * s, cx + hw, y + 0.04 * s]] });
      top = y + 0.08 * s;
      break;
    }
  }
  b.h = Math.max(b.h, top);
  b.w = Math.max(b.w, x0 + aw + 0.02 * s);
  return b;
}

/* ---------- matrices and cases ---------- */
function layMat(n, st) {
  const s = st.s, a = AXIS * s;
  const cs = { s, disp: false, active: st.active };
  const R = n.cells.length, Cn = Math.max.apply(null, n.cells.map(r => r.length));
  const boxes = n.cells.map(rw => rw.map(c => layoutRow(c, cs, true)));
  const colW = [];
  for (let c = 0; c < Cn; c++) colW[c] = Math.max.apply(null, boxes.map(rw => rw[c] ? rw[c].w : 0));
  const rowH = boxes.map(rw => Math.max.apply(null, [0.72 * s].concat(rw.map(b => b.h))));
  const rowD = boxes.map(rw => Math.max.apply(null, [0.26 * s].concat(rw.map(b => b.d))));
  const rowGap = 0.2 * s, cases = n.env === 'cases', colGap = cases ? 1.0 * s : 0.8 * s;
  let Ht = rowGap * (R - 1);
  for (let r = 0; r < R; r++) Ht += rowH[r] + rowD[r];
  const W = colW.reduce((p, c) => p + c, 0) + colGap * (Cn - 1) + 0.16 * s;
  const inner = mkBox(W, a + Ht / 2, Ht / 2 - a);
  let y = a + Ht / 2;
  for (let r = 0; r < R; r++) {
    y -= rowH[r];
    let x = 0.08 * s;
    for (let c = 0; c < Cn; c++) {
      const bx = boxes[r][c];
      if (bx) put(inner, bx, cases ? x : x + (colW[c] - bx.w) / 2, y);
      x += colW[c] + colGap;
    }
    y -= rowD[r] + rowGap;
  }
  const dl = MATRIX_ENVS[n.env] || ['', ''];
  if (!dl[0] && !dl[1]) return inner;
  return wrapDelims(inner, dl[0], dl[1], s);
}

/* =========================================================================
 * Flatten + SVG output
 * ========================================================================= */
function flatten(b, ox, oy, P, R) {
  for (const p of b.p) P.push(shiftPrim(p, ox, oy));
  for (const r of b.r) R.push({ row: r.row, xs: r.xs.map(x => x + ox), y: r.y + oy, h: r.h, d: r.d });
  for (const k of b.kids) flatten(k.b, ox + k.dx, oy + k.dy, P, R);
}
function shiftPrim(p, ox, oy) {
  const o = Object.assign({}, p);
  if (p.d) o.d = p.d.map(seg => { const q = [seg[0]]; for (let i = 1; i < seg.length; i += 2) q.push(seg[i] + ox, seg[i + 1] + oy); return q; });
  if ('x' in p) o.x = p.x + ox;
  if ('y' in p) o.y = p.y + oy;
  if ('cx' in p) { o.cx = p.cx + ox; o.cy = p.cy + oy; }
  return o;
}
const n3 = v => Math.round(v * 1000) / 1000;
const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgString(box, prims, extra, vbOut) {
  const px = 0.06, ptop = 0.07, pbot = 0.07;
  const W = box.w + 2 * px, H = box.h + box.d + ptop + pbot;
  const X = x => n3(x + px), Y = y => n3(box.h + ptop - y);
  if (vbOut) { vbOut.W = W; vbOut.H = H; vbOut.px = px; vbOut.top = box.h + ptop; }
  let out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + n3(W) + 'em" height="' + n3(H) + 'em" viewBox="0 0 ' + n3(W) + ' ' + n3(H) + '" style="vertical-align:' + n3(-(box.d + pbot)) + 'em" focusable="false" aria-hidden="true">';
  const pathD = d => d.map(seg => seg[0] + (seg.length > 1 ? seg.slice(1).map((v, i) => i % 2 === 0 ? X(v) : Y(v)).join(' ') : '')).join('');
  (extra || []).forEach(e => {
    if (e.k === 'sel') out += '<rect class="sel" x="' + X(e.x) + '" y="' + Y(e.y + e.h) + '" width="' + n3(Math.max(e.w, 0.02)) + '" height="' + n3(e.h) + '"/>';
  });
  for (const p of prims) {
    switch (p.k) {
      case 't': out += '<text x="' + X(p.x) + '" y="' + Y(p.y) + '" font-size="' + n3(p.s) + '" class="' + (p.f === 't' ? 'tt' : 'tm') + '">' + escXml(p.str) + '</text>'; break;
      case 'r': out += '<rect x="' + X(p.x) + '" y="' + Y(p.y + p.h) + '" width="' + n3(p.w) + '" height="' + n3(p.h) + '"/>'; break;
      case 'ph': out += '<rect class="ph" x="' + X(p.x) + '" y="' + Y(p.y + p.h) + '" width="' + n3(p.w) + '" height="' + n3(p.h) + '" rx="0.04"/>'; break;
      case 'o': out += '<circle cx="' + X(p.cx) + '" cy="' + Y(p.cy) + '" r="' + n3(p.r) + '"/>'; break;
      case 'p':
        if (p.fill) out += '<path d="' + pathD(p.d) + '"/>';
        else out += '<path d="' + pathD(p.d) + '" fill="none" stroke="currentColor" stroke-width="' + n3(p.sw) + '" stroke-linecap="' + (p.cap || 'butt') + '" stroke-linejoin="' + (p.join || 'round') + '" stroke-miterlimit="10"/>';
        break;
    }
  }
  (extra || []).forEach(e => {
    if (e.k === 'caret') out += '<rect class="caret" x="' + X(e.x - 0.018) + '" y="' + Y(e.y + e.h) + '" width="0.036" height="' + n3(e.h) + '"/>';
  });
  return out + '</svg>';
}

function renderStatic(latex, display) {
  const root = parseLatex(latex);
  const box = layoutRow(root, { s: 1, disp: !!display, active: new Set() }, false);
  const P = [], R = [];
  flatten(box, 0, 0, P, R);
  return svgString(box, P, null, null);
}

/* =========================================================================
 * Popup used for autocomplete and "\" commands
 * ========================================================================= */
let pop = null, popOwner = null;
function getPop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'mf-pop';
  pop.addEventListener('mousedown', e => {
    e.preventDefault();
    const it = e.target.closest('.it');
    if (it && popOwner) popOwner._popPick(+it.getAttribute('data-i'));
  });
  document.body.appendChild(pop);
  return pop;
}
function hidePop() { if (pop) pop.classList.remove('show'); popOwner = null; }

/* =========================================================================
 * The editor component
 * ========================================================================= */
const LIVE = new Set();

function MathField(opts) {
  opts = opts || {};
  this.o = opts;
  this.display = !!opts.display;
  this.el = document.createElement('span');
  this.el.className = 'mf' + (this.display ? ' mf-display' : '');
  this.host = document.createElement('span');
  this.host.className = 'mf-host';
  this.input = document.createElement('textarea');
  this.input.className = 'mf-input';
  this.input.setAttribute('autocomplete', 'off');
  this.input.setAttribute('autocorrect', 'off');
  this.input.setAttribute('autocapitalize', 'off');
  this.input.setAttribute('aria-label', 'Equation editor');
  this.input.spellcheck = false;
  this.input.rows = 1;
  this.el.appendChild(this.host);
  this.el.appendChild(this.input);
  this.root = parseLatex(opts.latex || '');
  this.caret = { row: this.root, i: this.root.items.length };
  this.anchor = null;
  this.editing = false;
  this.hist = []; this.fut = [];
  this.lastEdit = 0; this.lastKind = null;
  this.conv = null;      // last automatic conversion (Backspace undoes it)
  this.cmd = null;       // text typed after "\"
  this.sugg = null;      // autocomplete suggestions
  this.vb = {};
  this.rows = [];
  this._bind();
  LIVE.add(this);
  this.render();
}

MathField.prototype = {
  /* ---------- public API ---------- */
  getLatex() { return texRow(this.root); },
  setLatex(l) { this.root = parseLatex(l); this.caret = { row: this.root, i: this.root.items.length }; this.anchor = null; this.render(); },
  isEmpty() { return !this.root.items.length; },
  focus(where) {
    this.caret = { row: this.root, i: where === 'start' ? 0 : this.root.items.length };
    this.anchor = null;
    this.editing = true;
    this.input.focus({ preventScroll: true });
    this.render();
  },
  blur() { this.input.blur(); },
  insertLatex(tex) {
    this.edit(() => {
      const nodes = parseLatex(tex).items;
      this.deleteSel();
      this.insertNodes(nodes);
      const f = firstEmptySlot(nodes);
      if (f) this.caret = { row: f, i: 0 };
    }, 'struct');
  },

  /* ---------- events ---------- */
  _bind() {
    const inp = this.input;
    inp.addEventListener('focus', () => {
      if (!this.editing) { this.editing = true; this.render(); }
      if (this.o.onFocus) this.o.onFocus();
    });
    inp.addEventListener('blur', () => {
      this.editing = false;
      this.anchor = null;
      this.cmd = null; this.sugg = null;
      if (popOwner === this) hidePop();
      this.normalize();
      this.render();
      if (this.o.onBlur) this.o.onBlur();
    });
    inp.addEventListener('keydown', e => this._key(e));
    inp.addEventListener('input', e => {
      if (e.isComposing) return;
      const v = inp.value; inp.value = '';
      if (v) this.typeText(v);
    });
    inp.addEventListener('compositionend', () => { const v = inp.value; inp.value = ''; if (v) this.typeText(v); });
    inp.addEventListener('copy', e => { const t = this.selLatex(); if (t) { e.clipboardData.setData('text/plain', t); e.preventDefault(); } });
    inp.addEventListener('cut', e => {
      const t = this.selLatex();
      if (t) { e.clipboardData.setData('text/plain', t); e.preventDefault(); this.edit(() => this.deleteSel(), 'del'); }
    });
    inp.addEventListener('paste', e => {
      e.preventDefault();
      const t = (e.clipboardData.getData('text/plain') || '').trim().replace(/^\${1,2}|\${1,2}$/g, '');
      if (t) this.insertLatex(t);
    });
    this.host.addEventListener('mousedown', e => this._mouse(e));
    this.host.addEventListener('dblclick', e => {
      e.preventDefault();
      const r = this.caret.row;
      this.anchor = { row: r, i: 0 };
      this.caret = { row: r, i: r.items.length };
      this.render();
    });
  },
  _mouse(e) {
    if (e.button !== 0) return;
    this.lastKind = null;   // moving the caret starts a new undo step
    e.preventDefault(); e.stopPropagation();
    const pos = this.hit(e.clientX, e.clientY);
    if (pos) this.caret = pos;
    this.anchor = null;
    this.sugg = null; this.cmd = null; hidePop();
    if (!this.editing) { this.editing = true; this.input.focus({ preventScroll: true }); }
    this.render();
    const start = { row: this.caret.row, i: this.caret.i };
    const mv = ev => {
      const p = this.hit(ev.clientX, ev.clientY);
      if (p) { this.anchor = start; this.caret = p; this.render(); }
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      if (this.anchor && !this.sel()) this.anchor = null;
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
  },
  hit(cx, cy) {
    const svg = this.host.firstElementChild;
    if (!svg || !this.rows.length) return null;
    const rc = svg.getBoundingClientRect();
    if (!rc.width) return null;
    const vb = this.vb;
    const x = (cx - rc.left) / rc.width * vb.W - vb.px;
    const y = vb.top - (cy - rc.top) / rc.height * vb.H;
    let best = null, bestScore = Infinity;
    for (const r of this.rows) {
      const x0 = r.xs[0] - 0.06, x1 = r.xs[r.xs.length - 1] + 0.06, y0 = r.y - r.d, y1 = r.y + r.h;
      const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
      const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
      const score = (dx || dy) ? 1000 + dx + dy * 1.5 : (x1 - x0) * (y1 - y0);
      if (score < bestScore) { bestScore = score; best = r; }
    }
    if (!best) return null;
    return { row: best.row, i: this.nearest(best, x) };
  },
  nearest(rr, x) {
    let bi = 0, bd = Infinity;
    rr.xs.forEach((xx, i) => { const d = Math.abs(xx - x); if (d < bd) { bd = d; bi = i; } });
    return Math.min(bi, rr.row.items.length);
  },
  _key(e) {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (this.cmd !== null && this._cmdKey(e)) return;
    if (this.sugg && popOwner === this) {
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); this.sugg.sel = (this.sugg.sel + (k === 'ArrowDown' ? 1 : -1) + this.sugg.list.length) % this.sugg.list.length; this.showPop(); return; }
      if (k === 'Tab' || k === 'Enter') { e.preventDefault(); this._popPick(this.sugg.sel); return; }
      if (k === 'Escape') { e.preventDefault(); this.sugg = null; hidePop(); return; }
    }
    if (mod) {
      const kk = k.toLowerCase();
      if (kk === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
      if (kk === 'y' || (kk === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); return; }
      if (kk === 'a') { e.preventDefault(); this.anchor = { row: this.root, i: 0 }; this.caret = { row: this.root, i: this.root.items.length }; this.render(); return; }
      return;
    }
    switch (k) {
      case 'ArrowLeft': e.preventDefault(); this.move(-1, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); this.move(1, e.shiftKey); return;
      case 'ArrowUp': e.preventDefault(); this.vert(-1); return;
      case 'ArrowDown': e.preventDefault(); this.vert(1); return;
      case 'Home': case 'End': e.preventDefault(); this.homeEnd(k === 'End', e.shiftKey); return;
      case 'Backspace': e.preventDefault(); this.backspace(); return;
      case 'Delete': e.preventDefault(); this.del(); return;
      case 'Tab': e.preventDefault(); this.tab(e.shiftKey ? -1 : 1); return;
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey && this.matrixPos()) this.edit(() => this.matAddRow(), 'struct');
        else this.exit('forward');
        return;
      case 'Escape': e.preventDefault(); this.exit('forward'); return;
      case ' ':
        if (e.shiftKey && !this.inText()) { e.preventDefault(); this.edit(() => this.insertNodes([{ t:'sp', w:0.278 }]), 'type'); }
        return;
    }
  },

  /* ---------- typing ---------- */
  typeText(v) { Array.from(v).forEach(ch => this.typeChar(ch)); },
  typeChar(ch) {
    if (ch === '\n' || ch === '\r') return;
    if (this.cmd !== null) {
      if (/[A-Za-z0-9]/.test(ch)) { this.cmd += ch; this.showCmd(); return; }
      this.acceptCmd(-1);
      if (ch === ' ') return;
    }
    if (this.inText()) {
      if (ch === '"') { this.edit(() => this.leaveNode(1), 'nav'); return; }
      this.edit(() => this.insertNodes([{ t:'c', ch, cls:'txt', it:false }]), 'type');
      return;
    }
    switch (ch) {
      case ' ': return;
      case '^': this.edit(() => this.script('sup'), 'struct'); return;
      case '_': this.edit(() => this.script('sub'), 'struct'); return;
      case '/': this.edit(() => this.fraction(), 'struct'); return;
      case '(': case '[': case '{': this.edit(() => this.fence(ch), 'struct'); return;
      case ')': case ']': case '}': this.edit(() => this.closeFence(ch), 'struct'); return;
      case '|': this.edit(() => this.bar(), 'struct'); return;
      case '"': this.edit(() => { const n = { t:'txt', body: row([]) }; this.insertNodes([n]); this.caret = { row: n.body, i: 0 }; }, 'struct'); return;
      case '\\': this.cmd = ''; this.sugg = null; this.showCmd(); return;
      case '$': this.exit('forward'); return;
      case '&': if (this.matrixPos()) { this.edit(() => this.matAddCol(), 'struct'); return; } break;
    }
    let atom;
    if (ch === '-') atom = C('−', '-');
    else if (ch === '*') atom = C('·', '*');
    else if (ch === "'") atom = C('′', "'");
    else atom = C(ch, ch);
    this.edit(() => { this.insertNodes([atom]); this.shortcuts(); }, 'type');
    this.updateSugg();
  },
  inText() { const p = this.caret.row.parent; return !!(p && p.t === 'txt'); },
  insertNodes(nodes) {
    this.deleteSel();
    const r = this.caret.row;
    r.items.splice(this.caret.i, 0, ...nodes);
    nodes.forEach(n => { n.parent = r; setNodeParents(n); });
    this.caret.i += nodes.length;
  },
  replaceRun(start, count, word) {
    const r = this.caret.row;
    const removed = r.items.splice(start, count);
    this.caret.i = start;
    const nodes = parseLatex(SHORTCUTS[word] !== undefined ? SHORTCUTS[word] : COMMANDS[word]).items;
    if (nodes.length === 1) nodes[0].src = word;
    this.insertNodes(nodes);
    this.conv = { row: r, at: start, n: nodes.length, nodes, removed };
    const big = nodes.length === 1 && nodes[0].t === 'big' && AUTO_LIMITS[nodes[0].op];
    const f = firstEmptySlot(nodes);
    if (big) this.caret = { row: nodes[0].sub, i: 0 };
    else if (f) this.caret = { row: f, i: 0 };
  },
  shortcuts() {
    const r = this.caret.row, i = this.caret.i;
    const srcs = [];
    let len = 0;
    for (let j = i - 1; j >= 0; j--) {
      const a = r.items[j];
      if (a.src === undefined) break;
      srcs.unshift(a.src); len += a.src.length;
      if (len > 14) break;
    }
    for (let k = 0; k < srcs.length - 1; k++) {
      const str = srcs.slice(k).join('');
      if (SHORTCUTS[str] === undefined) continue;
      this.replaceRun(i - (srcs.length - k), srcs.length - k, str);
      return true;
    }
    return false;
  },
  script(which) {
    const s = this.sel();
    if (s) { this.caret = { row: s.row, i: s.hi }; this.anchor = null; }
    const r = this.caret.row, i = this.caret.i;
    // already inside the scripts/limits of something: ^ and _ hop between upper and lower
    const host = r.parent;
    if (host && (host.t === 'sc' || host.t === 'big') && (r === host.sub || r === host.sup) && (i === r.items.length || !r.items.length)) {
      if (r === host[which] && !r.items.length) return;
      if (r !== host[which]) {
        if (!host[which]) { host[which] = row([]); host[which].parent = host; }
        this.caret = { row: host[which], i: host[which].items.length };
        return;
      }
    }
    const prev = r.items[i - 1], next = r.items[i];
    if (prev && prev.t === 'big') { this.caret = { row: prev[which], i: prev[which].items.length }; return; }
    const enter = n => {
      if (!n[which]) { n[which] = row([]); n[which].parent = n; }
      return n[which];
    };
    if (prev && prev.t === 'sc') { const sl = enter(prev); this.caret = { row: sl, i: sl.items.length }; return; }
    if (next && next.t === 'sc') { const sl = enter(next); this.caret = { row: sl, i: 0 }; return; }
    const sc = { t:'sc', sub: null, sup: null };
    sc[which] = row([]);
    this.insertNodes([sc]);
    this.caret = { row: sc[which], i: 0 };
  },
  fraction() {
    let atoms = this.deleteSel();
    if (!atoms.length) {
      const r = this.caret.row;
      let j = this.caret.i;
      const operand = a => a.t === 'sc' || a.t === 'dl' || a.t === 'sqrt' || a.t === 'acc' || a.t === 'txt' || a.t === 'mat' || a.t === 'frac' || (a.t === 'c' && a.cls === 'ord');
      while (j > 0 && operand(r.items[j - 1])) j--;
      atoms = r.items.splice(j, this.caret.i - j);
      this.caret.i = j;
    }
    const f = { t:'frac', num: row(atoms), den: row([]), bar: true };
    this.insertNodes([f]);
    this.caret = atoms.length ? { row: f.den, i: 0 } : { row: f.num, i: 0 };
  },
  fence(open) {
    const close = { '(':')', '[':']', '{':'}', '|':'|' }[open];
    const atoms = this.deleteSel();
    const d = { t:'dl', l: open, r: close, body: row(atoms) };
    this.insertNodes([d]);
    this.caret = { row: d.body, i: atoms.length };
  },
  closeFence(ch) {
    let r = this.caret.row, i = this.caret.i;
    // find the enclosing bracket that this closes
    while (r.parent) {
      const p = r.parent;
      if (p.t === 'dl' && p.r === ch) {
        const after = r.items.splice(i);
        const pr = p.parent, idx = pr.items.indexOf(p);
        pr.items.splice(idx + 1, 0, ...after);
        after.forEach(a => { a.parent = pr; });
        this.caret = { row: pr, i: idx + 1 };
        return;
      }
      if (r.items.length !== i) break;   // only jump out of structures we're at the end of
      const pr = p.parent;
      i = pr.items.indexOf(p) + 1;
      r = pr;
    }
    this.insertNodes([C(ch, ch)]);
  },
  bar() {
    const p = this.caret.row.parent;
    if (p && p.t === 'dl' && p.r === '|') return this.closeFence('|');
    if (p && p.t === 'dl' && p.l === '{') { this.insertNodes([{ t:'c', ch:'∣', cls:'rel', it:false }]); return; }
    this.fence('|');
  },
  leaveNode(dir) {
    const n = this.caret.row.parent;
    if (!n) return;
    const pr = n.parent, idx = pr.items.indexOf(n);
    this.caret = { row: pr, i: dir > 0 ? idx + 1 : idx };
  },

  /* ---------- matrices ---------- */
  matrixPos() {
    let r = this.caret.row;
    while (r.parent) {
      const n = r.parent;
      if (n.t === 'mat') {
        for (let i = 0; i < n.cells.length; i++) { const c = n.cells[i].indexOf(r); if (c >= 0) return { m: n, r: i, c }; }
      }
      r = n.parent;
    }
    return null;
  },
  matAddRow() {
    const p = this.matrixPos(); if (!p) return;
    const cols = p.m.cells[0].length;
    const nr = [];
    for (let c = 0; c < cols; c++) { const x = row([]); x.parent = p.m; nr.push(x); }
    p.m.cells.splice(p.r + 1, 0, nr);
    this.caret = { row: nr[0], i: 0 };
  },
  matAddCol() {
    const p = this.matrixPos(); if (!p) return;
    p.m.cells.forEach(rw => { const x = row([]); x.parent = p.m; rw.splice(p.c + 1, 0, x); });
    this.caret = { row: p.m.cells[p.r][p.c + 1], i: 0 };
  },

  /* ---------- selection ---------- */
  sel() {
    if (!this.anchor) return null;
    const a = this.anchor, b = this.caret;
    const anc = new Set();
    for (let r = a.row; r; r = r.parent ? r.parent.parent : null) anc.add(r);
    let R = b.row;
    while (R && !anc.has(R)) R = R.parent ? R.parent.parent : null;
    if (!R) return null;
    const span = pos => {
      if (pos.row === R) return [pos.i, pos.i];
      let r = pos.row;
      while (r.parent && r.parent.parent !== R) r = r.parent.parent;
      const idx = R.items.indexOf(r.parent);
      return [idx, idx + 1];
    };
    const sa = span(a), sb = span(b);
    const lo = Math.min(sa[0], sb[0]), hi = Math.max(sa[1], sb[1]);
    return lo === hi ? null : { row: R, lo, hi };
  },
  deleteSel() {
    const s = this.sel();
    this.anchor = null;
    if (!s) return [];
    const out = s.row.items.splice(s.lo, s.hi - s.lo);
    this.caret = { row: s.row, i: s.lo };
    return out;
  },
  selLatex() {
    const s = this.sel();
    if (!s) return '';
    return cat(s.row.items.slice(s.lo, s.hi).map(texNode));
  },

  /* ---------- moving ---------- */
  move(dir, shift) {
    this.lastKind = null;   // moving the caret starts a new undo step
    this.sugg = null; hidePop();
    if (shift) {
      if (!this.anchor) this.anchor = { row: this.caret.row, i: this.caret.i };
      const r = this.caret.row, i = this.caret.i;
      if (dir > 0 && i < r.items.length) this.caret.i++;
      else if (dir < 0 && i > 0) this.caret.i--;
      else if (r.parent) { const n = r.parent, pr = n.parent, idx = pr.items.indexOf(n); this.caret = { row: pr, i: dir > 0 ? idx + 1 : idx }; }
      this.render();
      return;
    }
    const s = this.sel();
    if (s) { this.caret = { row: s.row, i: dir > 0 ? s.hi : s.lo }; this.anchor = null; this.render(); return; }
    this.anchor = null;
    const r = this.caret.row, i = this.caret.i;
    if (dir > 0) {
      if (i < r.items.length) {
        const sl = navSlots(r.items[i], false);
        if (sl.length) this.caret = { row: sl[0], i: 0 }; else this.caret.i++;
      } else if (!this.out(1)) return;
    } else {
      if (i > 0) {
        const sl = navSlots(r.items[i - 1], false);
        if (sl.length) { const l = sl[sl.length - 1]; this.caret = { row: l, i: l.items.length }; } else this.caret.i--;
      } else if (!this.out(-1)) return;
    }
    this.normalize();
    this.render();
  },
  out(dir) {
    const r = this.caret.row, n = r.parent;
    if (!n) { this.exit(dir > 0 ? 'forward' : 'backward'); return false; }
    const sl = navSlots(n, true), k = sl.indexOf(r);
    if (dir > 0 && k >= 0 && k < sl.length - 1) { this.caret = { row: sl[k + 1], i: 0 }; return true; }
    if (dir < 0 && k > 0) { const p = sl[k - 1]; this.caret = { row: p, i: p.items.length }; return true; }
    const pr = n.parent, idx = pr.items.indexOf(n);
    this.caret = { row: pr, i: dir > 0 ? idx + 1 : idx };
    return true;
  },
  vert(dir) {
    this.lastKind = null;   // moving the caret starts a new undo step
    this.sugg = null; hidePop();
    const cx = this.caretX || 0;
    let r = this.caret.row;
    while (r.parent) {
      const n = r.parent;
      let target = null;
      if (n.t === 'frac') { if (dir > 0 && r === n.num) target = n.den; if (dir < 0 && r === n.den) target = n.num; }
      else if (n.t === 'sc' || n.t === 'big') { if (dir > 0 && r === n.sup && n.sub) target = n.sub; if (dir < 0 && r === n.sub && n.sup) target = n.sup; }
      else if (n.t === 'sqrt') { if (dir > 0 && r === n.idx) target = n.body; if (dir < 0 && r === n.body && n.idx) target = n.idx; }
      else if (n.t === 'mat') {
        for (let i = 0; i < n.cells.length; i++) {
          const c = n.cells[i].indexOf(r);
          if (c >= 0) { const rr = n.cells[i + dir]; if (rr) target = rr[Math.min(c, rr.length - 1)]; break; }
        }
      }
      if (target) {
        this.anchor = null;
        const rec = this.rows.find(x => x.row === target);
        this.caret = { row: target, i: rec ? this.nearest(rec, cx) : target.items.length };
        this.render();
        return;
      }
      r = n.parent;
    }
    this.exit(dir > 0 ? 'downward' : 'upward');
  },
  homeEnd(end, shift) {
    this.lastKind = null;   // moving the caret starts a new undo step
    if (shift && !this.anchor) this.anchor = { row: this.caret.row, i: this.caret.i };
    if (!shift) this.anchor = null;
    const r = this.caret.row, at = end ? r.items.length : 0;
    if (this.caret.i === at && r !== this.root) this.caret = { row: this.root, i: end ? this.root.items.length : 0 };
    else this.caret = { row: r, i: at };
    this.render();
  },
  tab(dir) {
    this.lastKind = null;   // moving the caret starts a new undo step
    this.anchor = null;
    const r = this.caret.row, n = r.parent;
    if (n) {
      const sl = navSlots(n, true), k = sl.indexOf(r);
      if (dir > 0 && k < sl.length - 1) this.caret = { row: sl[k + 1], i: 0 };
      else if (dir < 0 && k > 0) { const p = sl[k - 1]; this.caret = { row: p, i: p.items.length }; }
      else this.leaveNode(dir);
      this.normalize(); this.render();
      return;
    }
    // at the top level: jump to the next empty box, otherwise leave the equation
    const empties = [];
    const walk = (rw, top) => rw.items.forEach((a, j) => {
      if (a.t === 'big' || a.t === 'sc') { slotsAll(a).forEach(s => walk(s, top === null ? j : top)); return; }
      slotsAll(a).forEach(s => { if (!s.items.length) empties.push({ row: s, top: top === null ? j : top }); else walk(s, top === null ? j : top); });
    });
    walk(this.root, null);
    const cand = dir > 0 ? empties.find(e => e.top >= this.caret.i) : empties.filter(e => e.top < this.caret.i).pop();
    if (cand) { this.caret = { row: cand.row, i: 0 }; this.render(); }
    else this.exit(dir > 0 ? 'forward' : 'backward');
  },

  /* ---------- deleting ---------- */
  backspace() {
    this.sugg = null; hidePop();
    if (this.sel()) { this.edit(() => this.deleteSel(), 'del'); return; }
    const c = this.conv;
    if (c && ((this.caret.row === c.row && this.caret.i === c.at + c.n) ||
              (c.n === 1 && this.caret.row.parent === c.nodes[0] && isEmptyStruct(c.nodes[0])))) {
      this.edit(() => {
        c.row.items.splice(c.at, c.n, ...c.removed);
        c.removed.forEach(a => { a.parent = c.row; delete a.src; });
        this.caret = { row: c.row, i: c.at + c.removed.length };
      }, 'del');
      return;
    }
    const r = this.caret.row, i = this.caret.i;
    if (i > 0) {
      const a = r.items[i - 1];
      const sl = navSlots(a, true);
      if (sl.length && !isEmptyStruct(a)) {
        const l = sl[sl.length - 1];
        this.caret = { row: l, i: l.items.length };
        this.render();
        return;
      }
      this.edit(() => { r.items.splice(i - 1, 1); this.caret.i--; }, 'del');
      return;
    }
    const n = r.parent;
    if (!n) { this.exit('backward'); return; }
    const sl = navSlots(n, true), k = sl.indexOf(r);
    if (k > 0 && n.t !== 'sc') { const p = sl[k - 1]; this.caret = { row: p, i: p.items.length }; this.render(); return; }
    const pr = n.parent, idx = pr.items.indexOf(n);
    if (n.t === 'big' || (n.t === 'mat' && !isEmptyStruct(n))) { this.caret = { row: pr, i: idx }; this.render(); return; }
    this.edit(() => {
      const out = [];
      let off = 0;
      slotsAll(n).forEach(s => { if (s === r) off = out.length; out.push(...s.items); });
      pr.items.splice(idx, 1, ...out);
      out.forEach(a => { a.parent = pr; });
      this.caret = { row: pr, i: idx + off };
    }, 'del');
  },
  del() {
    this.sugg = null; hidePop();
    if (this.sel()) { this.edit(() => this.deleteSel(), 'del'); return; }
    const r = this.caret.row, i = this.caret.i;
    if (i < r.items.length) {
      const a = r.items[i];
      const sl = navSlots(a, true);
      if (sl.length && !isEmptyStruct(a)) { this.caret = { row: sl[0], i: 0 }; this.render(); return; }
      this.edit(() => { r.items.splice(i, 1); }, 'del');
      return;
    }
    this.move(1, false);
  },

  /* ---------- \commands and autocomplete ---------- */
  showCmd() {
    const q = this.cmd;
    const names = Object.keys(COMMANDS).filter(n => n.indexOf(q) === 0).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 8);
    this.sugg = null;
    this.cmdList = { list: names, sel: 0 };
    this.showPop('\\' + q, names.map(n => ({ word: n, tex: COMMANDS[n] })), 0, 'Enter to insert · Esc to cancel');
  },
  _cmdKey(e) {
    const k = e.key;
    const L = this.cmdList || { list: [], sel: 0 };
    if (k === 'Escape') { e.preventDefault(); this.cmd = null; hidePop(); return true; }
    if (k === 'Backspace') {
      e.preventDefault();
      if (!this.cmd.length) { this.cmd = null; hidePop(); } else { this.cmd = this.cmd.slice(0, -1); this.showCmd(); }
      return true;
    }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      if (L.list.length) { L.sel = (L.sel + (k === 'ArrowDown' ? 1 : -1) + L.list.length) % L.list.length; this.showPop('\\' + this.cmd, L.list.map(n => ({ word: n, tex: COMMANDS[n] })), L.sel, 'Enter to insert · Esc to cancel'); }
      return true;
    }
    if (k === 'Enter' || k === 'Tab') { e.preventDefault(); this.acceptCmd(L.sel); return true; }
    return false;
  },
  acceptCmd(selIdx) {
    const L = this.cmdList || { list: [] };
    let name = this.cmd;
    if (!(name in COMMANDS) && L.list.length) name = L.list[Math.max(0, selIdx)];
    this.cmd = null; hidePop();
    if (!name) return;
    if (name === 'text') {
      this.edit(() => { const n = { t:'txt', body: row([]) }; this.insertNodes([n]); this.caret = { row: n.body, i: 0 }; }, 'struct');
      return;
    }
    const tex = COMMANDS[name] || ('\\' + name);
    this.edit(() => {
      const nodes = parseLatex(tex).items;
      this.insertNodes(nodes);
      const big = nodes.length === 1 && nodes[0].t === 'big' && AUTO_LIMITS[nodes[0].op];
      const f = firstEmptySlot(nodes);
      if (big) this.caret = { row: nodes[0].sub, i: 0 };
      else if (f) this.caret = { row: f, i: 0 };
    }, 'struct');
  },
  updateSugg() {
    if (this.cmd !== null) return;
    const r = this.caret.row, i = this.caret.i;
    const letters = [];
    for (let j = i - 1; j >= 0 && letters.length < 12; j--) {
      const a = r.items[j];
      if (a.t === 'c' && a.src && /^[A-Za-z]$/.test(a.src) && a.src === a.ch) letters.unshift(a.ch); else break;
    }
    for (let k = 0; k <= letters.length - 2; k++) {
      const pre = letters.slice(k).join('');
      const list = WORDS.filter(w => w.indexOf(pre) === 0 && w !== pre).sort((a, b) => a.length - b.length).slice(0, 6);
      if (list.length) {
        this.sugg = { list, sel: 0, count: letters.length - k };
        this.showPop(null, list.map(w => ({ word: w, tex: SHORTCUTS[w] })), 0, 'Tab to insert');
        return;
      }
    }
    this.sugg = null;
    if (popOwner === this) hidePop();
  },
  _popPick(i) {
    if (this.cmd !== null) { this.acceptCmd(i); return; }
    const sg = this.sugg;
    if (!sg) return;
    const word = sg.list[i];
    this.sugg = null; hidePop();
    this.edit(() => this.replaceRun(this.caret.i - sg.count, sg.count, word), 'struct');
  },
  showPop(head, items, sel, foot) {
    const p = getPop();
    popOwner = this;
    let h = '';
    if (head) h += '<div class="hd">' + escXml(head) + '</div>';
    if (!items.length) h += '<div class="none">No matches</div>';
    items.forEach((it, i) => {
      h += '<div class="it' + (i === sel ? ' sel' : '') + '" data-i="' + i + '"><span class="g">' + renderStatic(it.tex || '', false) + '</span><span class="w">' + escXml(it.word) + '</span></div>';
    });
    if (foot) h += '<div class="ft">' + escXml(foot) + '</div>';
    p.innerHTML = h;
    p.classList.add('show');
    // place under the caret
    const svg = this.host.firstElementChild;
    if (svg) {
      const rc = svg.getBoundingClientRect();
      const vb = this.vb;
      const cx = rc.left + ((this.caretX || 0) + vb.px) / vb.W * rc.width;
      const cy = rc.top + (vb.top - (this.caretBottom || 0)) / vb.H * rc.height + 6;
      const pw = p.offsetWidth, ph = p.offsetHeight;
      p.style.left = Math.max(4, Math.min(window.innerWidth - pw - 4, cx - 12)) + 'px';
      p.style.top = (cy + ph > window.innerHeight ? rc.top - ph - 6 : cy) + 'px';
    }
  },

  /* ---------- editing core ---------- */
  edit(fn, kind) {
    const now = Date.now();
    if (!(kind === 'type' && this.lastKind === 'type' && now - this.lastEdit < 1200)) {
      this.hist.push(this.snapshot());
      if (this.hist.length > 300) this.hist.shift();
    }
    this.fut = [];
    this.lastEdit = now; this.lastKind = kind;
    this.conv = null;
    fn();
    this.normalize();
    this.render();
    if (this.o.onChange) this.o.onChange();
  },
  snapshot() { return { tree: cloneRow(this.root), caret: pathOf(this.caret) }; },
  restore(sn) {
    this.root = sn.tree;
    setParents(this.root);
    this.caret = resolvePath(this.root, sn.caret);
    this.anchor = null;
  },
  undo() {
    if (!this.hist.length) return;
    this.fut.push(this.snapshot());
    this.restore(this.hist.pop());
    this.lastKind = null; this.conv = null;
    this.render();
    if (this.o.onChange) this.o.onChange();
  },
  redo() {
    if (!this.fut.length) return;
    this.hist.push(this.snapshot());
    this.restore(this.fut.pop());
    this.lastKind = null;
    this.render();
    if (this.o.onChange) this.o.onChange();
  },
  normalize() {
    const keep = new Set();
    if (this.editing) for (let r = this.caret.row; r; r = r.parent ? r.parent.parent : null) keep.add(r);
    const walk = rw => {
      for (let k = rw.items.length - 1; k >= 0; k--) {
        const a = rw.items[k];
        slotsAll(a).forEach(walk);
        if (a.t !== 'sc') continue;
        ['sub', 'sup'].forEach(w => { if (a[w] && !a[w].items.length && !keep.has(a[w])) a[w] = null; });
        if (!a.sub && !a.sup) {
          rw.items.splice(k, 1);
          if (this.caret.row === rw && this.caret.i > k) this.caret.i--;
          if (this.anchor && this.anchor.row === rw && this.anchor.i > k) this.anchor.i--;
        }
      }
    };
    walk(this.root);
  },
  exit(dir) {
    this.sugg = null; this.cmd = null;
    if (popOwner === this) hidePop();
    if (this.o.onExit) this.o.onExit(dir);
  },

  /* ---------- drawing ---------- */
  render() {
    const active = new Set();
    if (this.editing) for (let r = this.caret.row; r && r.parent; r = r.parent.parent) active.add(r.parent);
    const box = layoutRow(this.root, { s: 1, disp: this.display, active }, false);
    const P = [], R = [];
    flatten(box, 0, 0, P, R);
    this.rows = R;
    const extra = [];
    const s = this.editing ? this.sel() : null;
    if (s) {
      const rr = R.find(x => x.row === s.row);
      if (rr) extra.push({ k:'sel', x: rr.xs[s.lo], y: rr.y - rr.d, w: rr.xs[s.hi] - rr.xs[s.lo], h: rr.h + rr.d });
    }
    const rr = R.find(x => x.row === this.caret.row);
    if (rr) {
      const i = Math.min(this.caret.i, rr.xs.length - 1);
      this.caretX = rr.xs[i];
      this.caretBottom = rr.y - rr.d;
      if (this.editing && !s) extra.push({ k:'caret', x: rr.xs[i], y: rr.y - rr.d, h: rr.h + rr.d });
    }
    this.host.innerHTML = svgString(box, P, extra, this.vb);
    this.el.classList.toggle('mf-empty', this.isEmpty());
    this.el.classList.toggle('mf-editing', this.editing);
  }
};

function refreshAll() {
  LIVE.forEach(f => { if (!f.el.isConnected) { LIVE.delete(f); return; } f.render(); });
}
if (document.fonts && document.fonts.addEventListener) {
  document.fonts.addEventListener('loadingdone', () => { mcache.clear(); refreshAll(); });
}

/* =========================================================================
 * Styles the engine needs (injected once)
 * ========================================================================= */
(function injectCSS() {
  const css = `
.mf{position:relative;display:inline-block;cursor:text;line-height:0;white-space:nowrap}
.mf-display{display:block;text-align:center}
.mf-host{display:inline-block;line-height:0;border-radius:3px}
.mf-host svg{display:inline-block;overflow:visible;fill:currentColor}
.mf text{white-space:pre;font-kerning:normal}
.mf text.tm,.mf-pop text.tm,.mf-static text.tm{font-family:${FONT_MATH}}
.mf text.tt,.mf-pop text.tt,.mf-static text.tt{font-family:${FONT_TEXT}}
.mf-static svg{overflow:visible;fill:currentColor}
.mf .ph,.mf-pop .ph,.mf-static .ph{fill:rgba(43,87,154,.07);stroke:#8ea8d2;stroke-width:.028;stroke-dasharray:.07 .05}
.mf .sel{fill:#bcd3f7}
.mf .caret{fill:#1f4f9a;animation:mf-blink 1.06s steps(1) infinite}
@keyframes mf-blink{50%{opacity:0}}
.mf-input{position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;border:0;margin:0;resize:none;overflow:hidden;pointer-events:none;font-size:16px;white-space:pre}
.mf-pop{position:fixed;z-index:1000;background:#fff;border:1px solid #c8d0db;border-radius:7px;box-shadow:0 8px 24px rgba(20,30,50,.18);font:13px "Segoe UI",system-ui,sans-serif;color:#1f2328;min-width:190px;max-width:320px;padding:4px;display:none}
.mf-pop.show{display:block}
.mf-pop .hd{color:#2b579a;font:600 12px Consolas,monospace;padding:3px 8px 5px}
.mf-pop .it{display:flex;gap:12px;align-items:center;padding:4px 8px;border-radius:5px;cursor:pointer;min-height:30px}
.mf-pop .it.sel{background:#e3ecfa}
.mf-pop .g{min-width:34px;text-align:center;font-size:17px;line-height:0}
.mf-pop .g svg{overflow:visible;fill:currentColor}
.mf-pop .w{font-family:Consolas,monospace;font-size:12.5px;color:#3b4350}
.mf-pop .ft{color:#8a929c;font-size:11px;padding:4px 8px 2px;border-top:1px solid #eef0f3;margin-top:3px}
.mf-pop .none{color:#8a929c;padding:4px 8px}
@media print{.mf .ph,.mf .caret,.mf .sel{display:none}.mf-pop{display:none!important}}
`;
  const st = document.createElement('style');
  st.setAttribute('data-mathnotes-engine', '');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
})();

global.MathNotesMath = {
  MathField,
  parseLatex,
  toLatex: r => texRow(r),
  renderStatic,
  SHORTCUT_LIST,
  COMMANDS,
  FONT_MATH,
  FONT_TEXT
};
})(window);
