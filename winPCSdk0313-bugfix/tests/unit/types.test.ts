import { describe, expectTypeOf, it } from "vitest";

import type {
  CreateSessionParams,
  GetSessionMessageParams,
  PageResult,
  ReplyPermissionParams,
  RegisterSessionListenerParams,
  RegisterSessionListenerResult,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  SessionMessage,
  SessionMessagePart,
  SkillSession,
  SkillSdkApi,
  StopSkillParams,
  StreamMessage,
  UnregisterSessionListenerParams,
  UnregisterSessionListenerResult
} from "../../src/types";

describe("SDK type structures", () => {
  it("uses string identifiers for sessions and messages", () => {
    expectTypeOf<SkillSession["welinkSessionId"]>().toEqualTypeOf<string>();
    expectTypeOf<SessionMessage["id"]>().toEqualTypeOf<string>();
    expectTypeOf<SessionMessage["welinkSessionId"]>().toEqualTypeOf<string>();
    expectTypeOf<RegisterSessionListenerParams["welinkSessionId"]>().toEqualTypeOf<string>();
    expectTypeOf<UnregisterSessionListenerParams>().toEqualTypeOf<{ welinkSessionId: string }>();
  });

  it("keeps create and query params aligned with optional and nullable V5 fields", () => {
    expectTypeOf<CreateSessionParams["ak"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CreateSessionParams["imGroupId"]>().toEqualTypeOf<string>();
    expectTypeOf<GetSessionMessageParams["page"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<StopSkillParams["welinkSessionId"]>().toEqualTypeOf<string>();
    expectTypeOf<ReplyPermissionParams["permId"]>().toEqualTypeOf<string>();
  });

  it("exposes V5 sendMessageToIM params and result shapes", () => {
    expectTypeOf<SendMessageToIMParams["messageId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SendMessageToIMParams["chatId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SendMessageToIMResult>().toEqualTypeOf<{ success: boolean }>();
  });

  it("keeps sendMessage request and response fields aligned with protocol objects", () => {
    expectTypeOf<SendMessageParams["toolCallId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SendMessageResult["id"]>().toEqualTypeOf<string>();
    expectTypeOf<SendMessageResult["seq"]>().toEqualTypeOf<number | null>();
    expectTypeOf<SendMessageResult["contentType"]>().toEqualTypeOf<string | null>();
  });

  it("uses service-aligned page result fields", () => {
    expectTypeOf<PageResult<SessionMessage>["page"]>().toEqualTypeOf<number>();
    expectTypeOf<PageResult<SessionMessage>["total"]>().toEqualTypeOf<number>();
    expectTypeOf<PageResult<SessionMessage>["totalPages"]>().toEqualTypeOf<number>();
  });

  it("keeps session listener api result shapes stable", () => {
    expectTypeOf<RegisterSessionListenerResult["status"]>().toEqualTypeOf<"success">();
    expectTypeOf<UnregisterSessionListenerResult["status"]>().toEqualTypeOf<"success">();
    expectTypeOf<RegisterSessionListenerParams["onMessage"]>().parameters.toEqualTypeOf<
      [StreamMessage]
    >();
  });

  it("keeps session message parts aligned with protocol field names", () => {
    expectTypeOf<SessionMessagePart["status"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<SessionMessagePart["input"]>().toEqualTypeOf<
      Record<string, unknown> | null | undefined
    >();
    expectTypeOf<SessionMessagePart["output"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<SessionMessagePart["error"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<SessionMessagePart["title"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<SessionMessagePart["metadata"]>().toEqualTypeOf<
      Record<string, unknown> | null | undefined
    >();
  });

  it("keeps stream messages aligned with websocket payload structure", () => {
    expectTypeOf<StreamMessage["seq"]>().toEqualTypeOf<number | null>();
    expectTypeOf<StreamMessage["emittedAt"]>().toEqualTypeOf<string | null>();
    expectTypeOf<StreamMessage["messageId"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<StreamMessage["sourceMessageId"]>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<StreamMessage["sessionStatus"]>().toEqualTypeOf<
      "busy" | "idle" | "retry" | null | undefined
    >();
    expectTypeOf<StreamMessage["parts"]>().toEqualTypeOf<SessionMessagePart[] | null | undefined>();
  });

  it("exposes all required public sdk methods", () => {
    expectTypeOf<SkillSdkApi["createSession"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["closeSkill"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["stopSkill"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["onSessionStatusChange"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["onSkillWecodeStatusChange"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["regenerateAnswer"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["sendMessageToIM"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["getSessionMessage"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["registerSessionListener"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["unregisterSessionListener"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["sendMessage"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["replyPermission"]>().toBeFunction();
    expectTypeOf<SkillSdkApi["controlSkillWeCode"]>().toBeFunction();
  });
});
