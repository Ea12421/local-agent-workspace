import test from 'node:test';
import assert from 'node:assert/strict';
import { ProviderResolverError, resolveProviderBinding } from './provider-resolver.ts';

const connection = (id: string, status: 'available' | 'blocked' | 'unconfigured' = 'available') => ({
  id: id as any,
  label: id,
  provider: 'deepseek' as const,
  harness: 'deepseek-api' as const,
  authMode: 'api_key' as const,
  billingSource: 'api' as const,
  status,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
});

const binding = (id: string, connectionId: string, role: 'primary' | 'fallback', fallbackPolicy: 'never' | 'on_retryable_failure' = 'never') => ({
  id: id as any,
  projectId: 'project-a' as any,
  connectionId: connectionId as any,
  model: 'deepseek-chat',
  role,
  priority: role === 'primary' ? 0 : 1,
  enabled: true,
  fallbackPolicy,
  revision: 1,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
});

test('provider resolver keeps project ownership and primary selection explicit', () => {
  const resolved = resolveProviderBinding({ projectId: 'project-a' as any, bindings: [binding('primary', 'deepseek-a', 'primary')], connections: [connection('deepseek-a')] });
  assert.equal(resolved.selection, 'primary');
  assert.equal(resolved.connection.id, 'deepseek-a');

  assert.throws(
    () => resolveProviderBinding({ projectId: 'project-b' as any, bindings: [binding('primary', 'deepseek-a', 'primary')], connections: [connection('deepseek-a')] }),
    (error: unknown) => error instanceof ProviderResolverError && error.code === 'provider_binding_missing',
  );
});

test('provider resolver only uses an explicit retryable fallback', () => {
  const resolved = resolveProviderBinding({
    projectId: 'project-a' as any,
    bindings: [binding('primary', 'blocked', 'primary', 'on_retryable_failure'), binding('fallback', 'deepseek-b', 'fallback')],
    connections: [connection('blocked', 'blocked'), connection('deepseek-b')],
    allowFallback: true,
    failureClass: 'provider_transient',
  });
  assert.equal(resolved.selection, 'fallback');
  assert.equal(resolved.connection.id, 'deepseek-b');

  assert.throws(
    () => resolveProviderBinding({ projectId: 'project-a' as any, bindings: [binding('primary', 'blocked', 'primary', 'on_retryable_failure')], connections: [connection('blocked', 'blocked')], allowFallback: true, failureClass: 'provider_auth' }),
    (error: unknown) => error instanceof ProviderResolverError && error.code === 'provider_connection_disabled',
  );
});

test('provider resolver can defer DeepSeek env verification to the execution boundary', () => {
  const deferred = { ...connection('deepseek-unverified', 'unconfigured'), secretRef: { kind: 'env' as const, name: 'DEEPSEEK_API_KEY' } };
  const resolved = resolveProviderBinding({
    projectId: 'project-a' as any,
    bindings: [binding('primary', 'deepseek-unverified', 'primary')],
    connections: [deferred],
    allowUnverifiedSecretRef: true,
  });
  assert.equal(resolved.selection, 'primary');
  assert.equal(resolved.connection.status, 'unconfigured');
  assert.throws(
    () => resolveProviderBinding({ projectId: 'project-a' as any, bindings: [binding('primary', 'deepseek-unverified', 'primary')], connections: [deferred] }),
    (error: unknown) => error instanceof ProviderResolverError && error.code === 'provider_connection_disabled',
  );
});
