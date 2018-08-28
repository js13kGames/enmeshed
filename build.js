#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const child_process = require('child_process');

const INDEX_HTML = path.join(process.cwd(), 'index.html');
const BUILD_DIR = path.join(process.cwd(), 'build');
const DIST_DIR = path.join(process.cwd(), 'dist');

const TARGET_SIZE = 13312;

const safeSubstitutions = {
  'LOWER_MASK': 'LM',
  'MATRIX_A': 'MA',
  'UPPER_MASK': 'UM',
  'address': 'a',
  'addresses': 'aa',
  'blink': 'b',
  'cameFrom': 'cf',
  'connection': 'c',
  'destination': 'd',
  'edge': 'e',
  'edge-empty': 'ee',
  'edge-forward': 'ef',
  'edge-interact': 'ei',
  'edge-offline-empty': 'eoe',
  'edge-packet-empty': 'epe',
  'edge-packet-forward': 'epf',
  'edge-packet-reverse': 'epr',
  'edge-reverse': 'er',
  'element': 'el',
  'goal': 'g',
  'idealPath': 'ip',
  'interface': 'i',
  'node': 'n',
  'node-effect': 'ne',
  'node-effect-animate': 'nea',
  'node-effect-checksum': 'nec',
  'node-effect-inspect': 'nei',
  'node-effect-multiply': 'nem',
  'node-effect-reroute': 'ner',
  'node-effect-slowdown': 'nes',
  'node-effect-trace': 'net',
  'node-offline': 'no',
  'node-packet': 'np',
  'offline': 'o',
  'offline-banner': 'ob',
  'offline-fade': 'of',
  'packet': 'p',
  'selected': 's',
  'spinner': 'sp',
  'ticks': 'ts',
  'toolbar': 't'
};

const substitutions = Object.keys(safeSubstitutions).sort(function(a, b) {
  if (a.length < b.length) {
    return 1;
  } else if (a.length > b.length) {
    return -1;
  }
  return 0;
});

const substitutionSet = new Set();
substitutions.forEach(function(key) {
  const item = safeSubstitutions[key];
  if (substitutionSet.has(item)) {
    console.log('Duplicate key in substitution list:', item);
    process.exit(0);
  }
  substitutionSet.add(item);
});

function bytes(number) {
  return String(number).replace(/(\d\d\d)$/, ',$1 bytes');
}

let html = fs.readFileSync(INDEX_HTML).toString();
const htmlSize = html.length;

mkdirp.sync(BUILD_DIR);

//////////
// JavaScript
let script;
html = html.replace(/<script>([^]+)<\/script>/, function (match, p1) {
  script = p1;
  return '<script>__SCRIPT__</script>';
});
fs.writeFileSync(BUILD_DIR + '/index.js', script);

console.log('Linting Javascript...');
try {
  child_process.execSync('./node_modules/.bin/eslint --fix ./build/index.js', {
    stdio: 'inherit'
  });
} catch (error) {
  console.log('Linting failed.');
  process.exit(0);
}

const newScript = fs.readFileSync(BUILD_DIR + '/index.js').toString();
if (newScript !== script) {
  console.log('  Updating index.html with linted JavaScript.');
  fs.writeFileSync(INDEX_HTML, html.replace('__SCRIPT__', newScript));
}
console.log();

console.log('Uglifying JavaScript...');
try {
  child_process.execSync('./node_modules/.bin/uglifyjs --compress --mangle --rename --toplevel --output ./build/index.min.js ./build/index.js');
} catch (error) {
  console.log('UglifyJS failed');
  process.exit(0);
}
const minScript = fs.readFileSync(BUILD_DIR + '/index.min.js').toString();
console.log('  index.js (%s) -> index.min.js (%s)\n', bytes(newScript.length), bytes(minScript.length));

//////////
// CSS
let style;
html = html.replace(/<style>([^]+)<\/style>/, function (match, p1) {
  style = p1;
  return '<style>__STYLE__</style>';
});

console.log('Minifying CSS...');
fs.writeFileSync(BUILD_DIR + '/index.css', style);
try {
  child_process.execSync('./node_modules/.bin/postcss ./build/index.css > ./build/index.min.css');
} catch (error) {
  console.log('PostCSS/CSSNano failed');
  process.exit(0);
}
const minStyle = fs.readFileSync(BUILD_DIR + '/index.min.css').toString();
console.log('  index.css (%s) -> index.min.css (%s)\n', bytes(style.length), bytes(minStyle.length));

//////////
// HTML
console.log('Building compressed HTML...');
html = html.split(/\n+/).map(x => x.trim()).join('').replace(/>[\s\n]+</g, '><');
const compressedHTML = html.replace('__SCRIPT__', minScript).replace('__STYLE__', minStyle);
fs.writeFileSync(BUILD_DIR + '/index.min.html', compressedHTML);
const compressedSize = compressedHTML.length;
console.log('  index.html (%s) -> build/index.min.html (%s)\n', bytes(htmlSize), bytes(compressedSize));

console.log('Performing safe substitutions...');
let substitutedHTML = compressedHTML;
for (const key of substitutions) {
  const pattern = new RegExp(key, 'g');
  substitutedHTML = substitutedHTML.replace(pattern, safeSubstitutions[key]);
}
mkdirp.sync(DIST_DIR);
fs.writeFileSync(DIST_DIR + '/index.html', substitutedHTML);
const htmlStat = fs.statSync(DIST_DIR + '/index.html');
console.log('  build/index.min.html (%s) -> dist/index.html (%s)\n', bytes(compressedSize), bytes(htmlStat.size));

/////////
// Zip
console.log('Building Zip archive...');
process.chdir(DIST_DIR);
child_process.execSync('zip enmeshed.zip index.html');

const zipStat = fs.statSync('enmeshed.zip');
console.log('  enmeshed.zip (%s => %s%)\n', bytes(zipStat.size), 100 - Math.floor((zipStat.size / htmlStat.size) * 100));

if (zipStat.size <= TARGET_SIZE) {
  console.log('Build succeeded! %s to spare!', bytes(TARGET_SIZE - zipStat.size));
  process.exit(0);
} else {
  console.log('Build failed! Zip file too big!!');
  process.exit(0);
}
