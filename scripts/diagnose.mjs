import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

function command(name, args) {
  try { return execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { return `unavailable: ${error?.message ?? error}`; }
}
const state = JSON.parse(await readFile('RUN_STATE.json', 'utf8'));
console.log(JSON.stringify({
  node: process.version,
  npm: command('npm', ['--version']),
  pnpm: command('pnpm', ['--version']),
  codex: command('codex', ['--version']),
  fixture: command(process.execPath, ['--experimental-strip-types', 'scripts/demo.ts']),
  state: { status: state.status, phase: state.phase, next_action: state.next_action },
}, null, 2));
