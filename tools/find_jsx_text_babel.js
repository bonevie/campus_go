const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const path = require('path');
const file = path.join(__dirname, '..', 'campus_go', 'screens', 'VisitorMap.js');
const src = fs.readFileSync(file, 'utf8');
const ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx', 'classProperties', 'optionalChaining'] });
const results = [];
const isSvgTextTag = (name) => {
  if (!name) return false;
  const n = name.toLowerCase();
  return n === 'text' || n === 'svgtext' || n === 'svg.text';
};

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
    if (!isSvgTextTag(tagName) && (!tagName || tagName.toLowerCase() !== 'text')) {
      const loc = pathNode.node.loc;
      results.push({ line: loc.start.line, col: loc.start.column, parent: tagName || '(unknown)', text: value.trim() });
    }
  }
});

if (results.length === 0) {
  console.log('No bare JSXText nodes found');
} else {
  console.log('Found bare JSXText nodes:');
  results.forEach(r => console.log(`line ${r.line}:${r.col} parent <${r.parent}> -> "${r.text}"`));
}
