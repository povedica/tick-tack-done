export interface DomainBusEvent {
  readonly id: string;
  readonly type: string;
  readonly ownerId: string;
}

/** The outbox is drained here. Webhook delivery is V1 and is not attached. */
export abstract class EventBus {
  start(): void {
    return undefined;
  }

  abstract publish(event: DomainBusEvent): Promise<void>;

  close(): Promise<void> {
    return Promise.resolve();
  }
}
