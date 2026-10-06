import type {
  ApprovalRequestId,
  ArtifactId,
  BotId,
  HandoffId,
  MemoryItemId,
  ProjectId,
  RunEventId,
  RunId,
  SkillId,
  SourceId,
} from "./types.ts";

let sequence = 0;

/** Generates opaque ids without coupling the domain to Node's crypto module. */
export function createOpaqueId(prefix: string): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return `${prefix}_${cryptoApi.randomUUID()}`;
  sequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}

export const createProjectId = (): ProjectId => createOpaqueId("project") as ProjectId;
export const createBotId = (): BotId => createOpaqueId("bot") as BotId;
export const createSkillId = (): SkillId => createOpaqueId("skill") as SkillId;
export const createRunId = (): RunId => createOpaqueId("run") as RunId;
export const createRunEventId = (): RunEventId => createOpaqueId("event") as RunEventId;
export const createHandoffId = (): HandoffId => createOpaqueId("handoff") as HandoffId;
export const createApprovalRequestId = (): ApprovalRequestId => createOpaqueId("approval") as ApprovalRequestId;
export const createArtifactId = (): ArtifactId => createOpaqueId("artifact") as ArtifactId;
export const createSourceId = (): SourceId => createOpaqueId("source") as SourceId;
export const createMemoryItemId = (): MemoryItemId => createOpaqueId("memory") as MemoryItemId;
