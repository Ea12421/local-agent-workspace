import type { ProjectId, ProviderConnection, ProjectProviderBinding, ProviderConnectionId } from '../../../packages/core/src/types.ts';

export type ProviderResolverErrorCode =
  | 'provider_binding_missing'
  | 'provider_binding_project_mismatch'
  | 'provider_connection_missing'
  | 'provider_connection_disabled'
  | 'provider_fallback_not_allowed';

export class ProviderResolverError extends Error {
  readonly code: ProviderResolverErrorCode;

  constructor(code: ProviderResolverErrorCode, message: string) {
    super(message);
    this.name = 'ProviderResolverError';
    this.code = code;
  }
}

export type ProviderResolverInput = {
  projectId: ProjectId;
  bindings: readonly ProjectProviderBinding[];
  connections: readonly ProviderConnection[];
  requestedConnectionId?: ProviderConnectionId;
  allowFallback?: boolean;
  failureClass?: 'provider_transient' | 'provider_limit' | 'provider_auth' | 'provider_config' | 'tool_transient' | 'unknown';
  /** DeepSeek may be selected before a live probe; execution must still verify the referenced env secret. */
  allowUnverifiedSecretRef?: boolean;
};

export type ResolvedProviderBinding = {
  binding: ProjectProviderBinding;
  connection: ProviderConnection;
  selection: 'primary' | 'fallback';
};

function activeBindings(input: ProviderResolverInput): ProjectProviderBinding[] {
  return input.bindings
    .filter((binding) => String(binding.projectId) === String(input.projectId) && binding.enabled)
    .sort((a, b) => (a.role === 'primary' ? -1 : 1) - (b.role === 'primary' ? -1 : 1) || a.priority - b.priority || a.revision - b.revision || String(a.id).localeCompare(String(b.id)));
}

function resolveConnection(binding: ProjectProviderBinding, connections: readonly ProviderConnection[], allowUnverifiedSecretRef = false, code: ProviderResolverErrorCode = 'provider_connection_missing'): ProviderConnection {
  const connection = connections.find((item) => String(item.id) === String(binding.connectionId));
  if (!connection) throw new ProviderResolverError(code, `Provider connection not found: ${binding.connectionId}`);
  const mayVerifyAtExecution = allowUnverifiedSecretRef && connection.provider === 'deepseek' && connection.secretRef?.kind === 'env' && connection.status === 'unconfigured';
  if (connection.status !== 'available' && !mayVerifyAtExecution) throw new ProviderResolverError('provider_connection_disabled', `Provider connection is ${connection.status}: ${connection.id}`);
  return connection;
}

/** Resolve one project-owned primary/fallback provider without reading secrets. */
export function resolveProviderBinding(input: ProviderResolverInput): ResolvedProviderBinding {
  const bindings = activeBindings(input);
  const requested = input.requestedConnectionId
    ? bindings.find((binding) => String(binding.connectionId) === String(input.requestedConnectionId))
    : undefined;
  if (input.requestedConnectionId && !requested) {
    throw new ProviderResolverError('provider_binding_project_mismatch', 'Requested provider connection is not bound to this project.');
  }
  const primary = requested ?? bindings.find((binding) => binding.role === 'primary');
  if (!primary) throw new ProviderResolverError('provider_binding_missing', `No active provider binding for project ${input.projectId}`);
  try {
    return { binding: primary, connection: resolveConnection(primary, input.connections, input.allowUnverifiedSecretRef), selection: 'primary' };
  } catch (error) {
    const retryableFailure = input.failureClass === 'provider_transient' || input.failureClass === 'provider_limit' || input.failureClass === 'tool_transient';
    if (!input.allowFallback || primary.fallbackPolicy !== 'on_retryable_failure' || !retryableFailure) throw error;
    const fallback = bindings.find((binding) => binding.role === 'fallback' && String(binding.id) !== String(primary.id));
    if (!fallback) throw new ProviderResolverError('provider_fallback_not_allowed', 'Fallback is enabled but no fallback binding exists.');
    return { binding: fallback, connection: resolveConnection(fallback, input.connections, input.allowUnverifiedSecretRef), selection: 'fallback' };
  }
}
