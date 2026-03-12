import { describe, expectTypeOf, it } from "vitest";

import type {
  RegisterSessionListenerParams,
  RegisterSessionListenerResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  SessionMessage,
  SessionMessagePart,
  SkillSdkApi,
  StreamMessage,
  UnregisterSessionListenerParams,
  UnregisterSessionListenerResult
} from "../../src/types";

describe("SDK type structures", () => {
  it("supports both numeric and string session message ids", () => {
    expectTypeOf<SessionMessage["id"]>().toEqualTypeOf<number | string>();
  });

  it("exposes sendMessageToIM params with string messageId and optional chatId", () => {
    expectTypeOf<SendMessageToIMParams["messageId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SendMessageToIMParams["chatId"]>().toEqualTypeOf<string | undefined>();
  });

  it("keeps sendMessageToIM result compatible with status-based response", () => {
    expectTypeOf<SendMessageToIMResult["status"]>().toEqualTypeOf<"success" | "failed">();
    expectTypeOf<SendMessageToIMResult["chatId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SendMessageToIMResult["contentLength"]>().toEqualTypeOf<number | undefined>();
  });

  it("keeps session listener api aligned with V4 result and unregister shapes", () => {
    expectTypeOf<RegisterSessionListenerResult["status"]>().toEqualTypeOf<"success">();
    expectTypeOf<UnregisterSessionListenerResult["status"]>().toEqualTypeOf<"success">();
    expectTypeOf<RegisterSessionListenerParams["welinkSessionId"]>().toEqualTypeOf<number>();
    expectTypeOf<RegisterSessionListenerParams["onMessage"]>().parameters.toEqualTypeOf<
      [StreamMessage]
    >();
    expectTypeOf<UnregisterSessionListenerParams>().toEqualTypeOf<{ welinkSessionId: number }>();
    expectTypeOf<Parameters<SkillSdkApi["registerSessionListener"]>[0]>().toEqualTypeOf<
      RegisterSessionListenerParams
    >();
    expectTypeOf<ReturnType<SkillSdkApi["registerSessionListener"]>>().toEqualTypeOf<
      RegisterSessionListenerResult
    >();
    expectTypeOf<Parameters<SkillSdkApi["unregisterSessionListener"]>[0]>().toEqualTypeOf<
      UnregisterSessionListenerParams
    >();
    expectTypeOf<ReturnType<SkillSdkApi["unregisterSessionListener"]>>().toEqualTypeOf<
      UnregisterSessionListenerResult
    >();
  });

  it("keeps session message parts aligned with SDK aggregation fields", () => {
    expectTypeOf<SessionMessagePart["toolStatus"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SessionMessagePart["toolInput"]>().toEqualTypeOf<
      Record<string, unknown> | undefined
    >();
    expectTypeOf<SessionMessagePart["toolOutput"]>().toEqualTypeOf<string | undefined>();
  });

  it("keeps stream messages aligned with websocket payload structure", () => {
    expectTypeOf<StreamMessage["messageId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<StreamMessage["messageSeq"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<StreamMessage["parts"]>().toEqualTypeOf<SessionMessagePart[] | undefined>();
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
