import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'style.css'), 'utf8');
const js = readFileSync(join(root, 'script.js'), 'utf8');

const DEV_ASSETS_URL = "'./assets/'";
const PROD_ASSETS_URL = "'https://raw.githubusercontent.com/auelx/urban-flood-assessment/main/assets/'";
if (!js.includes(DEV_ASSETS_URL)) {
  console.error('build.mjs: ASSETS_URL dev placeholder not found in script.js: ' + DEV_ASSETS_URL);
  process.exit(1);
}
const jsProd = js.replace(DEV_ASSETS_URL, PROD_ASSETS_URL);

const composed = html
  .replace('<link rel="stylesheet" href="style.css" />', `<style>\n${css}\n</style>`)
  .replace('<script src="script.js"></script>', `<script>\n${jsProd}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
const tmp = join(root, 'dist', '.composed.html');
writeFileSync(tmp, composed);

const res = spawnSync(
  'npx',
  [
    '--yes', 'html-minifier-terser',
    '--collapse-whitespace',
    '--remove-comments',
    '--minify-css', 'true',
    '--minify-js', 'true',
    '--output', join(root, 'dist', 'index.min.html'),
    tmp
  ],
  { stdio: 'inherit', shell: true }
);

rmSync(tmp);
process.exit(res.status);