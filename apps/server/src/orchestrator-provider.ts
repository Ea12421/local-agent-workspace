import type { JsonObject, JsonValue, PlannerCapabilityCatalog, PlannerOutput } from '../../../packages/core/src/index.ts';
import { ORCHESTRATOR_PLAN_OUTPUT_SCHEMA } from '../../../packages/core/src/index.ts';
import { executeCodexRun, runtimeStore, type CodexExecutionOptions, type RuntimeScope } from './runtime.ts';

export type RealPlannerRequest = {
  objective: string;
  catalog: PlannerCapabilityCatalog;
  maxSteps: number;
  scope: RuntimeScope;
  cwd: string;
  model?: string;
  adapterFactory?: CodexExecutionOptions['adapterFactory'];
};

export type RealPlannerResult = {
  provider: 'openai-codex';
  run: Awaited<ReturnType<typeof executeCodexRun>>['run'];
  output?: PlannerOutput;
  events: Awaited<ReturnType<typeof runtimeStore.listEvents>>;
};

/**
 * Ask the real Codex execution bridge for a plan-shaped JSON object. The
 * result is still untrusted until the route runs the domain Planner validator
 * against the current project's capability catalog.
 */
export async function executeCodexPlanner(request: RealPlannerRequest): Promise<RealPlannerResult> {
  // The first real execution slice only has audited ToolRuntime executors.
  // Skills and Bots remain valid domain metadata, but are not offered as
  // executable planner choices until their dispatch runtimes are implemented.
  const executableCatalog = { capabilities: request.catalog.capabilities.filter((capability) => capability.kind === 'tool') };
  const plannerPrompt = [
    '为本地 Agent Workspace 生成一个有限的执行计划。',
    '只从 Input JSON 的 capabilityCatalog 中选择能力，不要发明新的 Skill、Tool、Bot、权限或路径。',
    '当前真实执行器只支持 kind=tool 的能力；不要把 skill 或 bot 作为可执行步骤。',
    `最多 ${request.maxSteps} 个步骤；依赖必须无环；不确定时输出 clarification 且 steps 必须为空。`,
    '只返回符合 Output schema 的一个 JSON 对象，不要 Markdown、解释文字或多个 JSON。',
    `用户目标：${request.objective}`,
  ].join('\n');
  const result = await executeCodexRun(
    plannerPrompt,
    {
      userGoal: request.objective,
      capabilityCatalog: executableCatalog,
      maxSteps: request.maxSteps,
      schemaVersion: 'orchestrator.plan.v1',
    } as JsonValue,
    {
      model: request.model,
      cwd: request.cwd,
      outputMode: 'structured',
      outputSchema: ORCHESTRATOR_PLAN_OUTPUT_SCHEMA,
      ...(request.adapterFactory ? { adapterFactory: request.adapterFactory } : {}),
    },
    request.scope,
  );
  const events = await runtimeStore.listEvents(result.run.id);
  const modelEvent = [...events].reverse().find((event) => event.type === 'provider.event' && (event.data as any)?.phase === 'model.response');
  const candidate = (modelEvent?.data as any)?.envelope?.structuredOutput;
  return {
    provider: 'openai-codex',
    run: result.run,
    ...(result.run.status === 'succeeded' && candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? { output: candidate as PlannerOutput } : {}),
    events,
  };
}

export function plannerFailureData(result: RealPlannerResult): JsonObject {
  return {
    provider: result.provider,
    providerRunId: String(result.run.id),
    runStatus: result.run.status,
    isMock: false,
    eventCount: result.events.length,
    ...(result.run.error ? { errorCode: result.run.error.code, errorMessage: result.run.error.message } : {}),
  };
}
