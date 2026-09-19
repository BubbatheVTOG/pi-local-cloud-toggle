import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";

export interface ToggleConfig {
  enabled: boolean;
  localModel: string;
}

export const DEFAULTS: ToggleConfig = {
  enabled: true,
  localModel: "josh/bubba",
};

type Raw = { enabled?: unknown; localModel?: unknown };
const isBool = (value: unknown): value is boolean => typeof value === "boolean";
const isModelRef = (value: unknown): value is string =>
  typeof value === "string" && /^[^/]+\/[^/]+$/.test(value.trim());

function readBlock(path: string): Raw {
  try {
    if (!existsSync(path)) return {};
    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      modelToggle?: Raw;
    };
    return raw.modelToggle ?? {};
  } catch {
    return {};
  }
}

function apply(config: ToggleConfig, raw: Raw): void {
  if (isBool(raw.enabled)) config.enabled = raw.enabled;
  if (isModelRef(raw.localModel)) config.localModel = raw.localModel.trim();
}

export function resolveConfig(input: {
  cwd: string;
  homeDir?: string;
  projectTrusted?: boolean;
}): ToggleConfig {
  const home = input.homeDir ?? homedir();
  const config = { ...DEFAULTS };
  apply(config, readBlock(join(home, ".pi", "agent", "settings.json")));
  if (input.projectTrusted !== false) {
    apply(config, readBlock(join(input.cwd, CONFIG_DIR_NAME, "settings.json")));
  }
  return config;
}
