import { SkillSdkError } from './errors.js';
import type { MiniProgramHostAdapter, SkillWeCodeAction } from './types.js';

export class MiniProgramController {
  private readonly hostAdapter?: MiniProgramHostAdapter;
  private readonly onStatus: (status: 'closed' | 'minimized') => void;

  constructor(hostAdapter: MiniProgramHostAdapter | undefined, onStatus: (status: 'closed' | 'minimized') => void) {
    this.hostAdapter = hostAdapter;
    this.onStatus = onStatus;
  }

  registerLifecycleListeners(): void {
    if (!this.hostAdapter) {
      return;
    }

    try {
      this.hostAdapter.onClosed?.(() => {
        this.onStatus('closed');
      });
      this.hostAdapter.onMinimized?.(() => {
        this.onStatus('minimized');
      });
    } catch (error) {
      throw new SkillSdkError('WECODE_STATUS_LISTEN_FAILED', 'Failed to register mini program listeners', {
        cause: error
      });
    }
  }

  async control(action: SkillWeCodeAction): Promise<void> {
    if (!this.hostAdapter) {
      return;
    }

    if (action === 'close') {
      try {
        await this.hostAdapter.close();
      } catch (error) {
        throw new SkillSdkError('WECODE_CLOSE_FAILED', 'Failed to close mini program', { cause: error });
      }
      this.onStatus('closed');
      return;
    }

    try {
      await this.hostAdapter.minimize();
    } catch (error) {
      throw new SkillSdkError('WECODE_MINIMIZE_FAILED', 'Failed to minimize mini program', { cause: error });
    }
    this.onStatus('minimized');
  }
}
