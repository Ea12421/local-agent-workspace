import { createApprovalRequestId, createRunEvent, type ApprovalRequest, type ExecutionPlan, type ExecutionPlanStep, type JsonObject, type ProjectId, type BotId, type RunEvent, type ToolPolicy } from '../../../packages/core/src/index.ts';
import { CONTROLLED_COMMAND_PROFILES, isAllowedCommand, type ControlledCommandProfile } from '../../../packages/adapters/src/index.ts';
import { executeLocalFileReadRun, executeLocalGitDiffStatRun, executeLocalGitStatusRun, createControlledCommandRun, executeControlledCommandRun, runtimeStore, type RuntimeScope } from './runtime.ts';
import type { SqliteEntityStore } from './persistence.ts';
import type { ExecutionStepResult } from './orchestrator-runtime.ts';

export type RealOrchestratorToolScope = RuntimeScope & { projectId: ProjectId; botId: BotId };

/**
 * The plan runner supplies the current one-off decision and the live Bot
 * policy explicitly.  No approval is stored as a reusable capability.
 */
export type RealOrchestratorToolOptions = {
  oneOffApprovedStepId?: string;
  entityStore?: Pick<SqliteEntityStore, 'listApprovals' | 'saveApprovalRequest'>;
  toolPolicy?: ToolPolicy;
};

const ORCHESTRATOR_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['command.project.test', 'project.test'],
  ['command.project.build_web', 'project.build_web'],
]);

const activeOrchestratorCommandSteps = new Map<string, Promise<ExecutionStepResult>>();

function successfulToolResult(result: any): ExecutionStepResult {
  if (result.run?.status === 'succeeded') {
    const receiptId = result.receipt?.requestId ? String(result.receipt.requestId) : undefined;
    return {
      status: 'succeeded',
      outputRefs: [`run:${String(result.run.id)}`, ...(receiptId ? [`receipt:${receiptId}`] : [])],
      data: {
        provider: result.run.request?.metadata?.provider ?? 'local-tool-runtime',
        isMock: false,
        subRunId: String(result.run.id),
        ...(receiptId ? { receiptId } : {}),
      },
    };
  }
  return {
    status: 'failed',
    error: String(result.run?.error?.message ?? result.receipt?.errorCode ?? '真实工具执行失败'),
    retryable: Boolean(result.run?.error?.retryable),
    data: { provider: result.run?.request?.metadata?.provider ?? 'local-tool-runtime', isMock: false, subRunId: String(result.run?.id ?? '') },
  };
}

function pathFromRefs(step: ExecutionPlanStep): string {
  const ref = step.inputRefs.find((item) => item.startsWith('path:'));
  return ref ? ref.slice('path:'.length) || 'package.json' : 'package.json';
}

function controlledProfile(commandId: string): ControlledCommandProfile | undefined {
  return CONTROLLED_COMMAND_PROFILES.find((item) => item.id === commandId);
}

function commandPolicyDecision(profile: ControlledCommandProfile, policy?: ToolPolicy): { allowed: true } | { allowed: false; reason: string } {
  if (!policy) return { allowed: false, reason: 'tool_policy_missing' };
  if (policy.permissionTier !== 'read_only') return { allowed: false, reason: 'tool_command_permission_tier_not_allowed' };
  if (!policy.allowedTools.includes('command')) return { allowed: false, reason: 'tool_command_not_allowlisted' };
  if (!isAllowedCommand([...profile.argv], policy).allowed) return { allowed: false, reason: 'tool_command_not_allowlisted' };
  if (!policy.approvalRequiredActions.includes(profile.approvalAction)) return { allowed: false, reason: 'tool_command_approval_policy_missing' };
  return { allowed: true };
}

function childRunKey(plan: ExecutionPlan, step: ExecutionPlanStep): string {
  return `orchestrator-command:${String(plan.id)}:${String(step.id)}`;
}

function approvalForStep(
  approvals: ApprovalRequest[],
  plan: ExecutionPlan,
  step: ExecutionPlanStep,
  childRunId: string,
): ApprovalRequest | undefined {
  return approvals.find((item) => (
    item.metadata?.kind === 'orchestrator_command'
    && String(item.metadata.planId ?? '') === String(plan.id)
    && String(item.metadata.stepId ?? '') === String(step.id)
    && String(item.runId) === childRunId
  ));
}

async function appendApprovalEvent(runId: string, type: Extract<RunEvent['type'], 'approval.requested' | 'approval.resolved'>, approval: ApprovalRequest, plan: ExecutionPlan, step: ExecutionPlanStep): Promise<void> {
  const events = await runtimeStore.listEvents(runId as any);
  if (events.some((event) => event.type === type && String(event.data.approvalId ?? '') === String(approval.id))) return;
  const eventApproval = type === 'approval.requested'
    ? (() => {
      const { resolvedAt: _resolvedAt, resolvedBy: _resolvedBy, decisionReason: _decisionReason, ...pending } = approval;
      return { ...pending, status: 'pending' as const };
    })()
    : approval;
  const event = createRunEvent(runId as any, type, {
    ...eventApproval,
    approvalId: approval.id,
    planId: plan.id,
    stepId: step.id,
    oneOff: true,
    idempotencyKey: `orchestrator-command:${String(plan.id)}:${String(step.id)}:${type}`,
  } as JsonObject, events.length + 1, { type: type === 'approval.resolved' ? 'user' : 'system' });
  await runtimeStore.appendEvent(event);
}

