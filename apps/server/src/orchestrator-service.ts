import type { BotProfile, Skill } from '../../../packages/core/src/types.ts';
import type { PlannerCapability, PlannerCapabilityCatalog } from '../../../packages/core/src/planner.ts';

/** Build the planner allowlist from the current project's Bot and enabled Skills. */
export function buildPlannerCapabilityCatalog(bot: BotProfile, skills: Skill[]): PlannerCapabilityCatalog {
  const capabilities: PlannerCapability[] = [];
  const enabledSkills = new Set(skills.filter((skill) => skill.enabled).map((skill) => String(skill.id)));
  for (const skillId of bot.skillIds) {
    if (enabledSkills.has(String(skillId))) capabilities.push({ kind: 'skill', id: String(skillId), readOnly: true });
  }
  const allowedTools = new Set(bot.toolPolicy.allowedTools.map((tool) => String(tool)));
  const filesystemAllowed = allowedTools.has('filesystem') || allowedTools.has('filesystem.read') || allowedTools.has('filesystem.write');
  if (filesystemAllowed) capabilities.push({ kind: 'tool', id: 'filesystem.read', label: '读取项目文件', readOnly: true });
  if (filesystemAllowed && bot.toolPolicy.permissionTier !== 'read_only' && (allowedTools.has('filesystem') || allowedTools.has('filesystem.write'))) {
    capabilities.push({ kind: 'tool', id: 'filesystem.write', label: '写入项目文件', readOnly: false, approvalRequired: true });
  }
  const shellAllowed = allowedTools.has('shell') || allowedTools.has('git');
  const allowedCommands = new Set((bot.toolPolicy.allowedCommands ?? []).map((command) => String(command)));
  if (shellAllowed && allowedCommands.has('git status --short')) capabilities.push({ kind: 'tool', id: 'git.status', label: '查看 Git 状态', readOnly: true });
  if (shellAllowed && allowedCommands.has('git diff --stat')) capabilities.push({ kind: 'tool', id: 'git.diff_stat', label: '查看 Git 差异摘要', readOnly: true });
  if (allowedTools.has('command')) {
    capabilities.push({ kind: 'tool', id: 'command.project.test', label: '运行项目测试', readOnly: false, approvalRequired: true });
    capabilities.push({ kind: 'tool', id: 'command.project.build_web', label: '构建 Web', readOnly: false, approvalRequired: true });
  }
  return { capabilities };
}
