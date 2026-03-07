import type { SocketFactory, SocketLike } from '../../src/types';

export class FakeSocket implements SocketLike {
  public readyState = 0;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onerror: ((event: { message?: string }) => void) | null = null;
  public onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  public sent: string[] = [];

  constructor(public readonly url: string) {
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  emitError(message: string): void {
    this.onerror?.({ message });
  }
}

export class FakeSocketHub {
  private readonly sockets: FakeSocket[] = [];

  createFactory(): SocketFactory {
    return (url: string) => {
      const socket = new FakeSocket(url);
      this.sockets.push(socket);
      return socket;
    };
  }

  latest(): FakeSocket {
    const socket = this.sockets.at(-1);
    if (!socket) {
      throw new Error('No socket created');
    }
    return socket;
  }

  bySession(sessionId: string): FakeSocket[] {
    const needle = encodeURIComponent(sessionId);
    return this.sockets.filter((socket) => socket.url.includes(`sessionId=${needle}`));
  }

  count(): number {
    return this.sockets.length;
  }
}
