import { Injectable } from '@nestjs/common';
import type { DomainBusEvent } from './event-bus';

type Handler = (event: DomainBusEvent) => Promise<void>;

/** One published event is handed to every consumer. Modules do not call each other. */
@Injectable()
export class EventRouter {
  private readonly handlers: Handler[] = [];

  subscribe(handler: Handler): void {
    this.handlers.push(handler);
  }

  async dispatch(event: DomainBusEvent): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}
