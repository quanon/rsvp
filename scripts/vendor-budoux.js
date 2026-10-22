// Build vendor/budoux-ja.js (a classic script usable from file://) from an extracted budoux npm package.
// Usage: node scripts/vendor-budoux.js <path-to-extracted-package>
'use strict';

const fs = require('fs');
const path = require('path');

const pkgDir = process.argv[2];
if (!pkgDir) {
  console.error('Usage: node scripts/vendor-budoux.js <path-to-extracted-package>');
  process.exit(1);
}

const read = (rel) =>
  fs.readFileSync(path.join(pkgDir, rel), 'utf8').replace(/^\/\/# sourceMappingURL=.*$/m, '');
const { version, license } = JSON.parse(read('package.json'));

// Both files are CommonJS without dependencies; wrap each with its own `exports`.
const wrap = (src) => `(function (exports) {\n${src}\nreturn exports;\n})({})`;

const out = `// BudouX ${version} (${license}) Parser and ja_knbc model, vendored by scripts/vendor-budoux.js.
// Source: https://github.com/google/budoux
(function (root) {
  'use strict';
  const { Parser } = ${wrap(read('dist/parser.js'))};
  const { model } = ${wrap(read('dist/data/models/ja_knbc.js'))};
  root.BudouX = { version: ${JSON.stringify(version)}, parser: new Parser(model) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

const dest = path.join(__dirname, '..', 'vendor', 'budoux-ja.js');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${dest} (${out.length} bytes)`);
