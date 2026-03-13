import { createSdkError } from "../errors";
import type {
  ControlSkillWeCodeResult,
  SkillWecodeStatus,
  SkillWecodeStatusResult,
  SkillWeCodeAction
} from "../types";

export class MiniappBridge {
  private readonly callbacks = new Set<(result: SkillWecodeStatusResult) => void>();

  onStatusChange(callback: (result: SkillWecodeStatusResult) => void): void {
    if (typeof callback !== "function") {
      throw createSdkError(1000, "无效的参数: callback");
    }

    this.callbacks.add(callback);
  }

  async control(action: SkillWeCodeAction): Promise<ControlSkillWeCodeResult> {
    const status: SkillWecodeStatus = action === "close" ? "closed" : "minimized";
    const payload: SkillWecodeStatusResult = {
      status,
      timestamp: Date.now(),
      message: action === "close" ? "小程序已关闭" : "小程序已最小化"
    };

    for (const callback of this.callbacks) {
      callback(payload);
    }

    return { status: "success" };
  }
}
