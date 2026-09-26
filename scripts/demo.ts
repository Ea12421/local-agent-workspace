import { readFile } from 'node:fs/promises';
import { runProductBuilder } from '../packages/workflow/src/index.ts';

const fixture = JSON.parse(await readFile(new URL('../fixtures/demo-project.json', import.meta.url), 'utf8')) as any;
const workflow = runProductBuilder({ projectId: fixture.project.id as any, runId: fixture.run.id, idea: fixture.run.goal, user: '独立开发者' });
console.log('Fixture demo ready');
console.log(`Project: ${fixture.project.name}`);
console.log(`Bots: ${fixture.bots.map((bot: any) => bot.name).join(' / ')}`);
console.log(`Run: ${fixture.run.id} (${fixture.run.status})`);
console.log(`Handoffs: ${workflow.handoffs.length}; approval: ${workflow.approval.status}`);
console.log(`Artifacts: ${workflow.artifacts.map((artifact) => artifact.name).join(' / ')}`);
