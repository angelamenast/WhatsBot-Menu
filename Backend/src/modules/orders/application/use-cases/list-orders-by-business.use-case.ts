import { Inject, Injectable } from '@nestjs/common';
import type {
  OrderListFilter,
  OrderPage,
  OrderRepository,
} from '../../domain/repositories/order.repository';
import { ORDER_REPOSITORY } from '../../domain/repositories/order.repository';
import { InvalidOrderListFilterError } from '../../domain/errors/order.errors';
import { ListOrdersCommand } from '../dto/list-orders.command';

// America/Bogota es UTC-5 todo el año (Colombia no tiene horario de verano).
const BOGOTA_UTC_OFFSET_HOURS = 5;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Día de calendario real (rechaza 2026-02-30). Devuelve sus componentes o null. */
function parseCalendarDay(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC "corrige" fechas imposibles (30 de febrero → marzo) y mapea los
  // años 0-99 a 19xx: si lo que sale no es lo que entró, la fecha no existe.
  const isReal =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;

  return isReal ? { year, month, day } : null;
}

/** Medianoche de Bogotá del día indicado (más `plusDays`), como instante UTC. */
function bogotaMidnight(
  day: { year: number; month: number; day: number },
  plusDays = 0,
): Date {
  return new Date(
    Date.UTC(
      day.year,
      day.month - 1,
      day.day + plusDays,
      BOGOTA_UTC_OFFSET_HOURS,
    ),
  );
}

@Injectable()
export class ListOrdersByBusinessUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: OrderRepository,
  ) {}

  async execute(command: ListOrdersCommand): Promise<OrderPage> {
    return this.orderRepository.findViewsByBusiness(
      command.businessId,
      this.toFilter(command),
    );
  }

  /**
   * `from` → inicio de ese día (inclusivo). `to` → inicio del día SIGUIENTE
   * (exclusivo), así el día `to` entra completo.
   */
  private toFilter(command: ListOrdersCommand): OrderListFilter {
    const from =
      command.from !== undefined ? parseCalendarDay(command.from) : undefined;
    const to = command.to !== undefined ? parseCalendarDay(command.to) : undefined;

    if (from === null) {
      throw new InvalidOrderListFilterError(
        '"from" debe ser una fecha real con formato YYYY-MM-DD',
      );
    }
    if (to === null) {
      throw new InvalidOrderListFilterError(
        '"to" debe ser una fecha real con formato YYYY-MM-DD',
      );
    }

    const fromDate = from ? bogotaMidnight(from) : undefined;
    const toExclusive = to ? bogotaMidnight(to, 1) : undefined;

    if (from && to && bogotaMidnight(from) > bogotaMidnight(to)) {
      throw new InvalidOrderListFilterError('"from" no puede ser posterior a "to"');
    }

    return {
      from: fromDate,
      to: toExclusive,
      limit: command.limit,
      offset: command.offset,
    };
  }
}
