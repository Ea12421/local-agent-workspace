import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('apps/desktop/dist', { recursive: true });
await copyFile('apps/desktop/dist/main.js', 'apps/desktop/dist/main.cjs');
console.log('Desktop entry compiled: apps/desktop/dist/main.cjs');
