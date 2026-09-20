import test from "node:test";
import assert from "node:assert/strict";
import { rememberCloud, syncSelectedModel } from "../extension/state.ts";

test("remember cloud only while in cloud mode", () => {
  const state = { mode: "cloud", cloud: { provider: "openai", id: "gpt" } };
  assert.deepEqual(
    rememberCloud(state, { provider: "anthropic", id: "claude" }).cloud,
    { provider: "anthropic", id: "claude" },
  );
  assert.deepEqual(
    rememberCloud(
      { mode: "local", cloud: state.cloud },
      { provider: "vllm", id: "bubba" },
    ).cloud,
    state.cloud,
  );
});

test("selected model synchronizes mode without losing the previous cloud", () => {
  const cloud = { provider: "anthropic", id: "claude" };
  const local = { provider: "vllm", id: "bubba" };
  assert.deepEqual(syncSelectedModel({ mode: "cloud", cloud }, local, local), {
    mode: "local",
    cloud,
  });
  assert.deepEqual(syncSelectedModel({ mode: "local", cloud }, cloud, local), {
    mode: "cloud",
    cloud,
  });
});
