import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { PermissionTier, ToolPolicy } from '../../core/src/index.ts';

export type SandboxPathFailure = 'absolute_path' | 'path_traversal' | 'outside_workspace' | 'symlink_escape' | 'invalid_path';

export type SandboxPathResult =
  | { ok: true; path: string; relativePath: string }
  | { ok: false; reason: SandboxPathFailure };

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function hasTraversalSegment(value: string): boolean {
  return value.split(/[\\/]/).some((segment) => segment === '..');
}

async function nearestExistingPath(candidate: string): Promise<string> {
  let current = candidate;
  while (true) {
    try {
      await lstat(current);
      return current;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      const parent = path.dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/**
 * Resolves a user-supplied path without allowing it to leave a project root.
 * Existing symlinks are rejected by default; allowing them still requires the
 * resolved target to remain inside the real workspace root.
 */
export async function resolveSandboxPath(
  workspaceRoot: string,
  requested: string,
  options: { allowSymlink?: boolean } = {},
): Promise<SandboxPathResult> {
  if (!requested || requested.includes('\0')) return { ok: false, reason: 'invalid_path' };
  if (isAbsolutePath(requested)) return { ok: false, reason: 'absolute_path' };
  if (hasTraversalSegment(requested)) return { ok: false, reason: 'path_traversal' };

  let root: string;
  try {
    root = await realpath(workspaceRoot);
  } catch {
    return { ok: false, reason: 'outside_workspace' };
  }
  const candidate = path.resolve(root, requested);
  if (!isInside(root, candidate)) return { ok: false, reason: 'outside_workspace' };

  let current = root;
  const segments = path.relative(root, candidate).split(path.sep).filter(Boolean);
  try {
    for (const segment of segments) {
      current = path.join(current, segment);
      const info = await lstat(current).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (info?.isSymbolicLink() && !options.allowSymlink) return { ok: false, reason: 'symlink_escape' };
    }

    const existing = await nearestExistingPath(candidate);
    const resolvedExisting = await realpath(existing);
    if (!isInside(root, resolvedExisting)) return { ok: false, reason: 'symlink_escape' };
    if (existing === candidate) {
      const resolvedCandidate = await realpath(candidate);
      if (!isInside(root, resolvedCandidate)) return { ok: false, reason: 'symlink_escape' };
      if (resolvedCandidate !== candidate && !options.allowSymlink) return { ok: false, reason: 'symlink_escape' };
      return { ok: true, path: resolvedCandidate, relativePath: path.relative(root, resolvedCandidate) };
    }
    return { ok: true, path: candidate, relativePath: path.relative(root, candidate) };
  } catch {
    return { ok: false, reason: 'outside_workspace' };
  }
}

/**
 * Apply the optional project-relative path allowlist after the path has been
 * resolved and symlink-checked. An empty or missing allowlist keeps the
 * existing workspace-wide behaviour; a non-empty list allows an exact path
 * and all descendants below that path.
 */
export function isAllowedWorkspacePath(
  relativePath: string,
  allowedPaths?: string[],
): { allowed: boolean; reason?: 'path_not_allowlisted' } {
  if (!allowedPaths || allowedPaths.length === 0) return { allowed: true };
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
  const candidate = normalize(relativePath);
  const allowed = allowedPaths
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(normalize)
    .some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`));
  return allowed ? { allowed: true } : { allowed: false, reason: 'path_not_allowlisted' };
}

export type SandboxCommandResult =
  | { allowed: true; normalizedArgv: string[] }
  | { allowed: false; reason: 'empty_command' | 'shell_interpreter' | 'shell_metacharacter' | 'command_not_allowlisted' | 'invalid_command' };

const shellInterpreters = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'csh', 'ksh', 'cmd', 'powershell', 'pwsh']);
const shellMeta = /[;&|><$`{}()[\]\r\n]/;

/** Matches an argv vector against exact, tokenized command allowlist entries. */
export function isAllowedCommand(argv: string[], policy: Pick<ToolPolicy, 'allowedCommands'>): SandboxCommandResult {
  if (!argv.length) return { allowed: false, reason: 'empty_command' };
  if (argv.some((value) => typeof value !== 'string' || value.length === 0 || value.includes('\0'))) return { allowed: false, reason: 'invalid_command' };
  const normalizedArgv = [...argv];
  const executable = normalizedArgv[0];
  if (shellInterpreters.has(executable) || normalizedArgv.some((value) => value === '-c' || value === '--command')) return { allowed: false, reason: 'shell_interpreter' };
  if (normalizedArgv.some((value) => shellMeta.test(value))) return { allowed: false, reason: 'shell_metacharacter' };
  const allowlist = policy.allowedCommands ?? [];
  const allowed = allowlist.some((entry) => entry.trim().split(/\s+/).join('\u0000') === normalizedArgv.join('\u0000'));
  return allowed ? { allowed: true, normalizedArgv } : { allowed: false, reason: 'command_not_allowlisted' };
}

export function canUseSandboxOperation(
  policy: ToolPolicy,
  operation: 'read' | 'write' | 'shell',
): { allowed: boolean; reason?: 'tool_not_allowlisted' | 'permission_tier_read_only' } {
  const tool = operation === 'shell' ? 'shell' : 'filesystem';
  if (!policy.allowedTools.includes(tool)) return { allowed: false, reason: 'tool_not_allowlisted' };
  if (operation === 'write' && policy.permissionTier === ('read_only' satisfies PermissionTier)) return { allowed: false, reason: 'permission_tier_read_only' };
  return { allowed: true };
}
