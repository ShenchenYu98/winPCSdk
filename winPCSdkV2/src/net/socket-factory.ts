import type { SocketFactory, SocketLike } from '../types';

export function createDefaultSocketFactory(): SocketFactory {
  return (url: string): SocketLike => {
    const WebSocketCtor = (globalThis as unknown as { WebSocket?: new (u: string) => SocketLike }).WebSocket;
    if (!WebSocketCtor) {
      throw new Error('WebSocket is not available in current runtime. Provide socketFactory explicitly.');
    }
    return new WebSocketCtor(url);
  };
}
