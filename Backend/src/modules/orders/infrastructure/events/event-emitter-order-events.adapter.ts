import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ORDER_STATUS_CHANGED_EVENT,
  OrderStatusChangedEvent,
} from '../../../../shared/events/order-status-changed.event';
import { OrderEventsPort } from '../../application/ports/out/order-events.port';

@Injectable()
export class EventEmitterOrderEventsAdapter implements OrderEventsPort {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  publishStatusChanged(event: OrderStatusChangedEvent): void {
    // emit y no emitAsync: no se espera a los listeners.
    this.eventEmitter.emit(ORDER_STATUS_CHANGED_EVENT, event);
  }
}
