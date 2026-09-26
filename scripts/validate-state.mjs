import { readFile } from 'node:fs/promises';
const state = JSON.parse(await readFile('RUN_STATE.json', 'utf8'));
const errors = [];
const statuses = new Set(['running', 'complete', 'blocked_user', 'blocked_environment', 'paused', 'failed']);
if (state.schema_version !== '1.1') errors.push('schema_version must be 1.1');
if (!statuses.has(state.status)) errors.push(`invalid status: ${state.status}`);
if (!state.objective || !state.done_definition?.length) errors.push('objective and done_definition are required');
if (!Array.isArray(state.anti_goals) || state.anti_goals.length === 0 || state.anti_goals.length > 8) errors.push('anti_goals must contain 1-8 items');
if (state.status === 'running' && !state.next_action) errors.push('running state requires next_action');
if (state.status !== 'running' && state.status !== 'complete' && !state.blocked_reason) errors.push('blocked/paused/failed state requires blocked_reason');
if (state.status === 'complete' && state.next_action) errors.push('complete state must not have next_action');
if (state.progress?.completed_units > state.progress?.total_units) errors.push('progress exceeds total');
if ((state.recent_corrections ?? []).length > 3) errors.push('recent_corrections exceeds 3');
if (state.retry?.attempt > state.retry?.max_attempts) errors.push('retry attempt exceeds max');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`RUN_STATE valid: ${state.status} / ${state.phase} / ${state.progress.completed_units}/${state.progress.total_units}`);
