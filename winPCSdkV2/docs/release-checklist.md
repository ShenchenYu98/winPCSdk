# Release Checklist

## Contract

- [ ] 13 APIs exposed by `SkillClient`
- [ ] `SkillSession.id` is `string`
- [ ] `userId` is `string`
- [ ] `StreamMessage.sessionId` required
- [ ] `closeSkill()` has no arguments

## Runtime

- [ ] Connection policy defaults applied
- [ ] Env overrides verified (`dev/test/prod`)
- [ ] Listener isolation and circuit break threshold validated
- [ ] Message merge and dedupe behavior validated
- [ ] stop/delete compatibility path validated

## Tests

- [ ] Unit matrix passes (>=65)
- [ ] Integration matrix passes (>=21)
- [ ] L7 fixture run passes

## Metrics

- [ ] API success rate
- [ ] First packet latency P95
- [ ] Callback loss rate
- [ ] Permission cycle latency P95
- [ ] dispatchLatencyMs P95
