const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const target = process.argv[2] || path.join('campus_go','screens','VisitorMap.js');
const code = fs.readFileSync(target, 'utf8');
const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'classProperties', 'optionalChaining'] });

const suspect = [];

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
    // skip if parent is Text
    if (parentName === 'Text') return;
    (path.node.children || []).forEach((ch) => {
      if (!ch) return;
      if (ch.type === 'JSXExpressionContainer') {
        const t = ch.expression.type;
        // flag common non-JSX types that may render strings/numbers
        const flagged = ['Identifier','MemberExpression','CallExpression','BinaryExpression','TemplateLiteral','NumericLiteral','StringLiteral','UnaryExpression'];
        if (flagged.includes(t)) {
          suspect.push({ line: ch.loc.start.line, col: ch.loc.start.column, parent: parentName, exprType: t, code: code.split('\n')[ch.loc.start.line-1].trim() });
        }
      }
      if (ch.type === 'JSXText') {
        if (ch.value && ch.value.trim().length > 0) suspect.push({ line: ch.loc.start.line, col: ch.loc.start.column, parent: parentName, exprType: 'JSXText', code: ch.value.trim() });
      }
    });
  }
});

if (suspect.length === 0) console.log('No suspect JSX children detected.');
else suspect.forEach(s => console.log(`${target}:${s.line}:${s.col} <${s.parent}> [${s.exprType}] -> ${s.code}`));
