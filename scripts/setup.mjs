import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';

await mkdir('data', { recursive: true });
await mkdir('artifacts', { recursive: true });
for (const path of ['.env.example', 'fixtures/demo-project.json']) {
  try { await access(path, constants.F_OK); } catch { console.log(`missing optional file: ${path}`); }
}
console.log('Local Agent Workspace setup complete. Configure DEEPSEEK_API_KEY only when you want the real provider.');
