/** One active revision at a time, even when an upstream ignores AbortSignal. */
export class RequestGate {
  private active: { id: string; controller: AbortController } | null = null;
  begin(id: string) {
    this.cancel();
    const controller = new AbortController();
    this.active = { id, controller };
    return controller.signal;
  }
  isCurrent(id: string) {
    return this.active?.id === id && !this.active.controller.signal.aborted;
  }
  finish(id: string) {
    if (this.isCurrent(id)) this.active = null;
  }
  cancel() {
    this.active?.controller.abort();
    this.active = null;
  }
}
