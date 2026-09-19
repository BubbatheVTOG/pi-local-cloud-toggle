import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { resolveConfig, type ToggleConfig } from "./config";
import { modelRef, type ModelRef, type Mode } from "./state";

function findModel(
  ctx: ExtensionContext,
  ref: ModelRef,
): Model<any> | undefined {
  return ctx.modelRegistry
    .getAvailable()
    .find((model) => model.provider === ref.provider && model.id === ref.id);
}

function parseModelRef(value: string): ModelRef {
  const slash = value.indexOf("/");
  return { provider: value.slice(0, slash), id: value.slice(slash + 1) };
}

function sameModel(left: ModelRef | undefined, right: ModelRef): boolean {
  return left?.provider === right.provider && left.id === right.id;
}

export default function localCloudToggle(pi: ExtensionAPI) {
  let mode: Mode = "cloud";
  let cloud: ModelRef | undefined;
  let startupCloud: ModelRef | undefined;
  let sessionStarted = false;
  let controlsRegistered = false;

  const configFor = (ctx: ExtensionContext) =>
    resolveConfig({ cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() });

  const publishStatus = (ctx: ExtensionContext, config: ToggleConfig) => {
    const localModel = findModel(ctx, parseModelRef(config.localModel));
    if (!config.enabled || !localModel) {
      ctx.ui.setStatus("pi-local-cloud", undefined);
      return;
    }
    const label = mode === "local" ? "LOCAL" : "CLOUD";
    const color =
      !config.enabled || mode === "cloud"
        ? "\u001b[38;2;139;149;167m"
        : "\u001b[38;2;114;214;160m";
    ctx.ui.setStatus("pi-local-cloud", `${color}${label}\u001b[39m`);
  };

  const compactBeforeLocal = async (
    ctx: ExtensionContext,
    local: Model<any>,
  ): Promise<boolean> => {
    const tokenCount = ctx.getContextUsage()?.tokens ?? 0;
    if (tokenCount <= local.contextWindow) return true;

    const hasVcc = pi
      .getCommands()
      .some((command) => command.name === "pi-vcc");
    const message = hasVcc
      ? `The current context is ${tokenCount.toLocaleString()} tokens, above the local model limit of ${local.contextWindow.toLocaleString()}. Compact before switching to LOCAL?`
      : `The current context is ${tokenCount.toLocaleString()} tokens, above the local model limit of ${local.contextWindow.toLocaleString()}. pi-vcc is not installed, so Pi must compact this conversation on the CLOUD model before switching. Continue?`;

    if (
      !ctx.hasUI ||
      !(await ctx.ui.confirm("Local model context warning", message))
    ) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      ctx.compact({
        customInstructions:
          "Preserve the active work, decisions, files, tests, and unresolved risks before switching to the local model.",
        onComplete: () => resolve(true),
        onError: (error) => {
          ctx.ui.notify(
            `local: compaction failed; staying on CLOUD (${error.message})`,
            "error",
          );
          resolve(false);
        },
      });
    });
  };

  const switchLocal = async (
    ctx: ExtensionContext,
    config: ToggleConfig,
  ): Promise<void> => {
    const localRef = parseModelRef(config.localModel);
    const local = findModel(ctx, localRef);
    if (!local) {
      ctx.ui.notify(
        `local: configured model ${config.localModel} is not available in Pi's model list`,
        "error",
      );
      return;
    }
    // Capture the model that is actually active now. Startup model selection
    // can happen after session_start, so the initial snapshot may be stale.
    if (
      ctx.model &&
      (ctx.model.provider !== local.provider || ctx.model.id !== local.id)
    ) {
      cloud = modelRef(ctx.model);
    }
    if (!(await compactBeforeLocal(ctx, local))) return;
    // Pi emits model_select synchronously/asynchronously during setModel().
    // Mark the transition before changing models so that the local model is
    // never mistaken for the cloud model we need to restore later.
    mode = "local";
    if (!(await pi.setModel(local))) {
      mode = "cloud";
      ctx.ui.notify(
        `local: Pi could not select ${config.localModel}; check its provider authentication`,
        "error",
      );
      return;
    }
    publishStatus(ctx, config);
    ctx.ui.notify(`model mode: LOCAL (${config.localModel})`, "info");
  };

  const switchCloud = async (
    ctx: ExtensionContext,
    config: ToggleConfig,
  ): Promise<void> => {
    if (!cloud) {
      ctx.ui.notify("local: no previous cloud model is available", "error");
      return;
    }
    const model = findModel(ctx, cloud);
    if (!model || !(await pi.setModel(model))) {
      ctx.ui.notify(
        `local: previous cloud model ${cloud.provider}/${cloud.id} is unavailable`,
        "error",
      );
      return;
    }
    mode = "cloud";
    publishStatus(ctx, config);
    ctx.ui.notify(`model mode: CLOUD (${cloud.provider}/${cloud.id})`, "info");
  };

  const toggle = async (ctx: ExtensionContext): Promise<void> => {
    const config = configFor(ctx);
    if (!config.enabled) {
      publishStatus(ctx, config);
      ctx.ui.notify(
        "local: model toggle is disabled in configuration",
        "warning",
      );
      return;
    }
    if (mode === "cloud") await switchLocal(ctx, config);
    else await switchCloud(ctx, config);
  };

  pi.on("session_start", (_event, ctx) => {
    const config = configFor(ctx);
    const localRef = parseModelRef(config.localModel);
    const active = ctx.model ? modelRef(ctx.model) : startupCloud;
    const activeIsLocal = sameModel(active, localRef);

    if (activeIsLocal) {
      mode = "local";
      cloud = startupCloud && !sameModel(startupCloud, localRef)
        ? startupCloud
        : undefined;
    } else {
      mode = "cloud";
      cloud = active;
    }
    startupCloud = undefined;
    sessionStarted = true;
    if (
      config.enabled &&
      findModel(ctx, localRef) &&
      !controlsRegistered
    ) {
      registerControls();
      controlsRegistered = true;
    }
    publishStatus(ctx, config);
  });

  pi.on("model_select", (event, ctx) => {
    const selected = modelRef(event.model);
    const config = configFor(ctx);
    const selectedIsLocal = sameModel(selected, parseModelRef(config.localModel));

    if (!sessionStarted) {
      startupCloud = selected;
    } else if (selectedIsLocal) {
      mode = "local";
    } else {
      mode = "cloud";
      cloud = selected;
    }
    publishStatus(ctx, config);
  });

  pi.on("before_agent_start", (_event, ctx) => {
    publishStatus(ctx, configFor(ctx));
  });

  function registerControls(): void {
    pi.registerCommand("local", {
      description:
        "Toggle between an existing local model and the previous cloud model",
      handler: async (args, ctx) => {
        const config = configFor(ctx);
        const subcommand = (args || "toggle").trim().toLowerCase();
        if (subcommand === "status") {
          publishStatus(ctx, config);
          ctx.ui.notify(
            `model mode: ${mode.toUpperCase()}${cloud ? `; cloud=${cloud.provider}/${cloud.id}` : ""}; local=${config.localModel}`,
            "info",
          );
          return;
        }
        if (
          subcommand === "on" ||
          (subcommand === "toggle" && mode === "cloud")
        ) {
          if (!config.enabled) {
            ctx.ui.notify(
              "local: model toggle is disabled in configuration",
              "warning",
            );
            return;
          }
          await switchLocal(ctx, config);
          return;
        }
        if (subcommand === "off" || subcommand === "toggle") {
          await switchCloud(ctx, config);
          return;
        }
        ctx.ui.notify("local: use /local on|off|status|toggle", "warning");
      },
    });

    pi.registerShortcut("ctrl+shift+l", {
      description: "Toggle local/cloud model",
      handler: toggle,
    });
  }
}
