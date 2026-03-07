import type { ControlSkillWeCodeResult, SkillWecodeStatusResult } from '../types';
import type { DispatchStats, ListenerRegistry } from './listener-registry';

const WECODE_BROADCAST_CHANNEL = 'skill-winpc-sdk-wecode-status-v1';

interface WecodeBroadcastPayload {
  scope: 'skill-winpc-sdk-wecode-status';
  clientId: string;
  status: SkillWecodeStatusResult;
}

function createClientId(): string {
  return `wecode-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBroadcastStatus(raw: unknown): SkillWecodeStatusResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const payload = raw as Partial<WecodeBroadcastPayload>;
  if (payload.scope !== 'skill-winpc-sdk-wecode-status') {
    return null;
  }

  const status = payload.status;
  if (!status || (status.status !== 'closed' && status.status !== 'minimized')) {
    return null;
  }

  return {
    status: status.status,
    timestamp: Number(status.timestamp ?? Date.now()),
    message: status.message === undefined ? undefined : String(status.message),
  };
}

export class WeCodeController {
  private readonly clientId = createClientId();
  private readonly channel: BroadcastChannel | null;

  constructor(private readonly listenerRegistry: ListenerRegistry) {
    this.channel = this.createChannel();
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        const payload = event.data as Partial<WecodeBroadcastPayload>;
        if (payload?.clientId === this.clientId) {
          return;
        }

        const status = normalizeBroadcastStatus(event.data);
        if (!status) {
          return;
        }

        this.listenerRegistry.emitWecodeStatus(status);
      };
    }
  }

  dispose(): void {
    if (!this.channel) {
      return;
    }
    this.channel.onmessage = null;
    this.channel.close();
  }

  trigger(action: 'close' | 'minimize'): {
    result: ControlSkillWeCodeResult;
    dispatch: DispatchStats;
  } {
    const status: SkillWecodeStatusResult = {
      status: action === 'close' ? 'closed' : 'minimized',
      timestamp: Date.now(),
      message: `Skill WeCode ${action}`,
    };

    const dispatch = this.listenerRegistry.emitWecodeStatus(status);
    this.broadcast(status);

    return {
      result: { status: 'success' },
      dispatch,
    };
  }

  private createChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      return null;
    }

    try {
      return new BroadcastChannel(WECODE_BROADCAST_CHANNEL);
    } catch {
      return null;
    }
  }

  private broadcast(status: SkillWecodeStatusResult): void {
    if (!this.channel) {
      return;
    }

    try {
      this.channel.postMessage({
        scope: 'skill-winpc-sdk-wecode-status',
        clientId: this.clientId,
        status,
      } satisfies WecodeBroadcastPayload);
    } catch {
      // Ignore cross-context broadcast failures; local listeners already received the event.
    }
  }
}
