import type { ConnectionPolicy } from './types';

export const DEFAULT_CONNECTION_POLICY: ConnectionPolicy = {
  maxRetryCount: 5,
  backoffInitialMs: 1000,
  backoffMaxMs: 5000,
  heartbeatIntervalMs: 15000,
  disconnectThresholdMs: 30000,
};

const ENV_OVERRIDES: Record<'dev' | 'test' | 'prod', Partial<ConnectionPolicy>> = {
  dev: {
    heartbeatIntervalMs: 10000,
  },
  test: {
    maxRetryCount: 2,
    backoffInitialMs: 200,
    backoffMaxMs: 1000,
    heartbeatIntervalMs: 1000,
    disconnectThresholdMs: 3000,
  },
  prod: {},
};

export function resolveConnectionPolicy(
  env: 'dev' | 'test' | 'prod' = 'prod',
  override: Partial<ConnectionPolicy> | undefined,
): ConnectionPolicy {
  return {
    ...DEFAULT_CONNECTION_POLICY,
    ...ENV_OVERRIDES[env],
    ...override,
  };
}

export const DEFAULT_PAGE = 0;
export const DEFAULT_SIZE = 50;
export const DEFAULT_LISTENER_CIRCUIT_BREAKER_THRESHOLD = 5;
