import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type {
  ProviderAdapter, ProviderCapabilities, ProviderIdentity, RunEvent, RunHandle, RunRequest, RunId,
} from '../../core/src/index.ts';
import { buildModelRequestEnvelope, renderModelRequestEnvelope, renderProviderRequestContent } from './provider-request.ts';
import { normalizeDeepSeekChatResponse } from './provider-envelope.ts';

function identity(partial: Partial<ProviderIdentity> & Pick<ProviderIdentity, 'harness' | 'provider' | 'model'>): ProviderIdentity {
  return {
    authMode: 'unknown', billingSource: 'unknown', isMock: false, ...partial,
  };
}

function event(handle: RunHandle, data: Record<string, any>): RunEvent {
  return {
    id: `provider-event-${randomUUID()}` as RunEvent['id'],
    runId: (data.runId ?? `external-${handle.id}`) as RunEvent['runId'],
    sequence: Number(data.sequence ?? 1),
    type: 'provider.event',
    occurredAt: new Date().toISOString(),
    actor: { type: 'provider', provider: handle.provider.provider },
    data: data as any,
  };
}

export type DeepSeekConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

export type CodexSandbox = 'read-only' | 'workspace-write';

export type CodexExternalAdapterConfig = {
  cwd?: string;
  sandbox?: CodexSandbox;
  model?: string;
  timeoutMs?: number;
  ignoreUserConfig?: boolean;
  env?: NodeJS.ProcessEnv;
};

/** Raw model channel. It intentionally does not own Run state or tools. */
export class DeepSeekApiAdapter implements ProviderAdapter {
  private readonly config: Required<Pick<DeepSeekConfig, 'baseUrl' | 'model'>> & DeepSeekConfig;
  private readonly requests = new Map<string, RunRequest>();

  constructor(config: DeepSeekConfig = {}) {
    // Runtime callers commonly pass optional environment values explicitly;
    // keep the documented defaults when those values are undefined.
    this.config = { ...config, baseUrl: config.baseUrl ?? 'https://api.deepseek.com', model: config.model ?? 'deepseek-chat' };
  }

  async probeCapabilities(): Promise<ProviderCapabilities> {
    return {
      // The current adapter makes one non-streaming chat/completions request.
      // Preserve the provider fields in the receipt, but do not claim that a
      // generic tool loop is implemented until the control-plane bridge exists.
      streaming: false,
      toolCalling: false,
      structuredOutput: true,
      structuredOutputModes: ['json_object'],
      promptCaching: 'unknown',
      cancellation: false,
      resume: false,
      reasoningContentPassthrough: true,
      identity: identity({ harness: 'deepseek-http', provider: 'deepseek', model: this.config.model, authMode: 'api_key', billingSource: 'api' }),
    };
  }

  async startRun(request: RunRequest): Promise<RunHandle> {
    const handle = { id: randomUUID(), provider: (await this.probeCapabilities()).identity };
    this.requests.set(handle.id, request);
    return handle;
  }

  async *streamEvents(handle: RunHandle): AsyncIterable<RunEvent> {
    const request = this.requests.get(handle.id);
    if (!request) throw new Error(`Unknown DeepSeek handle ${handle.id}`);
    if (!this.config.apiKey) throw new Error('DeepSeek API key is not configured');
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const envelope = buildModelRequestEnvelope({
      requestId: handle.id,
      runId: (String(request.metadata?.runId ?? handle.id) as RunId),
      request,
    });
    const providerMessages = envelope.context
      ? [
          envelope.messages[0],
          { role: 'user' as const, content: renderProviderRequestContent(envelope) },
        ]
      : [{ role: 'user' as const, content: renderProviderRequestContent(envelope) }];
    const response = await fetchImpl(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: providerMessages,
        response_format: request.outputSchema ? { type: 'json_object' } : undefined,
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek request failed (${response.status})`);
    let payload: any;
    try {
      payload = await response.json() as any;
    } catch (error) {
      throw new Error(`DeepSeek response JSON invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    const normalized = normalizeDeepSeekChatResponse({
      requestId: handle.id,
      provider: handle.provider.provider === 'deepseek' ? handle.provider : (await this.probeCapabilities()).identity,
      payload,
    });
    // Keep the legacy top-level fields for diagnostics while also exposing the
    // provider-neutral envelope used by future controlled tool-loop consumers.
    yield event(handle, {
      phase: 'model.response',
      model: payload.model ?? this.config.model,
      content: payload.choices?.[0]?.message?.content ?? null,
      reasoning_content: payload.choices?.[0]?.message?.reasoning_content ?? null,
      tool_calls: payload.choices?.[0]?.message?.tool_calls ?? [],
      usage: payload.usage ?? null,
      providerSpecificFieldsPreserved: true,
      envelope: normalized,
    });
  }

  async cancel(_handle: RunHandle): Promise<void> { /* one-shot HTTP request: caller records cancellation */ }
  async resume(_handle: RunHandle): Promise<void> { throw new Error('DeepSeek one-shot adapter does not support resume'); }
}

/** Fixture provider for a fully inspectable no-key demonstration. */
export class FixtureAdapter implements ProviderAdapter {
  async probeCapabilities(): Promise<ProviderCapabilities> {
    return {
      streaming: true, toolCalling: false, structuredOutput: true, cancellation: true, resume: true,
      identity: identity({ harness: 'fixture', provider: 'fixture', model: 'deterministic-demo', authMode: 'local', billingSource: 'local', isMock: true }),
    };
  }
  async startRun(_request: RunRequest): Promise<RunHandle> {
    return { id: randomUUID(), provider: (await this.probeCapabilities()).identity };
  }
  async *streamEvents(handle: RunHandle): AsyncIterable<RunEvent> {
    yield event(handle, { phase: 'fixture', message: 'deterministic demo event', isMock: true });
  }
  async cancel(_handle: RunHandle): Promise<void> {}
  async resume(_handle: RunHandle): Promise<void> {}
}

/**
 * Official local Codex CLI/SDK bridge probe. This is an execution-agent path,
 * not a raw model provider and never reads credential files.
 */
export class CodexExternalAdapter implements ProviderAdapter {
  private readonly binary: string;
  private readonly config: Required<Pick<CodexExternalAdapterConfig, 'cwd' | 'sandbox' | 'timeoutMs' | 'ignoreUserConfig'>> & CodexExternalAdapterConfig;
  private readonly requests = new Map<string, RunRequest>();
  private readonly processes = new Map<string, ChildProcess>();

