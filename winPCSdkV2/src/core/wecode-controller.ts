import type { ControlSkillWeCodeResult, SkillWecodeStatusResult } from '../types';
import type { DispatchStats, ListenerRegistry } from './listener-registry';

export class WeCodeController {
  constructor(private readonly listenerRegistry: ListenerRegistry) {}

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
    return {
      result: { status: 'success' },
      dispatch,
    };
  }
}
