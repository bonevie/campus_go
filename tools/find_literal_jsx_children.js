const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const target = process.argv[2] || path.join('campus_go','screens','VisitorMap.js');
const code = fs.readFileSync(target, 'utf8');
const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'classProperties', 'optionalChaining'] });

const results = [];

function getJSXElementName(node) {
  if (!node || !node.openingElement) return null;
  const n = node.openingElement.name;
  if (!n) return null;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${n.object.name}.${n.property.name}`;
  return null;
}

traverse(ast, {
  JSXElement(path) {
    const parentName = getJSXElementName(path.node) || 'unknown';
    (path.node.children || []).forEach((ch) => {
      if (!ch) return;
      if (ch.type === 'JSXExpressionContainer') {
        const expr = ch.expression;
        if (!expr) return;
        if (['StringLiteral','NumericLiteral'].includes(expr.type)) {
          if (parentName !== 'Text') results.push({ file: target, line: expr.loc.start.line, col: expr.loc.start.column, parent: parentName, type: expr.type, text: expr.value });
        }
        if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
          const raw = expr.quasis.map(q => q.value.cooked).join('');
          if (parentName !== 'Text') results.push({ file: target, line: expr.loc.start.line, col: expr.loc.start.column, parent: parentName, type: 'TemplateLiteral', text: raw });
        }
      }
      if (ch.type === 'JSXText') {
        if (ch.value && ch.value.trim().length > 0) {
          if (parentName !== 'Text') results.push({ file: target, line: ch.loc.start.line, col: ch.loc.start.column, parent: parentName, type: 'JSXText', text: ch.value.trim() });
        }
      }
    });
  }
});

if (results.length === 0) console.log('No literal JSX children outside <Text> found.');
else results.forEach(r => console.log(`${r.file}:${r.line}:${r.col} <${r.parent}> [${r.type}] -> "${r.text}"`));
