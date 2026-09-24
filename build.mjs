import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'style.css'), 'utf8');
const js = readFileSync(join(root, 'script.js'), 'utf8');

const composed = html
  .replace('<link rel="stylesheet" href="style.css" />', `<style>\n${css}\n</style>`)
  .replace('<script src="script.js"></script>', `<script>\n${js}\n</script>`);

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