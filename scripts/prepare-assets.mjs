import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  const target = new URL(`public/pdfjs/${folder}/`, root);
  await mkdir(target, { recursive: true });
  await cp(new URL(`node_modules/pdfjs-dist/${folder}/`, root), target, { recursive: true });
}
