const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'campus_go', 'screens', 'VisitorMap.js');
const src = fs.readFileSync(file, 'utf8');
let stack = [];
let i = 0;
let line = 1;
const results = [];
function peekName() {
  if (stack.length === 0) return null;
  return stack[stack.length - 1].name;
}
while (i < src.length) {
  const ch = src[i];
  if (ch === '\n') { line++; i++; continue; }
  if (ch === '<') {
    // detect comment or expression or closing tag
    if (src.startsWith('<!--', i)) { i += 4; continue; }
    if (src.startsWith('{/*', i)) {
      // skip until '*/}'
      const end = src.indexOf('*/}', i+3);
      if (end === -1) break; i = end + 3; continue;
    }
    if (src.startsWith('</', i)) {
      // closing tag
      i += 2;
      // read tag name
      const m = src.slice(i).match(/^\s*([A-Za-z0-9_:-]+)/);
      if (m) {
        const name = m[1];
        // pop until matching name
        for (let j = stack.length - 1; j >= 0; j--) {
          if (stack[j].name === name) { stack.splice(j, 1); break; }
        }
      }
      // advance to '>'
      const gt = src.indexOf('>', i);
      if (gt === -1) break; i = gt + 1; continue;
    }
    // opening tag or self-closing
    i++;
    // skip whitespace
    while (i < src.length && /[\s]/.test(src[i])) i++;
    // read tag name or expression
    if (src[i] === '{') {
      // JSX expression like <{...}>
      // skip
      i++; continue;
    }
    const m = src.slice(i).match(/^([A-Za-z0-9_:-]+)/);
    if (!m) { i++; continue; }
    const name = m[1];
    // push to stack
    stack.push({ name, pos: i, line });
    // find end of tag '>' (consider attributes may have > inside strings)
    let gt = i;
    let inStr = null;
    while (gt < src.length) {
      const c = src[gt];
      if (c === '\n') {
        // maintain line count by scanning later
      }
      if (inStr) {
        if (c === inStr) { inStr = null; }
      } else {
        if (c === '"' || c === "'") inStr = c;
        else if (c === '>') break;
      }
      gt++;
    }
    if (gt >= src.length) break;
    // check if self-closing '/>'
    const before = src.slice(i, gt+1);
    const selfClosing = /\/>\s*$/.test(before) || /\/>\s*$/.test(src.slice(i, gt+1));
    if (selfClosing) {
      // pop immediately
      stack.pop();
    }
    // advance i to after '>'
    i = gt + 1;
    continue;
  }
  // text node: collect until next '<'
  const nextLt = src.indexOf('<', i);
  const text = src.slice(i, nextLt === -1 ? src.length : nextLt);
  // determine if text has non-whitespace characters
  if (/\S/.test(text)) {
    const trimmed = text.trim();
    // ignore JSX expressions or blocks that start with '{' or comments
    if (!trimmed.startsWith('{') && !trimmed.startsWith('/*') && !trimmed.startsWith('*') && !trimmed.startsWith('//')) {
      const parent = peekName();
      if (parent && parent.toLowerCase() !== 'text' && parent.toLowerCase() !== 'svg' && parent.toLowerCase() !== 'g' && parent.toLowerCase() !== 'path' && parent.toLowerCase() !== 'rect' && parent.toLowerCase() !== 'polygon' && parent.toLowerCase() !== 'polyline' && parent.toLowerCase() !== 'circle') {
        // compute local line number
        const snippet = trimmed;
        const l = line + (src.slice(0, i).match(/\n/g) || []).length;
        results.push({line: l, parent, snippet: snippet.slice(0,80) });
      }
    }
  }
  // advance i to nextLt
  if (nextLt === -1) break;
  i = nextLt;
}
if (results.length === 0) {
  console.log('No bare JSX text nodes found (heuristic scan).');
} else {
  console.log('Found potential bare text nodes:');
  for (const r of results) console.log(`line ${r.line} parent <${r.parent}> -> "${r.snippet}"`);
}
