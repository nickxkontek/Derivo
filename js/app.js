/* Derivo — word processor UI. Uses js/math-engine.js for all equations. */
(function(){
'use strict';

/* =============================== constants =============================== */
const M = window.MathNotesMath;
const APP_VERSION = '1.0.0';
const ZW = '\u200B';
const ZW_RE = /\u200B/g;
const AUTOSAVE_KEY = 'mathnotes.autosave.v1';
const SETTINGS_KEY = 'mathnotes.settings.v1';
const DESK = window.mathNotesDesktop || null;   // present only in the Windows desktop app
let deskPath = null, deskName = null;            // the open file, in the desktop app
const SHORTCUT_LIST = M.SHORTCUT_LIST;
const SHORTCUT_OF = {};  // latex -> typed word, for palette tooltips
SHORTCUT_LIST.forEach(function(s){ if(!SHORTCUT_OF[s[1]]) SHORTCUT_OF[s[1]] = s[0]; });

/* Symbol palette: [label, latex] */
const PALETTE = [   // [what the button shows, what gets inserted]
  ['Calculus', 'wide', [
    ['\\sum_{i=1}^{n}','\\sum'],['\\prod_{i=1}^{n}','\\prod'],['\\int_{a}^{b}','\\int_{#?}^{#?}'],
    ['\\int','\\int'],['\\iint','\\iint'],['\\oint','\\oint'],
    ['\\lim_{x\\to a}','\\lim'],['\\frac{d}{dx}','\\frac{d}{dx}'],['\\frac{\\partial}{\\partial x}','\\frac{\\partial #?}{\\partial #?}'],
    ['\\frac{dy}{dx}','\\frac{dy}{dx}'],['dx','\\,dx'],["f'(x)","'"]
  ]],
  ['Structures', 'wide', [
    ['\\frac{a}{b}','\\frac{#?}{#?}'],['\\sqrt{x}','\\sqrt{#?}'],['\\sqrt[n]{x}','\\sqrt[#?]{#?}'],
    ['x^{n}','^{#?}'],['x_{n}','_{#?}'],['e^{x}','e^{#?}'],
    ['\\left|x\\right|','\\left|#?\\right|'],['\\left(x\\right)','\\left(#?\\right)'],['\\left[x\\right]','\\left[#?\\right]'],
    ['\\vec{v}','\\vec{#?}'],['\\hat{x}','\\hat{#?}'],['\\overline{x}','\\overline{#?}'],
    ['\\binom{n}{k}','\\binom{#?}{#?}'],['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}','\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}'],['\\begin{cases}a&x\\\\b&y\\end{cases}','\\begin{cases}#?&#?\\\\#?&#?\\end{cases}'],
    ['\\log_{b}','\\log_{#?}'],['\\sin','\\sin'],['\\ln','\\ln']
  ]],
  ['Greek', '', ['alpha','beta','gamma','delta','varepsilon','theta','lambda','mu','pi','rho','sigma','tau','varphi','omega','Gamma','Delta','Sigma','Omega'].map(function(n){ return ['\\'+n,'\\'+n]; })],
  ['Operators & relations', '', ['pm','times','cdot','div','infty','circ','ne','approx','equiv','le','ge','propto','partial','nabla','angle','perp','therefore','ldots'].map(function(n){ return n === 'circ' ? ['x^{\\circ}','^{\\circ}'] : ['\\'+n,'\\'+n]; })],
  ['Sets & logic', '', ['in','notin','subset','subseteq','cup','cap','emptyset','forall','exists','neg','land','lor'].map(function(n){ return ['\\'+n,'\\'+n]; }).concat(['R','N','Z','Q','C'].map(function(l){ return ['\\mathbb{'+l+'}','\\mathbb{'+l+'}']; })).concat([['\\hbar','\\hbar']])],
  ['Arrows', '', ['to','leftarrow','leftrightarrow','Rightarrow','Leftarrow','Leftrightarrow','mapsto','uparrow','downarrow'].map(function(n){ return ['\\'+n,'\\'+n]; })]
];

/* ================================ state ================================== */
const $ = function(id){ return document.getElementById(id); };
const editor = $('editor'), titleInput = $('docTitle');
let dirty = false;          // unsaved to a file
let autosavePending = false;
let fileHandle = null;
let savedRange = null;
let pendingFontPt = null;
let settings = { dollar: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch(e){}

/* ================================ helpers ================================ */
function toast(msg, ms){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(function(){ t.classList.remove('show'); }, ms || 2600);
}
function escapeHTML(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function isMathWrap(n){ return !!(n && n.nodeType === 1 && n.classList && (n.classList.contains('math-inline') || n.classList.contains('math-block'))); }
function isMf(el){ return !!(el && el.classList && el.classList.contains('mf-input')); }
function wrapOf(node){ return node && node.closest ? node.closest('.math-inline,.math-block') : null; }
function inMath(node){
  while(node && node !== editor){ if(isMathWrap(node) || isMf(node)) return true; node = node.parentNode; }
  return false;
}
function isContainer(n){ return n === editor || (n && n.nodeType === 1 && n.classList.contains('box')); }
function newPara(){ const p = document.createElement('p'); p.appendChild(document.createElement('br')); return p; }
function isTextBlock(el){
  return !!(el && el.nodeType === 1 && !isMathWrap(el) && !el.classList.contains('page-break') && el.tagName !== 'TABLE' && el.tagName !== 'HR' && !el.classList.contains('box'));
}
/* top-level block (child of the editor or of a box) that contains node */
function getBlockEl(node){
  if(!node || node === editor || !editor.contains(node)) return null;
  while(node.parentNode && !isContainer(node.parentNode)) node = node.parentNode;
  if(node.nodeType !== 1) return null;
  return node;
}
function rangeIsEmpty(r){
  const frag = r.cloneContents();
  if(frag.querySelector && frag.querySelector('.math-inline,.math-block,img,table,hr')) return false;
  return r.toString().replace(ZW_RE,'').trim() === '';
}
function getLatex(w){
  if(w.__field) return w.__field.getLatex();
  return w.hasAttribute('data-latex') ? w.getAttribute('data-latex') : w.textContent;
}
function focusEditorAt(r){
  editor.focus({ preventScroll: true });
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  savedRange = r.cloneRange();
}
function placeCaretIn(el, where){
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(where !== 'end');
  focusEditorAt(r);
}
function ensureContent(){
  if(!editor.firstChild || (editor.childNodes.length === 1 && editor.firstChild.nodeName === 'BR')){
    editor.innerHTML = ''; editor.appendChild(newPara());
  }
}
function updateEmptyState(){
  const empty = editor.textContent.replace(ZW_RE,'').trim() === '' &&
    !editor.querySelector('.math-inline,.math-block,table,hr,.page-break,img,li,.box') && editor.children.length <= 1;
  editor.classList.toggle('is-empty', empty);
}

/* ============================ selection memory =========================== */
document.addEventListener('selectionchange', function(){
  const s = getSelection();
  if(!s.rangeCount) return;
  const n = s.anchorNode;
  if(n && editor.contains(n) && !inMath(n)) savedRange = s.getRangeAt(0).cloneRange();
  scheduleToolbarUpdate();
});
function getEditorRange(){
  let r = null;
  const live = getSelection();
  if(live.rangeCount && editor.contains(live.anchorNode) && !inMath(live.anchorNode)) r = live.getRangeAt(0).cloneRange();
  if(!r && savedRange && editor.contains(savedRange.startContainer) && !inMath(savedRange.startContainer)) r = savedRange.cloneRange();
  if(!r){
    ensureContent();
    const last = editor.lastElementChild;
    r = document.createRange();
    if(last && isTextBlock(last)){ r.selectNodeContents(last); r.collapse(false); }
    else { const p = newPara(); editor.appendChild(p); r.setStart(p, 0); r.collapse(true); }
  }
  if(r.startContainer === editor){
    const p = newPara();
    r.insertNode(p); r.setStart(p, 0); r.collapse(true);
  }
  return r;
}
function restoreSelection(){
  if(document.activeElement !== editor || !getSelection().rangeCount || !editor.contains(getSelection().anchorNode)){
    const r = getEditorRange(); focusEditorAt(r);
  }
}

/* =========================== math field wiring =========================== */
function createField(w, latex){
  const f = new M.MathField({
    latex: latex || '',
    display: w.classList.contains('math-block'),
    onExit: function(dir){ exitMath(w, dir); },
    onChange: function(){
      w.setAttribute('data-latex', f.getLatex());
      w.classList.toggle('empty', f.isEmpty());
      markDirty();
    },
    onFocus: function(){ w.classList.add('editing'); setHint(true); },
    onBlur: function(){
      w.classList.remove('editing'); setHint(false);
      setTimeout(function(){ if(w.isConnected && !f.editing && f.isEmpty()) removeMath(w); }, 150);
    }
  });
  w.__field = f;
  w.textContent = '';
  w.appendChild(f.el);
  w.setAttribute('data-latex', f.getLatex());
  w.classList.toggle('empty', f.isEmpty());
  return f;
}
/* Turn saved/pasted math placeholders into live equation fields */
function hydrate(root){
  root.querySelectorAll('.math-inline,.math-block').forEach(function(w){
    w.contentEditable = 'false';
    if(w.classList.contains('math-inline')){
      const n = w.nextSibling;
      if(!(n && n.nodeType === 3)) w.after(document.createTextNode(ZW));
    }
    if(w.__field && w.contains(w.__field.el)) return;
    const latex = w.hasAttribute('data-latex') ? w.getAttribute('data-latex') : w.textContent;
    createField(w, latex);
  });
}
function focusMath(wrap, where){
  if(wrap.__field) wrap.__field.focus(where);
}
function removeMath(wrap){
  if(!wrap.isConnected) return;
  if(wrap.classList.contains('math-inline')){
    const n = wrap.nextSibling;
    if(n && n.nodeType === 3 && n.data === ZW) n.remove();
  }
  wrap.remove();
  ensureContent(); updateEmptyState(); markDirty();
}
function exitMath(wrap, dir){
  if(!wrap || !wrap.isConnected) return;
  const empty = !!(wrap.__field && wrap.__field.isEmpty());
  const back = (dir === 'backward' || dir === 'upward');
  if(wrap.classList.contains('math-block')){
    let target = back ? wrap.previousElementSibling : wrap.nextElementSibling;
    if(!isTextBlock(target)){
      target = newPara();
      if(back) wrap.before(target); else wrap.after(target);
    }
    if(empty){ wrap.remove(); markDirty(); }
    placeCaretIn(target, back ? 'end' : 'start');
    return;
  }
  const r = document.createRange();
  if(back){
    const p = wrap.previousSibling;
    if(p && p.nodeType === 3) r.setStart(p, p.length); else r.setStartBefore(wrap);
  } else {
    let n = wrap.nextSibling;
    if(!(n && n.nodeType === 3)){ n = document.createTextNode(ZW); wrap.after(n); }
    r.setStart(n, n.data.charAt(0) === ZW ? 1 : 0);
  }
  r.collapse(true);
  if(empty){
    if(!back){ r.setStartBefore(wrap); r.collapse(true); }
    removeMath(wrap);
  }
  focusEditorAt(r);
}

/* ============================ inserting things =========================== */
function insertInlineMath(latexToInsert){
  const r = getEditorRange();
  let initial = '';
  if(!r.collapsed){ initial = r.toString().replace(ZW_RE,''); r.deleteContents(); }
  const w = document.createElement('span');
  w.className = 'math-inline'; w.contentEditable = 'false';
  r.insertNode(w);
  w.after(document.createTextNode(ZW));
  const f = createField(w, initial);
  afterInsert(w, f, latexToInsert);
}
function insertDisplayMath(latexToInsert){
  const w = document.createElement('div');
  w.className = 'math-block'; w.contentEditable = 'false';
  insertBlock(w);
  const f = createField(w, '');
  afterInsert(w, f, latexToInsert);
}
function afterInsert(w, f, latexToInsert){
  markDirty(); updateEmptyState();
  f.focus('end');
  if(latexToInsert) f.insertLatex(latexToInsert);
}
/* Insert a block element at the caret, splitting the current paragraph if needed */
function insertBlock(el){
  const r = getEditorRange();
  const b = getBlockEl(r.startContainer);
  if(!b){
    const container = isContainer(r.startContainer) ? r.startContainer : editor;
    container.appendChild(el);
  } else if(b.tagName === 'TABLE' || b.tagName === 'HR' || isMathWrap(b) || b.classList.contains('page-break')){
    b.after(el);
  } else {
    const head = document.createRange(); head.setStart(b, 0); head.setEnd(r.startContainer, r.startOffset);
    const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(b, b.childNodes.length);
    const headEmpty = rangeIsEmpty(head), tailEmpty = rangeIsEmpty(tail);
    if(headEmpty && tailEmpty && b.tagName === 'P'){ b.replaceWith(el); }
    else if(headEmpty && !tailEmpty){ b.before(el); }
    else if(tailEmpty){ b.after(el); }
    else {
      const frag = tail.extractContents();
      const nb = b.cloneNode(false); nb.appendChild(frag);
      b.after(el); el.after(nb);
    }
  }
  if(!isTextBlock(el.nextElementSibling)) el.after(newPara());
  markDirty(); updateEmptyState();
}
function insertBox(kind){
  const labels = { definition:'Definition.', theorem:'Theorem.', example:'Example.', note:'Note.' };
  const box = document.createElement('div');
  box.className = 'box box-' + kind;
  const p = document.createElement('p');
  const b = document.createElement('b'); b.textContent = labels[kind];
  p.appendChild(b); p.appendChild(document.createTextNode('\u00A0'));
  box.appendChild(p);
  insertBlock(box);
  placeCaretIn(p, 'end');
}
function insertTable(){
  const ans = prompt('Table size (rows × columns), e.g. 3x4', '3x3');
  if(!ans) return;
  const m = ans.match(/(\d+)\s*[x×*, ]\s*(\d+)/i);
  if(!m){ toast('Type the size like 3x4'); return; }
  const rows = Math.min(+m[1], 60), cols = Math.min(+m[2], 12);
  const t = document.createElement('table');
  for(let i = 0; i < rows; i++){
    const tr = t.insertRow();
    for(let j = 0; j < cols; j++){ const td = tr.insertCell(); td.appendChild(document.createElement('br')); }
  }
  insertBlock(t);
  placeCaretIn(t.rows[0].cells[0], 'start');
}
function insertPageBreak(){
  const d = document.createElement('div');
  d.className = 'page-break'; d.contentEditable = 'false';
  insertBlock(d);
  placeCaretIn(d.nextElementSibling, 'start');
}
function paletteInsert(latex){
  const a = document.activeElement;
  if(isMf(a)){ const w = wrapOf(a); if(w && w.__field){ w.__field.insertLatex(latex); return; } }
  insertInlineMath(latex);
}

/* ======================= keyboard: moving into math ====================== */
function caretOnEdgeLine(block, dir){
  const s = getSelection(); if(!s.rangeCount) return true;
  const rects = s.getRangeAt(0).getClientRects();
  if(!rects.length) return true;
  const c = rects[0], b = block.getBoundingClientRect();
  const lh = c.height || 18;
  return dir === 'down' ? (b.bottom - c.bottom) < lh * 0.8 : (c.top - b.top) < lh * 0.8;
}
function mathNeighbor(dir){
  const s = getSelection();
  if(!s.rangeCount || !s.isCollapsed) return null;
  const node = s.anchorNode, off = s.anchorOffset;
  if(!node || !editor.contains(node)) return null;
  let cand = null;
  if(node.nodeType === 3){
    const txt = dir === 'right' ? node.data.slice(off) : node.data.slice(0, off);
    if(txt.replace(ZW_RE,'') === '') cand = dir === 'right' ? node.nextSibling : node.previousSibling;
    else return null;
  } else {
    cand = dir === 'right' ? node.childNodes[off] : node.childNodes[off - 1];
  }
  while(cand && cand.nodeType === 3 && cand.data.replace(ZW_RE,'') === '') cand = dir === 'right' ? cand.nextSibling : cand.previousSibling;
  if(isMathWrap(cand)) return cand;
  // math block right after / before this paragraph
  const block = getBlockEl(node);
  if(block && isTextBlock(block)){
    const r = document.createRange(), cur = s.getRangeAt(0);
    if(dir === 'right'){ r.setStart(cur.endContainer, cur.endOffset); r.setEnd(block, block.childNodes.length); }
    else { r.setStart(block, 0); r.setEnd(cur.startContainer, cur.startOffset); }
    if(rangeIsEmpty(r)){
      const sib = dir === 'right' ? block.nextElementSibling : block.previousElementSibling;
      if(sib && sib.classList.contains('math-block')) return sib;
    }
  }
  return null;
}

editor.addEventListener('keydown', function(ev){
  if(inMath(ev.target) || ev.target !== editor) return;
  if(ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const k = ev.key;
  if(k === '$' && settings.dollar){ ev.preventDefault(); insertInlineMath(); return; }
  if((k === 'ArrowRight' && !ev.shiftKey) || k === 'Delete'){
    const m = mathNeighbor('right'); if(m && m.__field){ ev.preventDefault(); focusMath(m, 'start'); return; }
  }
  if((k === 'ArrowLeft' && !ev.shiftKey) || k === 'Backspace'){
    const m = mathNeighbor('left'); if(m && m.__field){ ev.preventDefault(); focusMath(m, 'end'); return; }
  }
  if((k === 'ArrowDown' || k === 'ArrowUp') && !ev.shiftKey){
    const s = getSelection(); if(!s.rangeCount) return;
    const block = getBlockEl(s.anchorNode);
    if(block){
      const sib = k === 'ArrowDown' ? block.nextElementSibling : block.previousElementSibling;
      if(sib && sib.classList.contains('math-block') && sib.__field && caretOnEdgeLine(block, k === 'ArrowDown' ? 'down' : 'up')){
        ev.preventDefault(); focusMath(sib, k === 'ArrowDown' ? 'start' : 'end'); return;
      }
    }
  }
  if(k === 'Tab'){
    ev.preventDefault();
    const s = getSelection();
    const el0 = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    const li = el0 && el0.closest('li');
    const cell = el0 && el0.closest('td,th');
    if(cell && editor.contains(cell)){
      const cells = [].slice.call(cell.closest('table').querySelectorAll('td,th'));
      let i = cells.indexOf(cell) + (ev.shiftKey ? -1 : 1);
      if(i >= cells.length && !ev.shiftKey){
        const tr = cell.closest('table').insertRow();
        for(let j = 0; j < cell.parentNode.cells.length; j++){ tr.insertCell().appendChild(document.createElement('br')); }
        markDirty();
        placeCaretIn(tr.cells[0], 'start');
      } else if(i >= 0) placeCaretIn(cells[i], 'end');
    }
    else if(li && editor.contains(li)) document.execCommand(ev.shiftKey ? 'outdent' : 'indent');
    else if(!ev.shiftKey) document.execCommand('insertText', false, '\u00A0\u00A0\u00A0\u00A0');
  }
});

/* Global shortcuts (capture phase so they also work inside math) */
window.addEventListener('keydown', function(ev){
  const helpOpen = $('helpModal').classList.contains('open');
  if(ev.key === 'Escape' && helpOpen){ closeHelp(); ev.preventDefault(); return; }
  if(ev.key === 'F1'){ ev.preventDefault(); openHelp(); return; }
  const mod = ev.ctrlKey || ev.metaKey;
  if(!mod) return;
  const k = (ev.key || '').toLowerCase();
  const act = document.activeElement;
  const inMf = isMf(act);
  const go = function(fn){ ev.preventDefault(); ev.stopPropagation(); fn(); };
  if(k === 'm' && !ev.altKey){
    if(inMf) return go(function(){ exitMath(wrapOf(act), 'forward'); });
    return go(function(){ ev.shiftKey ? insertDisplayMath() : insertInlineMath(); });
  }
  if(k === 's' && !ev.altKey) return go(function(){ saveFile(ev.shiftKey); });
  if(k === 'o' && !ev.altKey && !ev.shiftKey) return go(openFile);
  if(k === 'p' && !ev.altKey && !ev.shiftKey) return go(exportPDF);
  if(k === '/') return go(openHelp);
  if(ev.altKey && k === 'n') return go(newDoc);
  if(inMf || helpOpen) return;
  if(act !== editor) return;
  if(ev.key === 'Enter' && !ev.shiftKey && !ev.altKey) return go(insertPageBreak);
  if(ev.altKey && /^[0-3]$/.test(ev.key)) return go(function(){ setBlockStyle(ev.key === '0' ? 'p' : 'h' + ev.key); });
  if(ev.altKey) return;
  if(ev.shiftKey && k === 'l') return go(function(){ cmd('insertUnorderedList'); });
  if(ev.shiftKey && (ev.key === '+' || ev.code === 'Equal')) return go(function(){ cmd('superscript'); });
  if(!ev.shiftKey && (ev.key === '=' || ev.code === 'Equal')) return go(function(){ cmd('subscript'); });
  if(ev.shiftKey) return;
  const align = { l:'justifyLeft', e:'justifyCenter', r:'justifyRight', j:'justifyFull' }[k];
  if(align) return go(function(){ cmd(align); });
}, true);

/* ============================ text formatting ============================ */
function cmd(name, val){
  restoreSelection();
  document.execCommand(name, false, val);
  markDirty(); scheduleToolbarUpdate();
}
function setBlockStyle(tag){
  restoreSelection();
  document.execCommand('formatBlock', false, tag === 'blockquote' ? 'blockquote' : '<' + tag + '>');
  markDirty(); scheduleToolbarUpdate();
}
function setFontSize(pt){
  restoreSelection();
  const s = getSelection();
  pendingFontPt = pt;
  document.execCommand('fontSize', false, '7');
  fixFontSizes();
  if(s.isCollapsed) pendingFontPt = pt; // applies to the next typed text
  markDirty();
}
function fixFontSizes(){
  if(pendingFontPt == null) return;
  editor.querySelectorAll('span[style*="xxx-large"], font[size="7"]').forEach(function(el){
    if(el.tagName === 'FONT'){ el.removeAttribute('size'); }
    el.style.fontSize = pendingFontPt + 'pt';
  });
}

let tbScheduled = false;
function scheduleToolbarUpdate(){
  if(tbScheduled) return; tbScheduled = true;
  requestAnimationFrame(function(){ tbScheduled = false; updateToolbar(); });
}
function updateToolbar(){
  const s = getSelection();
  if(!s.rangeCount || !editor.contains(s.anchorNode) || inMath(s.anchorNode)) return;
  ['bold','italic','underline','strikeThrough','superscript','subscript','insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight','justifyFull']
    .forEach(function(c){
      const b = document.querySelector('.tb[data-cmd="' + c + '"]');
      let on = false; try { on = document.queryCommandState(c); } catch(e){}
      if(b) b.classList.toggle('active', on);
    });
  let blk = ''; try { blk = (document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch(e){}
  const styleSel = $('styleSel');
  styleSel.value = ['h1','h2','h3','blockquote'].indexOf(blk) >= 0 ? blk : 'p';
  const el = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
  if(el){
    const cs = getComputedStyle(el);
    const pt = Math.round(parseFloat(cs.fontSize) * 0.75);
    const sizeSel = $('sizeSel');
    if(![].some.call(sizeSel.options, function(o){ return +o.value === pt; })){
      const o = document.createElement('option'); o.value = o.textContent = pt; sizeSel.appendChild(o);
      const opts = [].slice.call(sizeSel.options).sort(function(a, b){ return a.value - b.value; });
      opts.forEach(function(o){ sizeSel.appendChild(o); });
    }
    sizeSel.value = String(pt);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g,'').trim();
    const fontSel = $('fontSel');
    if([].some.call(fontSel.options, function(o){ return o.value === fam; })) fontSel.value = fam;
  }
}

/* ============================== toolbar UI =============================== */
document.querySelectorAll('[data-cmd],[data-act],.pbtn').forEach(function(b){
  b.addEventListener('mousedown', function(e){ if(b.tagName === 'BUTTON') e.preventDefault(); });
});
document.querySelectorAll('[data-cmd]').forEach(function(b){
  b.addEventListener('click', function(){ cmd(b.getAttribute('data-cmd')); });
});
const ACTIONS = {
  math: function(){ insertInlineMath(); },
  display: function(){ insertDisplayMath(); },
  palette: togglePalette,
  new: newDoc, open: openFile,
  save: function(){ saveFile(false); }, saveas: function(){ saveFile(true); },
  pdf: exportPDF, help: openHelp, closehelp: closeHelp
};
document.querySelectorAll('[data-act]').forEach(function(b){
  b.addEventListener('click', function(){ const f = ACTIONS[b.getAttribute('data-act')]; if(f) f(); });
});
$('styleSel').addEventListener('change', function(e){ setBlockStyle(e.target.value); });
$('fontSel').addEventListener('change', function(e){ cmd('fontName', e.target.value); });
$('sizeSel').addEventListener('change', function(e){ setFontSize(+e.target.value); });
$('fgColor').addEventListener('input', function(e){ $('fgBar').style.background = e.target.value; });
$('fgColor').addEventListener('change', function(e){ cmd('foreColor', e.target.value); });
$('hlColor').addEventListener('input', function(e){ $('hlBar').style.background = e.target.value; });
$('hlColor').addEventListener('change', function(e){ cmd('hiliteColor', e.target.value); });
$('insertSel').addEventListener('change', function(e){
  const v = e.target.value; e.target.value = '';
  if(!v) return;
  if(v === 'table') insertTable();
  else if(v === 'hr'){ cmd('insertHorizontalRule'); }
  else if(v === 'pagebreak') insertPageBreak();
  else insertBox(v);
});
$('zoomSel').addEventListener('change', function(e){
  $('page').style.zoom = e.target.value;
  try { localStorage.setItem('mathnotes.zoom', e.target.value); } catch(err){}
});
$('page').addEventListener('mousedown', function(e){
  if(e.target === $('page')){
    e.preventDefault();
    ensureContent();
    const last = editor.lastElementChild;
    if(last && isTextBlock(last)) placeCaretIn(last, 'end');
    else { const p = newPara(); editor.appendChild(p); placeCaretIn(p, 'start'); }
  }
});
editor.addEventListener('click', function(e){
  const w = e.target.closest && e.target.closest('.math-block');
  if(w && e.target === w) focusMath(w, 'end');
});

function togglePalette(){
  const p = $('palette'); p.classList.toggle('hidden');
  $('paletteBtn').classList.toggle('active', !p.classList.contains('hidden'));
  try { localStorage.setItem('mathnotes.palette', p.classList.contains('hidden') ? '0' : '1'); } catch(e){}
}
function buildPalette(){
  const body = $('paletteBody');
  PALETTE.forEach(function(g){
    const h = document.createElement('h4'); h.textContent = g[0]; body.appendChild(h);
    const grid = document.createElement('div'); grid.className = 'pgrid ' + g[1];
    g[2].forEach(function(it){
      const b = document.createElement('button');
      b.className = 'pbtn';
      b.innerHTML = '<span class="mf-static">' + M.renderStatic(it[0], false) + '</span>';
      const typed = SHORTCUT_OF[it[1]] || SHORTCUT_OF[it[0]];
      const nm = (it[1].match(/^\\([A-Za-z]+)/) || [])[1];
      b.title = typed ? 'Type “' + typed + '” in math' : nm ? 'Type \\' + nm + ' in math' : /^[\^_]/.test(it[1]) ? 'Type ' + it[1][0] + ' in math' : '';
      b.addEventListener('mousedown', function(e){ e.preventDefault(); });
      b.addEventListener('click', function(){ paletteInsert(it[1]); });
      grid.appendChild(b);
    });
    body.appendChild(grid);
  });
}
function buildHelp(){
  const list = $('scList');
  SHORTCUT_LIST.forEach(function(s){
    const d = document.createElement('div'); d.className = 'sc';
    d.innerHTML = '<kbd>' + escapeHTML(s[0]) + '</kbd><span class="mf-static">' + M.renderStatic(s[1], false) + '</span>';
    list.appendChild(d);
  });
  const cb = $('setDollar');
  cb.checked = !!settings.dollar;
  cb.addEventListener('change', function(){
    settings.dollar = cb.checked;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch(e){}
  });
}
function openHelp(){ $('helpModal').classList.add('open'); }
function closeHelp(){ $('helpModal').classList.remove('open'); }
$('helpModal').addEventListener('mousedown', function(e){ if(e.target === $('helpModal')) closeHelp(); });

function setHint(inMathNow){
  $('hint').innerHTML = inMathNow
    ? '<b>Math:</b> Enter/Esc to leave · type pi, inf, sum, int, sqrt, theta… · <kbd>/</kbd> fraction · <kbd>^</kbd> power · <kbd>_</kbd> subscript · <kbd>\\</kbd> any command'
    : 'Ctrl+M or $ for math · Ctrl+Shift+M for a centered equation · F1 for all shortcuts';
}

/* ======================= copy / cut / paste with math ===================== */
function dehydrateClone(c, latex){
  c.setAttribute('data-latex', latex);
  c.removeAttribute('contenteditable');
  c.classList.remove('editing', 'empty');
  c.textContent = latex;
}
function handleCopy(ev){
  const s = getSelection();
  if(!s.rangeCount || s.isCollapsed) return false;
  const r = s.getRangeAt(0);
  const frag = r.cloneContents();
  const clones = frag.querySelectorAll('.math-inline,.math-block');
  if(!clones.length) return false;
  const origs = [].filter.call(editor.querySelectorAll('.math-inline,.math-block'), function(w){ return r.intersectsNode(w); });
  clones.forEach(function(c, i){ dehydrateClone(c, origs[i] ? getLatex(origs[i]) : (c.getAttribute('data-latex') || '')); });
  const div = document.createElement('div'); div.appendChild(frag);
  ev.clipboardData.setData('text/html', '<div data-mathnotes="1">' + div.innerHTML + '</div>');
  // plain text version with $…$
  const tmp = div.cloneNode(true);
  tmp.querySelectorAll('.math-inline').forEach(function(w){ w.replaceWith('$' + w.getAttribute('data-latex') + '$'); });
  tmp.querySelectorAll('.math-block').forEach(function(w){ w.replaceWith('\n$$' + w.getAttribute('data-latex') + '$$\n'); });
  tmp.querySelectorAll('p,h1,h2,h3,li,div,blockquote,tr').forEach(function(b){ b.append('\n'); });
  ev.clipboardData.setData('text/plain', tmp.textContent.replace(ZW_RE,'').replace(/\n{3,}/g,'\n\n').trim());
  return true;
}
editor.addEventListener('copy', function(ev){ if(ev.target !== editor && inMath(ev.target)) return; if(handleCopy(ev)) ev.preventDefault(); });
editor.addEventListener('cut', function(ev){
  if(ev.target !== editor && inMath(ev.target)) return;
  if(handleCopy(ev)){ ev.preventDefault(); document.execCommand('delete'); markDirty(); }
});
function sanitizeHTML(html){
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(function(n){ n.remove(); });
  doc.querySelectorAll('*').forEach(function(el){
    [].slice.call(el.attributes).forEach(function(a){
      if(/^on/i.test(a.name) || /javascript:/i.test(a.value)) el.removeAttribute(a.name);
    });
  });
  const root = doc.querySelector('[data-mathnotes]') || doc.body;
  return root.innerHTML;
}
function textWithMathToHTML(text){
  let h = escapeHTML(text.replace(/\r\n?/g, '\n'));
  h = h.replace(/\$\$([\s\S]+?)\$\$/g, function(_, l){ return '<div class="math-block" data-latex="' + l.trim() + '">' + l.trim() + '</div>'; });
  h = h.replace(/\\\[([\s\S]+?)\\\]/g, function(_, l){ return '<div class="math-block" data-latex="' + l.trim() + '">' + l.trim() + '</div>'; });
  h = h.replace(/\$([^$\n]+?)\$/g, function(_, l){ return '<span class="math-inline" data-latex="' + l + '">' + l + '</span>'; });
  h = h.replace(/\\\(([\s\S]+?)\\\)/g, function(_, l){ return '<span class="math-inline" data-latex="' + l + '">' + l + '</span>'; });
  return h.split(/\n{2,}/).map(function(par){ return '<p>' + par.replace(/\n/g, '<br>') + '</p>'; }).join('');
}
editor.addEventListener('paste', function(ev){
  if(ev.target !== editor && inMath(ev.target)) return;
  const cd = ev.clipboardData; if(!cd) return;
  const html = cd.getData('text/html'), text = cd.getData('text/plain');
  ev.preventDefault();
  restoreSelection();
  pasting = true;
  if(html && html.indexOf('data-mathnotes') >= 0){
    document.execCommand('insertHTML', false, sanitizeHTML(html));
  } else if(/\$[^$\n]+\$|\\\(|\\\[/.test(text)){
    document.execCommand('insertHTML', false, textWithMathToHTML(text));
  } else {
    document.execCommand('insertText', false, text);
  }
  pasting = false;
  // remember where the caret is, turn pasted math into live fields, then put the caret back
  const s = getSelection();
  const marker = document.createElement('span');
  if(s.rangeCount && editor.contains(s.anchorNode)){
    const r = s.getRangeAt(0); r.collapse(false); r.insertNode(marker);
    const w = wrapOf(marker.parentElement);
    if(w){
      if(w.classList.contains('math-block')){
        let nb = w.nextElementSibling;
        if(!isTextBlock(nb)){ nb = newPara(); w.after(nb); }
        nb.insertBefore(marker, nb.firstChild);
      } else w.after(marker);
    }
  }
  hydrate(editor);
  if(marker.isConnected){
    const r = document.createRange(); r.setStartBefore(marker); r.collapse(true);
    marker.remove();
    focusEditorAt(r);
  }
  markDirty(); updateEmptyState();
});
editor.addEventListener('drop', function(ev){
  // dropping a .mathnote file opens it; other drops are plain text only
  const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if(f){ ev.preventDefault(); readFileObject(f); }
});

/* ============================= input handling ============================ */
let countTimer = null, pasting = false;
editor.addEventListener('input', function(ev){
  if(pasting || ev.target !== editor) return;
  fixFontSizes();
  ensureContent();
  // undo can bring back a math wrapper without its live field
  const stale = [].some.call(editor.querySelectorAll('.math-inline,.math-block'), function(w){ return !w.__field || !w.contains(w.__field.el); });
  if(stale) hydrate(editor);
  markDirty(); updateEmptyState();
});
function updateCounts(){
  const text = (editor.innerText || '').replace(ZW_RE, '');
  const words = (text.match(/[A-Za-z0-9\u00C0-\u024F'’]+/g) || []).length;
  const eqs = editor.querySelectorAll('.math-inline,.math-block').length;
  $('counts').textContent = words + ' word' + (words === 1 ? '' : 's') + ' · ' + eqs + ' math item' + (eqs === 1 ? '' : 's');
}
function markDirty(){
  dirty = true; autosavePending = true;
  updateSaveState();
  clearTimeout(countTimer); countTimer = setTimeout(updateCounts, 300);
}
function openFileName(){ return deskName || (fileHandle && fileHandle.name) || null; }
function updateSaveState(){
  const name = openFileName();
  $('saveState').textContent = dirty ? (name ? 'Unsaved changes' : 'Not saved to a file') : 'Saved' + (name ? ' — ' + name : '');
  document.title = (dirty ? '• ' : '') + getTitle() + ' — Derivo';
  if(DESK) DESK.setDirty(dirty);
}
titleInput.addEventListener('input', function(){ markDirty(); });
titleInput.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); placeCaretIn(editor.lastElementChild || editor, 'end'); } });
function getTitle(){ return (titleInput.value || 'Untitled notes').trim(); }

/* ============================ save / open / new ========================== */
function serialize(){
  const clone = editor.cloneNode(true);
  const origs = editor.querySelectorAll('.math-inline,.math-block');
  const clones = clone.querySelectorAll('.math-inline,.math-block');
  origs.forEach(function(o, i){ if(clones[i]) dehydrateClone(clones[i], getLatex(o)); });
  clone.querySelectorAll('.page-break').forEach(function(p){ p.removeAttribute('contenteditable'); });
  return {
    app: 'Derivo', version: 1, title: getTitle(),
    savedAt: new Date().toISOString(),
    html: clone.innerHTML
  };
}
function loadDoc(data){
  if(!data || typeof data.html !== 'string') throw new Error('Not a Derivo file');
  titleInput.value = data.title || 'Untitled notes';
  editor.innerHTML = sanitizeHTML(data.html);
  editor.querySelectorAll('.page-break').forEach(function(p){ p.contentEditable = 'false'; });
  ensureContent();
  hydrate(editor);
  savedRange = null;
  updateEmptyState(); updateCounts();
  $('workspace').scrollTop = 0;
}
function safeFileName(){ return getTitle().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) || 'notes'; }
async function saveFile(asNew){
  const data = serialize();
  const json = JSON.stringify(data, null, 1);
  try {
    if(DESK){
      const r = await DESK.save({ json: json, suggestedName: safeFileName(), filePath: deskPath, asNew: !!asNew });
      if(!r) return false;
      deskPath = r.path; deskName = r.name;
      if(asNew || titleInput.value === 'Untitled notes') titleInput.value = r.name.replace(/\.(derivo|mathnote)$/i, '');
      dirty = false; updateSaveState(); doAutosave();
      toast('Saved to ' + r.name);
      return true;
    }
    if(window.showSaveFilePicker){
      if(!fileHandle || asNew){
        fileHandle = await window.showSaveFilePicker({
          suggestedName: safeFileName() + '.derivo',
          types: [{ description: 'Derivo document', accept: { 'application/json': ['.derivo'] } }]
        });
      }
      const w = await fileHandle.createWritable();
      await w.write(json); await w.close();
      const base = fileHandle.name.replace(/\.(derivo|mathnote)$/i, '');
      if(asNew || titleInput.value === 'Untitled notes') titleInput.value = base;
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = safeFileName() + '.derivo';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
    }
    dirty = false; updateSaveState(); doAutosave();
    toast('Saved' + (fileHandle ? ' to ' + fileHandle.name : ' to your Downloads folder'));
    return true;
  } catch(e){
    if(e && e.name === 'AbortError') return false;
    toast('Could not save: ' + (e && e.message ? e.message : e), 4000);
    return false;
  }
}
async function openFile(){
  if(dirty && !confirm('You have unsaved changes. Open another file anyway?')) return;
  if(DESK){
    try { const d = await DESK.open(); if(d) openDesktopDoc(d); }
    catch(e){ toast('Could not open: ' + (e && e.message ? e.message : e), 4000); }
    return;
  }
  if(window.showOpenFilePicker){
    try {
      const handles = await window.showOpenFilePicker({
        types: [{ description: 'Derivo document', accept: { 'application/json': ['.derivo', '.mathnote', '.json'] } }]
      });
      const f = await handles[0].getFile();
      await readFileObject(f, handles[0]);
    } catch(e){ if(!e || e.name !== 'AbortError') toast('Could not open: ' + (e && e.message ? e.message : e), 4000); }
  } else {
    $('fileInput').click();
  }
}
$('fileInput').addEventListener('change', function(e){
  const f = e.target.files[0]; e.target.value = '';
  if(f) readFileObject(f);
});
function openDesktopDoc(d){
  try {
    loadDoc(JSON.parse(d.text));
    fileHandle = null; deskPath = d.path; deskName = d.name;
    dirty = false; updateSaveState(); doAutosave();
    toast('Opened ' + d.name);
  } catch(e){ toast('That file could not be opened as Derivo.', 4000); }
}
async function readFileObject(f, handle){
  try {
    const text = await f.text();
    loadDoc(JSON.parse(text));
    fileHandle = handle || null; deskPath = null; deskName = null;
    dirty = false; updateSaveState(); doAutosave();
    toast('Opened ' + f.name);
  } catch(e){ toast('That file could not be opened as Derivo.', 4000); }
}
function newDoc(){
  if(dirty && !confirm('Start a new document? Unsaved changes in this one will be lost.')) return;
  editor.innerHTML = ''; ensureContent();
  titleInput.value = 'Untitled notes';
  fileHandle = null; deskPath = null; deskName = null; dirty = false; savedRange = null;
  updateSaveState(); updateEmptyState(); updateCounts(); doAutosave();
  placeCaretIn(editor.firstElementChild, 'start');
}

/* =============================== PDF export ============================== */
async function exportPDF(){
  const a = document.activeElement;
  if(isMf(a)) a.blur();
  closeHelp();
  const oldTitle = document.title;
  document.title = getTitle();   // becomes the default PDF file name
  try { await document.fonts.ready; } catch(e){}
  if(DESK){
    try {
      const r = await DESK.exportPDF({ suggestedName: safeFileName() });
      if(r){ toast('PDF saved: ' + r.name); DESK.showInFolder(r.path); }
    } catch(e){ toast('Could not export the PDF: ' + (e && e.message ? e.message : e), 4000); }
    document.title = oldTitle; updateSaveState();
    return;
  }
  if(!localStorage.getItem('mathnotes.pdfTipShown')){
    try { localStorage.setItem('mathnotes.pdfTipShown', '1'); } catch(e){}
    alert('In the next window, set "Destination" to "Save as PDF", then click Save.\n\nTip: under "More settings", untick "Headers and footers" for a clean page.');
  }
  setTimeout(function(){
    window.print();
    document.title = oldTitle; updateSaveState();
  }, 60);
}

/* =============================== autosave ================================ */
function doAutosave(){
  try {
    const d = serialize(); d.dirty = dirty;
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(d));
    autosavePending = false;
  } catch(e){}
}
setInterval(function(){ if(autosavePending) doAutosave(); }, 2500);
window.addEventListener('beforeunload', function(e){
  doAutosave();
  if(dirty && !DESK){ e.preventDefault(); e.returnValue = ''; }   // the desktop app asks with its own dialog
});
window.addEventListener('dragover', function(e){ e.preventDefault(); });
window.addEventListener('drop', function(e){
  if(e.target === editor || editor.contains(e.target)) return;
  e.preventDefault();
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) readFileObject(f);
});

/* ================================ startup ================================ */
try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch(e){}
try { document.execCommand('styleWithCSS', false, true); } catch(e){}
buildPalette(); buildHelp();
try {
  if(localStorage.getItem('mathnotes.palette') === '0') $('palette').classList.add('hidden');
  const z = localStorage.getItem('mathnotes.zoom'); if(z){ $('zoomSel').value = z; $('page').style.zoom = z; }
} catch(e){}
$('paletteBtn').classList.toggle('active', !$('palette').classList.contains('hidden'));

let restored = false;
try {
  const saved = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || 'null');
  if(saved && saved.html){ loadDoc(saved); dirty = !!saved.dirty; restored = true; }
} catch(e){}
if(!restored){ ensureContent(); }
updateEmptyState(); updateCounts(); updateSaveState();
setTimeout(function(){ if(!restored) placeCaretIn(editor.firstElementChild, 'start'); }, 50);
if(restored && editor.textContent.replace(ZW_RE,'').trim()) toast('Restored your last session');

hydrate(editor);
updateCounts();
document.getElementById('aboutLine').textContent = 'Derivo ' + APP_VERSION + ' · equations are typeset by Derivo\'s own engine and work fully offline.';

/* ---------- Windows desktop app support ---------- */
if(DESK){
  document.documentElement.classList.add('desktop');
  DESK.version().then(function(v){ $('aboutLine').textContent = 'Derivo ' + v + ' for Windows · equations are typeset by Derivo\'s own engine and work fully offline.'; }).catch(function(){});
  DESK.onOpenFile(function(d){
    if(dirty && !confirm('You have unsaved changes. Open "' + d.name + '" anyway?')) return;
    openDesktopDoc(d);
  });
  DESK.onMenu(function(a){
    if(a === 'save-and-close'){ saveFile(false).then(function(ok){ if(ok) DESK.closeNow(); }); return; }
    if(a === 'undo' || a === 'redo'){
      const act = document.activeElement;
      if(isMf(act)){ const w = wrapOf(act); if(w && w.__field) w.__field[a](); }
      else { restoreSelection(); document.execCommand(a); }
      return;
    }
    const f = ACTIONS[a];
    if(f) f();
  });
  updateSaveState();
}

/* ---------- installed-app support (PWA) ---------- */
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}
if('launchQueue' in window){
  window.launchQueue.setConsumer(async function(params){
    if(!params.files || !params.files.length) return;
    if(dirty && !confirm('You have unsaved changes. Open the other file anyway?')) return;
    const h = params.files[0];
    try { const f = await h.getFile(); await readFileObject(f, h); } catch(e){ toast('Could not open that file.'); }
  });
}

// expose a tiny API for testing / debugging
window.MathNotes = { serialize: serialize, loadDoc: loadDoc, insertInlineMath: insertInlineMath, insertDisplayMath: insertDisplayMath, version: APP_VERSION };
})();
