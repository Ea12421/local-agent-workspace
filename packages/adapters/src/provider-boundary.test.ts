import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexExternalAdapter, DeepSeekApiAdapter, DeepSeekToolLoopProvider, FixtureAdapter } from './index.ts';

test('provider boundary keeps fixture, DeepSeek API, DeepSeek tool loop and Codex execution identities distinct', async () => {
  const fixture = await new FixtureAdapter().probeCapabilities();
  const deepseekApi = await new DeepSeekApiAdapter({ apiKey: 'test-only' }).probeCapabilities();
  const deepseekToolLoop = new DeepSeekToolLoopProvider({ apiKey: 'test-only' });
  const codex = await new CodexExternalAdapter('/definitely/missing/codex').probeCapabilities();

  assert.deepEqual(
    { provider: fixture.identity.provider, billing: fixture.identity.billingSource, isMock: fixture.identity.isMock },
    { provider: 'fixture', billing: 'local', isMock: true },
  );
  assert.deepEqual(
    { provider: deepseekApi.identity.provider, billing: deepseekApi.identity.billingSource, isMock: deepseekApi.identity.isMock },
    { provider: 'deepseek', billing: 'api', isMock: false },
  );
  assert.deepEqual(
    { provider: deepseekToolLoop.identity.provider, billing: deepseekToolLoop.identity.billingSource, isMock: deepseekToolLoop.identity.isMock },
    { provider: 'deepseek', billing: 'api', isMock: false },
  );
  assert.deepEqual(
    { harness: codex.identity.harness, provider: codex.identity.provider, billing: codex.identity.billingSource, isMock: codex.identity.isMock },
    { harness: 'codex-cli', provider: 'openai-codex', billing: 'unknown', isMock: false },
  );
  assert.equal(deepseekApi.toolCalling, false);
  assert.equal(deepseekApi.resume, false);
  assert.equal((codex as any).disabledReason, 'codex CLI unavailable');
  assert.notEqual(fixture.identity.provider, deepseekApi.identity.provider);
  assert.notEqual(deepseekApi.identity.billingSource, codex.identity.billingSource);
});