function commandWaiting(step: ExecutionPlanStep, reason = '命令步骤需要匹配的逐次用户批准。'): ExecutionStepResult {
  return {
    status: 'waiting_user',
    reason,
    data: { provider: 'controlled-command', isMock: false, approvalRequired: true, toolId: step.toolId ?? null, stepId: String(step.id) },
  };
}

async function executeControlledOrchestratorStep(step: ExecutionPlanStep, plan: ExecutionPlan, scope: RealOrchestratorToolScope, options: RealOrchestratorToolOptions): Promise<ExecutionStepResult> {
  const runtimeCommandId = ORCHESTRATOR_COMMANDS.get(String(step.toolId));
  if (!runtimeCommandId) return { status: 'failed', error: `当前真实总控尚未接入能力：${step.toolId ?? '未指定能力'}`, retryable: false, data: { isMock: false } };
  const profile = controlledProfile(runtimeCommandId);
  if (!profile) return { status: 'failed', error: `controlled_command_profile_not_found:${runtimeCommandId}`, retryable: false, data: { isMock: false } };
  const policyDecision = commandPolicyDecision(profile, options.toolPolicy);
  if (!policyDecision.allowed) return { status: 'failed', error: policyDecision.reason, retryable: false, data: { provider: 'controlled-command', isMock: false, toolId: step.toolId, policyDenied: true } };
  if (String(options.oneOffApprovedStepId ?? '') !== String(step.id)) return commandWaiting(step);
  if (!options.entityStore) return { status: 'failed', error: 'sqlite_entity_store_unavailable', retryable: false, data: { provider: 'controlled-command', isMock: false } };

  const key = childRunKey(plan, step);
  const existingOperation = activeOrchestratorCommandSteps.get(key);
  if (existingOperation) return existingOperation;
  const operation = (async (): Promise<ExecutionStepResult> => {
    const projectId = scope.projectId;
    const existingRun = (await runtimeStore.listRuns(String(projectId))).find((run) => (
      run.request.metadata?.provider === 'controlled-command'
      && String(run.request.metadata?.idempotencyKey ?? '') === key
    ));
    const child = existingRun ?? (await createControlledCommandRun(step.objective, runtimeCommandId, key, scope)).run;
    const existingApproval = approvalForStep(options.entityStore!.listApprovals(String(projectId)), plan, step, String(child.id));
    const approval = existingApproval ?? (() => {
      const now = new Date().toISOString();
      const created: ApprovalRequest = {
        id: createApprovalRequestId(),
        projectId,
        runId: child.id,
        action: profile.approvalAction,
        description: `${profile.label}：${profile.argv.join(' ')}。仅对计划 ${String(plan.id)} 的步骤 ${String(step.id)} 生效。`,
        permissionTier: 'read_only',
        status: 'approved',
        requestedAt: now,
        resolvedAt: now,
        resolvedBy: 'user',
        decisionReason: '计划步骤逐次批准',
        metadata: {
          kind: 'orchestrator_command',
          planId: String(plan.id),
          stepId: String(step.id),
          childRunId: String(child.id),
          commandId: profile.id,
          argv: [...profile.argv],
          declaredEffects: [...profile.declaredEffects],
          policyVersion: options.toolPolicy?.policyVersion ?? 1,
          oneOff: true,
          idempotencyKey: key,
        },
      };
      options.entityStore!.saveApprovalRequest(created);
      return created;
    })();
    if (approval.status !== 'approved') return commandWaiting(step, '命令步骤仍在等待用户批准。');
    await appendApprovalEvent(String(child.id), 'approval.requested', approval, plan, step);
    await appendApprovalEvent(String(child.id), 'approval.resolved', approval, plan, step);
    const result = await executeControlledCommandRun(String(child.id), approval);
    if (!result) return { status: 'failed', error: 'controlled_command_run_not_found', retryable: false, data: { provider: 'controlled-command', isMock: false } };
    const translated = successfulToolResult(result);
    return {
      ...translated,
      data: { ...(translated.data ?? {}), provider: 'controlled-command', isMock: false, subRunId: String(result.run.id), planId: String(plan.id), stepId: String(step.id), approvalId: String(approval.id), commandId: profile.id, argv: [...profile.argv] },
    };
  })();
  activeOrchestratorCommandSteps.set(key, operation);
  try { return await operation; } finally {
    if (activeOrchestratorCommandSteps.get(key) === operation) activeOrchestratorCommandSteps.delete(key);
  }
}

/** Map only audited capability IDs to existing real runtimes. */
export async function executeRealOrchestratorStep(step: ExecutionPlanStep, plan: ExecutionPlan, scope: RealOrchestratorToolScope, options: RealOrchestratorToolOptions = {}): Promise<ExecutionStepResult> {
  if (ORCHESTRATOR_COMMANDS.has(String(step.toolId))) return executeControlledOrchestratorStep(step, plan, scope, options);
  if (step.toolId === 'filesystem.read') {
    return successfulToolResult(await executeLocalFileReadRun(step.objective, { path: pathFromRefs(step) }, scope));
  }
  if (step.toolId === 'git.status') return successfulToolResult(await executeLocalGitStatusRun(step.objective, scope));
  if (step.toolId === 'git.diff_stat') return successfulToolResult(await executeLocalGitDiffStatRun(step.objective, scope));
  return { status: 'failed', error: `当前真实总控尚未接入能力：${step.toolId ?? '未指定能力'}`, retryable: false, data: { isMock: false } };
}
