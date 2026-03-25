import { SkillServerClient } from "./client/skillServerClient";
import { MessageCacheStore } from "./core/messageCacheStore";
import { MiniappBridge } from "./core/miniappBridge";
import { SessionOrchestrator } from "./core/sessionOrchestrator";
import { StreamConnectionManager, type RealtimeConnection } from "./core/streamConnectionManager";
import type {
  CreateSessionParams,
  CreateNewSessionParams,
  CloseSkillResult,
  ControlSkillWeCodeParams,
  ControlSkillWeCodeResult,
  GetSessionMessageParams,
  HistorySessionsParams,
  OnSessionStatusChangeParams,
  OnSkillWecodeStatusChangeParams,
  PageResult,
  RegenerateAnswerParams,
  RegisterSessionListenerParams,
  RegisterSessionListenerResult,
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
  UnregisterSessionListenerParams,
  UnregisterSessionListenerResult
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

  async createNewSession(params: CreateNewSessionParams): Promise<SkillSession> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.createNewSession(params);
  }

  async closeSkill(): Promise<CloseSkillResult> {
    this.connectionManager.reset();
    this.cacheStore.clear();
    return { status: "success" };
  }

  async stopSkill(params: StopSkillParams): Promise<StopSkillResult> {
    await this.connectionManager.ensureConnected();
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
    await this.connectionManager.ensureConnected();
    return this.orchestrator.regenerateAnswer(params);
  }

  async sendMessageToIM(params: SendMessageToIMParams): Promise<SendMessageToIMResult> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.sendMessageToIM(params);
  }

  async getSessionMessage(
    params: GetSessionMessageParams
  ): Promise<PageResult<SessionMessage>> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.getSessionMessage(params);
  }

  async getHistorySessionsList(
    params: HistorySessionsParams
  ): Promise<PageResult<SkillSession>> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.getHistorySessionsList(params);
  }

  registerSessionListener(params: RegisterSessionListenerParams): RegisterSessionListenerResult {
    this.connectionManager.registerListener(params);
    return { status: "success" };
  }

  unregisterSessionListener(
    params: UnregisterSessionListenerParams
  ): UnregisterSessionListenerResult {
    this.connectionManager.unregisterListener(params);
    return { status: "success" };
  }

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.sendMessage(params);
  }

  async replyPermission(params: ReplyPermissionParams): Promise<ReplyPermissionResult> {
    await this.connectionManager.ensureConnected();
    return this.orchestrator.replyPermission(params);
  }

  async controlSkillWeCode(
    params: ControlSkillWeCodeParams
  ): Promise<ControlSkillWeCodeResult> {
    return this.bridge.control(params.action);
  }
}
