import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const statePath = path.resolve('RUN_STATE.json');
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const state = JSON.parse(await readFile(statePath, 'utf8'));
const phase = valueAfter('--phase');
const next = valueAfter('--next');
const evidence = valueAfter('--evidence');
const completed = valueAfter('--completed');
const status = valueAfter('--status');
if (phase) state.phase = phase;
if (next !== undefined) state.next_action = next;
if (evidence) state.last_evidence = evidence;
if (completed !== undefined) state.progress.completed_units = Number(completed);
if (status) state.status = status;
state.updated_at = new Date().toISOString();
const tempPath = `${statePath}.tmp-${process.pid}`;
await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
await rename(tempPath, statePath);
console.log(`checkpoint written: ${state.status} / ${state.phase}`);
console.log(`next_action: ${state.next_action}`);
