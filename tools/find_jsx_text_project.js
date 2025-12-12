const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const path = require('path');
function scanFile(file) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx', 'classProperties', 'optionalChaining'] });
    const results = [];
    traverse(ast, {
      JSXText(pathNode) {
        const value = pathNode.node.value;
        if (!/\S/.test(value)) return; // whitespace only
        // find nearest JSXElement parent
        let p = pathNode.parentPath;
        while (p && p.node && p.node.type !== 'JSXElement') p = p.parentPath;
        if (!p || !p.node) return;
        const opening = p.node.openingElement;
        const tagName = opening && opening.name && (opening.name.name || (opening.name.object && opening.name.object.name + '.' + opening.name.property.name));
        if (!tagName || tagName.toLowerCase() !== 'text') {
          const loc = pathNode.node.loc;
          results.push({ file, line: loc.start.line, col: loc.start.column, parent: tagName || '(unknown)', text: value.trim() });
        }
      }
    });
    return results;
  } catch (e) {
    return [{ file, error: e.message }];
  }
}

const root = path.join(__dirname, '..');
const files = [];
function walk(dir) {
  const items = fs.readdirSync(dir);
  for (const it of items) {
    const p = path.join(dir, it);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p);
    else if (it.endsWith('.js') || it.endsWith('.jsx')) files.push(p);
  }
}
walk(root);
let total = 0;
for (const f of files) {
  const res = scanFile(f);
  if (res && res.length) {
    for (const r of res) {
      if (r.error) console.log(`Error parsing ${r.file}: ${r.error}`);
      else console.log(`${r.file}:${r.line}:${r.col} <${r.parent}> -> "${r.text}"`);
      total++;
    }
  }
}
if (total === 0) console.log('No bare JSXText nodes across project');
