#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const targetArg = process.argv[2] || path.join('campus_go','screens','VisitorMap.js');

function parseFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  try {
    const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx', 'classProperties', 'optionalChaining'] });
    scanAst(ast, file);
  } catch (err) {
    // skip files that don't parse (node modules, flow, etc.)
    // console.log(`skip ${file}: ${err.message}`);
  }
}

const results = [];

function getJSXElementName(node) {
  if (!node || !node.openingElement) return null;
  const n = node.openingElement.name;
  if (!n) return null;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${n.object.name}.${n.property.name}`;
  return null;
}

function hasTextAncestor(path) {
  let p = path.parentPath;
  while (p) {
    if (p.node && p.node.type === 'JSXElement') {
      const name = getJSXElementName(p.node);
      if (name === 'Text') return true;
    }
    p = p.parentPath;
  }
  return false;
}

function scanAst(ast, file) {
  traverse(ast, {
    JSXElement(path) {
      const parentName = getJSXElementName(path.node);
      (path.node.children || []).forEach((ch) => {
        if (!ch) return;
        if (ch.type === 'JSXExpressionContainer') {
          const expr = ch.expression;
          if (!expr) return;
          if (expr.type === 'StringLiteral') {
            if (!hasTextAncestor(path)) results.push({ file, line: expr.loc.start.line, col: expr.loc.start.column, parent: parentName || 'unknown', text: expr.value });
          }
          if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
            const raw = expr.quasis.map(q => q.value.cooked).join('');
            if (!hasTextAncestor(path)) results.push({ file, line: expr.loc.start.line, col: expr.loc.start.column, parent: parentName || 'unknown', text: raw });
          }
        }
        if (ch.type === 'JSXText') {
          if (ch.value && ch.value.trim().length > 0) {
            if (!hasTextAncestor(path)) results.push({ file, line: ch.loc.start.line, col: ch.loc.start.column, parent: parentName || 'unknown', text: ch.value.trim() });
          }
        }
      });
    }
  });
}

const argPath = targetArg;
const stat = fs.statSync(argPath);
if (stat.isDirectory()) {
  // walk directory
  const walk = (dir) => {
    const entries = fs.readdirSync(dir);
    for (const e of entries) {
      const full = path.join(dir, e);
      if (full.includes('node_modules')) continue;
      const s = fs.statSync(full);
      if (s.isDirectory()) walk(full);
      else if (s.isFile() && (full.endsWith('.js') || full.endsWith('.jsx'))) parseFile(full);
    }
  };
  walk(argPath);
} else {
  parseFile(argPath);
}

if (results.length === 0) console.log('No JSX expression string children found.');
else results.forEach(r => console.log(`${r.file}:${r.line}:${r.col} <${r.parent}> -> "${r.text}"`));
