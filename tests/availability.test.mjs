import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import * as state from "../extension/state.ts";

async function harness({ enabled = true, localAvailable = true } = {}) {
  const handlers = new Map();
  const commands = new Map();
  const shortcuts = new Map();
  const statuses = new Map();
  const selections = [];
  const local = { provider: "vllm", id: "bubba", contextWindow: 256000 };
  const cloud = { provider: "remote", id: "current", contextWindow: 256000 };
  let models = localAvailable ? [cloud, local] : [cloud];
  const ctx = {
    cwd: "/fixture",
    hasUI: true,
    model: cloud,
    isProjectTrusted: () => false,
    modelRegistry: { getAvailable: () => models },
    getContextUsage: () => ({ tokens: 100 }),
    compact: () => assert.fail("Unexpected compaction"),
    ui: {
      setStatus: (key, value) => statuses.set(key, value),
      notify: () => {},
    },
  };
  const emit = async (name, event = {}) => {
    for (const handler of handlers.get(name) ?? []) await handler(event, ctx);
  };
  const pi = {
    on: (name, handler) =>
      handlers.set(name, [...(handlers.get(name) ?? []), handler]),
    registerCommand: (name, command) => commands.set(name, command),
    registerShortcut: (name, shortcut) => shortcuts.set(name, shortcut),
    getCommands: () => [],
    setModel: async (model) => {
      selections.push(model);
      ctx.model = model;
      await emit("model_select", { model });
      return true;
    },
  };
  const exportsByPath = {
    "./config": {
      resolveConfig: () => ({ enabled, localModel: "vllm/bubba" }),
    },
    "./state": state,
  };
  const context = vm.createContext({});
  const source = readFileSync(
    new URL("../extension/index.ts", import.meta.url),
    "utf8",
  );
  const module = new vm.SourceTextModule(stripTypeScriptTypes(source), {
    context,
  });
  await module.link((path) => {
    const exports = exportsByPath[path];
    assert.ok(exports, `Unexpected dependency: ${path}`);
    return new vm.SyntheticModule(
      Object.keys(exports),
      function () {
        for (const [key, value] of Object.entries(exports))
          this.setExport(key, value);
      },
      { context },
    );
  });
  await module.evaluate();
  module.namespace.default(pi);
  return {
    commands,
    shortcuts,
    statuses,
    selections,
    local,
    cloud,
    ctx,
    emit,
    removeLocal: () => {
      models = [cloud];
    },
  };
}

test("missing local model registers no controls and leaves the current model alone", async () => {
  const h = await harness({ localAvailable: false });
  await h.emit("session_start");
  await h.emit("before_agent_start");
  assert.equal(h.commands.size, 0);
  assert.equal(h.shortcuts.size, 0);
  assert.equal(h.statuses.get("pi-local-cloud"), undefined);
  assert.deepEqual(h.selections, []);
});

test("disabled configuration registers no controls even when the local model exists", async () => {
  const h = await harness({ enabled: false });
  await h.emit("session_start");
  assert.equal(h.commands.size, 0);
  assert.equal(h.shortcuts.size, 0);
  assert.equal(h.statuses.get("pi-local-cloud"), undefined);
});

test("available local model registers controls and restores the actual cloud model", async () => {
  const h = await harness();
  await h.emit("session_start");
  assert.equal(h.commands.size, 1);
  assert.equal(h.shortcuts.size, 1);
  assert.match(h.statuses.get("pi-local-cloud"), /CLOUD/);
  await h.commands.get("local").handler("on", h.ctx);
  assert.equal(h.ctx.model, h.local);
  await h.commands.get("local").handler("off", h.ctx);
  assert.equal(h.ctx.model, h.cloud);
  assert.deepEqual(h.selections, [h.local, h.cloud]);
});

test("a disappearing prerequisite cannot trigger compaction or change models", async () => {
  const h = await harness();
  await h.emit("session_start");
  h.removeLocal();
  await h.emit("before_agent_start");
  await h.commands.get("local").handler("on", h.ctx);
  assert.equal(h.statuses.get("pi-local-cloud"), undefined);
  assert.deepEqual(h.selections, []);
});
