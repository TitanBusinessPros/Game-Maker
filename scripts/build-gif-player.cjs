const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const result = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/gif-player.js')],
  bundle: true, write: false, format: 'iife', globalName: 'GMGif',
  minify: true, legalComments: 'inline',
  nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean),
});
// Include the notices inside the HTML too: exported games carry the decoder.
const licenses = ['gifuct-js', 'js-binary-schema-parser'].map(name =>
  name + '\n' + fs.readFileSync(path.join(root, 'third-party', name + '-LICENSE.txt'), 'utf8')
).join('\n\n');
const block = '<!-- GIF PLAYER START -->\n<script>\n/*\n' + licenses + '\n*/\n' + result.outputFiles[0].text + '\n</script>\n<!-- GIF PLAYER END -->';
const target = path.join(root, 'play.html');
let html = fs.readFileSync(target, 'utf8');
html = html.includes('<!-- GIF PLAYER START -->')
  ? html.replace(/<!-- GIF PLAYER START -->[\s\S]*?<!-- GIF PLAYER END -->/, () => block)
  : html.replace('<script type="module">', () => block + '\n<script type="module">');
fs.writeFileSync(target, html);
