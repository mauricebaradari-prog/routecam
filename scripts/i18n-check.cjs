// Prüft die Übersetzungen: sammelt alle Texte aus t('…'), k('…') und rich('…') in src/
// und meldet pro Sprache in src/i18n/*.json, was fehlt, überflüssig ist oder bei Platzhaltern
// ({name}) bzw. Markierungen (<0>…</0>) nicht zum deutschen Original passt.
//
//   node scripts/i18n-check.cjs            → Bericht
//   node scripts/i18n-check.cjs --missing  → fehlende Texte als JSON (zum Übersetzen)

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const keys = new Set();

(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) { walk(full); continue; }
    if (!/\.(ts|tsx)$/.test(f)) continue;
    const sf = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = n => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['t', 'k', 'rich'].includes(n.expression.text)) {
        const a = n.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) keys.add(a.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
})(path.join(root, 'src'));

const marks = s => JSON.stringify([(s.match(/\{\w+\}/g) || []).sort(), (s.match(/<\/?\d+>/g) || []).sort()]);
const dir = path.join(root, 'src', 'i18n');
let problems = 0;
const missingOut = {};

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const lang = file.replace('.json', '');
  const dict = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const missing = [...keys].filter(k => !(k in dict));
  const unused = Object.keys(dict).filter(k => !keys.has(k));
  const broken = [...keys].filter(k => k in dict && marks(k) !== marks(dict[k]));
  if (missing.length) missingOut[lang] = missing;
  problems += missing.length + broken.length;
  console.log(`${lang}: ${missing.length} fehlen, ${broken.length} Platzhalter falsch, ${unused.length} ungenutzt`);
  for (const k of broken) console.log(`   ✗ ${k}  →  ${dict[k]}`);
}

if (process.argv.includes('--missing')) console.log(JSON.stringify(missingOut, null, 2));
console.log(`${keys.size} Texte im Code.`);
process.exit(problems ? 1 : 0);
