import type { MetricsSnapshot } from '../types';

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
}

export class MetricsCollector {
  private interfaceCalls = 0;
  private interfaceSuccess = 0;
  private wsReconnects = 0;
  private callbackDelivered = 0;
  private callbackFailed = 0;
  private firstPacketLatencyMs: number[] = [];
  private dispatchLatencyMs: number[] = [];
  private permissionCycleMs: number[] = [];

  recordInterfaceCall(success: boolean): void {
    this.interfaceCalls += 1;
    if (success) {
      this.interfaceSuccess += 1;
    }
  }

  recordWsReconnect(): void {
    this.wsReconnects += 1;
  }

  recordCallbackStats(delivered: number, failed: number): void {
    this.callbackDelivered += delivered;
    this.callbackFailed += failed;
  }

  recordFirstPacketLatency(ms: number): void {
    this.firstPacketLatencyMs.push(ms);
  }

  recordDispatchLatency(ms: number): void {
    this.dispatchLatencyMs.push(ms);
  }

  recordPermissionCycle(ms: number): void {
    this.permissionCycleMs.push(ms);
  }

  snapshot(): MetricsSnapshot {
    return {
      interfaceCalls: this.interfaceCalls,
      interfaceSuccess: this.interfaceSuccess,
      wsReconnects: this.wsReconnects,
      callbackDelivered: this.callbackDelivered,
      callbackFailed: this.callbackFailed,
      firstPacketLatencyMsP95: percentile(this.firstPacketLatencyMs, 95),
      dispatchLatencyMsP95: percentile(this.dispatchLatencyMs, 95),
      permissionCycleMsP95: percentile(this.permissionCycleMs, 95),
    };
  }
}
