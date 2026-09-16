import type { Model } from "@earendil-works/pi-ai";

export type Mode = "local" | "cloud";
export interface ModelRef {
  provider: string;
  id: string;
}
export interface ToggleState {
  mode: Mode;
  cloud?: ModelRef;
}
export function rememberCloud(
  state: ToggleState,
  model: ModelRef,
): ToggleState {
  return state.mode === "cloud" ? { ...state, cloud: model } : state;
}
export function modelRef(model: Model<any>): ModelRef {
  return { provider: model.provider, id: model.id };
}
