# Bot Profiles, Handoff and Permissions

`BotProfile` contains name, project binding, responsibility, input/output schema, skills, tool policy, provider policy, memory policy, approval policy and enabled state.

`HandoffEnvelope` contains `fromBotId`, `toBotId`, objective, input references, output schema, constraints, approval requirement, status, depth and parent handoff id. Handoffs are structured work packets; the UI may render them as a timeline but the runtime does not rely on free-form group chat.

A maximum handoff depth and cycle check are mandatory. A Bot Builder may later generate a draft profile, but registration and permission escalation always require a user approval.
