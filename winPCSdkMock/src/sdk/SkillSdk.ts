import { SkillServerClient } from "./client/skillServerClient";
import { MessageCacheStore } from "./core/messageCacheStore";
import { MiniappBridge } from "./core/miniappBridge";
import { SessionOrchestrator } from "./core/sessionOrchestrator";
import { StreamConnectionManager, type RealtimeConnection } from "./core/streamConnectionManager";
import type {
  CreateSessionParams,
  CloseSkillResult,
  ControlSkillWeCodeParams,
  ControlSkillWeCodeResult,
  GetSessionMessageParams,
  OnSessionStatusChangeParams,
  OnSkillWecodeStatusChangeParams,
  PageResult,
  RegenerateAnswerParams,
  RegisterSessionListenerParams,
  ReplyPermissionParams,
  ReplyPermissionResult,
  SendMessageParams,
  SendMessageResult,
  SendMessageToIMParams,
  SendMessageToIMResult,
  SessionMessage,
  SkillSdkApi,
  SkillSession,
  StopSkillParams,
  StopSkillResult,
  UnregisterSessionListenerParams
} from "./types";

export interface SkillSdkOptions {
  baseUrl: string;
  connectionFactory: () => RealtimeConnection;
}

export class SkillSdk implements SkillSdkApi {
  private readonly cacheStore = new MessageCacheStore();
  private readonly client: SkillServerClient;
  private readonly orchestrator: SessionOrchestrator;
  private readonly bridge = new MiniappBridge();
  private readonly connectionManager: StreamConnectionManager;

  constructor(options: SkillSdkOptions) {
    this.client = new SkillServerClient(options.baseUrl);
    this.orchestrator = new SessionOrchestrator(this.client, this.cacheStore);
    this.connectionManager = new StreamConnectionManager(options.connectionFactory, (message) =>
      this.cacheStore.applyStream(message)
    );
  }

  async createSession(params: CreateSessionParams): Promise<SkillSession> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.createSession(params);
  }

  async closeSkill(): Promise<CloseSkillResult> {
    this.connectionManager.close();
    return { status: "success" };
  }

  async stopSkill(params: StopSkillParams): Promise<StopSkillResult> {
    const result = await this.client.abortSession(params.welinkSessionId);
    this.connectionManager.emitStatus(params.welinkSessionId, { status: "stopped" });
    return result;
  }

  onSessionStatusChange(params: OnSessionStatusChangeParams): void {
    this.connectionManager.registerStatusCallback(params.welinkSessionId, params.callback);
  }

  onSkillWecodeStatusChange(params: OnSkillWecodeStatusChangeParams): void {
    this.bridge.onStatusChange(params.callback);
  }

  async regenerateAnswer(params: RegenerateAnswerParams): Promise<SendMessageResult> {
    return this.orchestrator.regenerateAnswer(params);
  }

  async sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult> {
    return this.orchestrator.sendMessageToIM(params);
  }

  async getSessionMessage(
    params: GetSessionMessageParams
  ): Promise<PageResult<SessionMessage>> {
    return this.orchestrator.getSessionMessage(params);
  }

  registerSessionListener(params: RegisterSessionListenerParams): void {
    this.connectionManager.registerListener(params);
  }

  unregisterSessionListener(params: UnregisterSessionListenerParams): void {
    this.connectionManager.unregisterListener(params);
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.sendMessage(params);
  }

  async replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult> {
    return this.orchestrator.replyPermission(params);
  }

  async controlSkillWeCode(
    params: ControlSkillWeCodeParams
  ): Promise<ControlSkillWeCodeResult> {
    return this.bridge.control(params.action);
  }
}
