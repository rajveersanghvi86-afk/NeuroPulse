// Copies the MediaPipe Tasks WASM runtime from node_modules into public/ so the site serves it
// itself (no CDN). Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(src)) {
  console.error('copy-mediapipe: @mediapipe/tasks-vision is not installed. Run npm install.');
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log('copy-mediapipe: WASM runtime copied to public/mediapipe/wasm');