  constructor(binary = process.env.CODEX_BIN ?? 'codex', config: CodexExternalAdapterConfig = {}) {
    this.binary = binary;
    this.config = {
      cwd: process.cwd(),
      sandbox: 'read-only',
      timeoutMs: 120_000,
      ignoreUserConfig: true,
      ...config,
    };
  }

  private command(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(this.binary, args, {
        cwd: this.config.cwd,
        env: { ...process.env, ...this.config.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), this.config.timeoutMs);
      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
      child.once('error', (error) => {
        clearTimeout(timer);
        resolve({ code: null, stdout, stderr: `${stderr}${error.message}` });
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  }

  async probeCapabilities(): Promise<ProviderCapabilities> {
    const version = await this.command(['--version']);
    const available = version.code === 0;
    const login = available ? await this.command(['login', 'status']) : { code: null, stdout: '', stderr: '' };
    const loginText = `${login.stdout}\n${login.stderr}`;
    const chatGptLogin = /logged in using chatgpt/i.test(loginText);
    return {
      streaming: true, toolCalling: true, structuredOutput: true, cancellation: true, resume: false,
      identity: identity({
        harness: 'codex-cli',
        provider: 'openai-codex',
        model: this.config.model ?? 'codex-managed-session',
        authMode: chatGptLogin ? 'subscription' : 'cli',
        billingSource: 'unknown',
        isMock: false,
      }),
      ...(available ? {
        probe: {
          version: version.stdout.trim() || version.stderr.trim() || 'available',
          loginStatus: login.code === 0 ? (chatGptLogin ? 'chatgpt_login_detected' : 'available_unclassified') : 'unavailable',
          billingSource: 'unknown',
        },
      } : { disabledReason: 'codex CLI unavailable' } as any),
    } as ProviderCapabilities;
  }
  async startRun(request: RunRequest): Promise<RunHandle> {
    const capabilities = await this.probeCapabilities();
    if ((capabilities as any).disabledReason) throw new Error((capabilities as any).disabledReason);
    const handle = { id: randomUUID(), provider: capabilities.identity };
    this.requests.set(handle.id, request);
    return handle;
  }
  async *streamEvents(handle: RunHandle): AsyncIterable<RunEvent> {
    const request = this.requests.get(handle.id);
    if (!request) throw new Error(`Unknown Codex handle ${handle.id}`);
    const args = [
      'exec', '--skip-git-repo-check', '--cd', this.config.cwd,
      '--sandbox', this.config.sandbox, '--ephemeral', '--json',
    ];
    if (this.config.ignoreUserConfig) args.push('--ignore-user-config');
    if (this.config.model) args.push('--model', this.config.model);
    args.push(this.promptFor(request));
    const child = spawn(this.binary, args, {
      cwd: this.config.cwd,
      env: { ...process.env, ...this.config.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.processes.set(handle.id, child);
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
    const close = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('error', () => resolve({ code: null, signal: null }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), this.config.timeoutMs);
    try {
      if (!child.stdout) throw new Error('Codex CLI stdout is unavailable');
      const lines = createInterface({ input: child.stdout });
      for await (const line of lines) {
        if (!line.trim()) continue;
        try {
          yield event(handle, { bridge: 'codex-cli', stream: JSON.parse(line) });
        } catch {
          yield event(handle, { bridge: 'codex-cli', stream: { raw: line } });
        }
      }
      const result = await close;
      if (result.code !== 0) {
        yield event(handle, {
          bridge: 'codex-cli', status: 'failed', exitCode: result.code,
          signal: result.signal, stderr: stderr.slice(-4_000), retryable: result.signal !== null,
        });
      } else {
        yield event(handle, { bridge: 'codex-cli', status: 'completed', exitCode: 0 });
      }
    } finally {
      clearTimeout(timer);
      this.processes.delete(handle.id);
    }
  }
  async cancel(handle: RunHandle): Promise<void> {
    this.processes.get(handle.id)?.kill('SIGTERM');
  }
  async resume(_handle: RunHandle): Promise<void> {
    throw new Error('Codex CLI resume is not wired into this adapter yet; restart with the saved RunRequest.');
  }

  private promptFor(request: RunRequest): string {
    const envelope = buildModelRequestEnvelope({
      requestId: `codex-${randomUUID()}`,
      runId: (String(request.metadata?.runId ?? 'external-codex-run') as RunId),
      request,
    });
    return renderModelRequestEnvelope(envelope);
  }
}
