import type { PermissionTier, ToolPolicy } from '../../core/src/index.ts';

export const permissionLabels: Record<PermissionTier, string> = {
  read_only: '只读',
  workspace_write: '工作区写入',
  full_access: '完全访问',
};

const alwaysApproval = new Set(['external_send', 'important_delete', 'sensitive_path', 'production_change', 'payment', 'publish', 'credential_read']);

export function canUseTool(policy: ToolPolicy, tool: string, action?: string): { allowed: boolean; approvalRequired: boolean; reason?: string } {
  if (!policy.allowedTools.includes(tool)) return { allowed: false, approvalRequired: false, reason: 'tool_not_allowlisted' };
  if (action && alwaysApproval.has(action)) return { allowed: true, approvalRequired: true, reason: 'always_requires_one_off_approval' };
  return { allowed: true, approvalRequired: policy.approvalRequiredActions.includes(action ?? '') };
}
