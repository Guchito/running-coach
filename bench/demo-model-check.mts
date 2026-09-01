// Self-check: the demo may only ever land on a free model.
//
//   NODE_OPTIONS=--no-warnings node bench/demo-model-check.mts
import assert from "node:assert/strict";
import { demoModel, COACH_MODEL, COACH_MODELS } from "../lib/coachDefs.ts";

const free = COACH_MODELS.filter((m) => m.provider === "nvidia").map((m) => m.id);
const paid = COACH_MODELS.filter((m) => m.provider === "anthropic").map((m) => m.id);

assert.ok(free.length >= 2, "demo needs at least two free models to switch between");
for (const id of free) assert.equal(demoModel(id), id, `free model ${id} should pass through`);
for (const id of paid) assert.equal(demoModel(id), COACH_MODEL, `paid model ${id} must not stick`);
for (const junk of [undefined, null, "", "z-ai/glm-5.2", 42, { id: free[0] }])
  assert.equal(demoModel(junk), COACH_MODEL, `junk ${JSON.stringify(junk)} must fall back`);
assert.equal(COACH_MODELS.find((m) => m.id === COACH_MODEL)?.provider, "nvidia", "default must be free");

console.log(`ok — demo limited to ${free.length} free models, default ${COACH_MODEL}`);
