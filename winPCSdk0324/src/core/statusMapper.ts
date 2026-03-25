import type { SessionStatus, StreamMessage } from "../types";

export function mapSessionStatus(message: StreamMessage): SessionStatus | null {
  if (message.type === "session.status") {
    if (message.sessionStatus === "busy" || message.sessionStatus === "retry") {
      return "executing";
    }

    if (message.sessionStatus === "idle") {
      return "completed";
    }
  }

  return null;
}
