interface WorkerResponse {
  id: string;
  operation: string;
  ok?: boolean;
  hex?: string;
}
export class IncrementalHash {
  private readonly worker = new Worker(new URL('./hash.worker.ts', import.meta.url), {
    type: 'module',
  });
  private readonly pending = new Map<string, (response: WorkerResponse) => void>();
  constructor() {
    this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const key = `${event.data.id}:${event.data.operation}`;
      this.pending.get(key)?.(event.data);
      this.pending.delete(key);
    });
  }
  private request(
    id: string,
    operation: 'update' | 'digest' | 'cancel',
    bytes?: ArrayBuffer,
  ): Promise<WorkerResponse> {
    return new Promise((resolve) => {
      this.pending.set(`${id}:${operation}`, resolve);
      this.worker.postMessage({ id, operation, bytes });
    });
  }
  async update(id: string, bytes: ArrayBuffer): Promise<void> {
    await this.request(id, 'update', bytes);
  }
  async digest(id: string): Promise<string> {
    const response = await this.request(id, 'digest');
    if (!response.hex) throw new Error('Hash worker failed');
    return response.hex;
  }
  async cancel(id: string): Promise<void> {
    await this.request(id, 'cancel');
  }
  close(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}
