import { execFileSync } from 'node:child_process';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

function command(name, args) {
  try { return execFileSync(name, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { return `unavailable: ${error?.message ?? error}`; }
}
const state = JSON.parse(await readFile('RUN_STATE.json', 'utf8'));
const codexHome = process.env.CODEX_HOME ?? path.join(homedir(), '.codex');
const codexStateDb = path.join(codexHome, 'state_5.sqlite');
let stateDbExists = false;
try { await stat(codexStateDb); stateDbExists = true; } catch { /* metadata probe only */ }
const codexStateDbWritable = stateDbExists ? await access(codexStateDb, 2).then(() => true).catch(() => false) : false;
const codexHomeWritable = await access(codexHome, 2).then(() => true).catch(() => false);
console.log(JSON.stringify({
  node: process.version,
  npm: command('npm', ['--version']),
  pnpm: command('pnpm', ['--version']),
  codex: command('codex', ['--version']),
  codexEnvironment: {
    status: stateDbExists && !codexStateDbWritable && !codexHomeWritable ? 'blocked_environment' : 'unknown_or_available',
    stateDb: codexStateDb,
    stateDbExists,
    stateDbWritable: codexStateDbWritable,
    homeWritable: codexHomeWritable,
    metadataOnly: true,
  },
  fixture: command(process.execPath, ['--experimental-strip-types', 'scripts/demo.ts']),
  state: { status: state.status, phase: state.phase, next_action: state.next_action },
}, null, 2));
