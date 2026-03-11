import { createSdkError } from "../errors";
import type { StreamMessage } from "../types";

export function normalizeStreamMessage(payload: unknown): StreamMessage {
  let candidate: unknown;

  try {
    candidate = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch {
    throw createSdkError(5000, "内部错误: 非法的流式消息负载");
  }

  if (!candidate || typeof candidate !== "object") {
    throw createSdkError(5000, "内部错误: 非法的流式消息负载");
  }

  const record = candidate as Record<string, unknown>;

  return {
    ...record,
    type: String(record.type ?? "unknown"),
    seq: Number(record.seq ?? 0),
    welinkSessionId: Number(record.welinkSessionId),
    emittedAt: String(record.emittedAt ?? new Date().toISOString()),
    raw: record.raw && typeof record.raw === "object" ? (record.raw as Record<string, unknown>) : record
  } as StreamMessage;
}
