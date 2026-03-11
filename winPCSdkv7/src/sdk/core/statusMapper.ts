import type { SessionStatus, StreamMessage } from "../types";

const EXECUTING_TYPES = new Set([
  "step.start",
  "text.delta",
  "thinking.delta",
  "tool.update",
  "question",
  "permission.ask",
  "file"
]);

const COMPLETED_TYPES = new Set(["step.done", "text.done", "thinking.done"]);
const STOPPED_TYPES = new Set(["session.error", "error", "agent.offline"]);

export function mapSessionStatus(message: StreamMessage): SessionStatus | null {
  if (EXECUTING_TYPES.has(message.type)) {
    return "executing";
  }

  if (COMPLETED_TYPES.has(message.type)) {
    return "completed";
  }

  if (STOPPED_TYPES.has(message.type)) {
    return "stopped";
  }

  if (message.type === "session.status") {
    if (message.sessionStatus === "busy" || message.sessionStatus === "retry") {
      return "executing";
    }

    if (message.sessionStatus === "idle") {
      return "completed";
    }
  }

  if (message.type === "permission.reply") {
    if (message.response === "reject") {
      return "stopped";
    }

    if (message.response === "once" || message.response === "always") {
      return "executing";
    }
  }

  return null;
}
