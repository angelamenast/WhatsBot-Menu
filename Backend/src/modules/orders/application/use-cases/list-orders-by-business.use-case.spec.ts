import { ListOrdersByBusinessUseCase } from './list-orders-by-business.use-case';
import {
  OrderPage,
  OrderRepository,
} from '../../domain/repositories/order.repository';
import { InvalidOrderListFilterError } from '../../domain/errors/order.errors';

describe('ListOrdersByBusinessUseCase', () => {
  let orderRepository: jest.Mocked<OrderRepository>;
  let useCase: ListOrdersByBusinessUseCase;

  const emptyPage: OrderPage = { items: [], total: 0 };

  const base = { businessId: 'business-1', limit: 20, offset: 0 };

  beforeEach(() => {
    orderRepository = {
      findById: jest.fn(),
      findViewById: jest.fn(),
      findViewsByBusiness: jest.fn().mockResolvedValue(emptyPage),
      insert: jest.fn(),
      updateStatus: jest.fn(),
    };

    useCase = new ListOrdersByBusinessUseCase(orderRepository);
  });

  const filterSentToRepository = () =>
    orderRepository.findViewsByBusiness.mock.calls[0][1];

  it('devuelve la página del repositorio tal cual', async () => {
    const page: OrderPage = { items: [], total: 42 };
    orderRepository.findViewsByBusiness.mockResolvedValue(page);

    const result = await useCase.execute(base);

    expect(result).toBe(page);
  });

  it('sin filtros de fecha: pasa from y to undefined, con limit y offset', async () => {
    await useCase.execute({ ...base, limit: 50, offset: 100 });

    expect(orderRepository.findViewsByBusiness).toHaveBeenCalledWith(
      'business-1',
      { from: undefined, to: undefined, limit: 50, offset: 100 },
    );
  });

  describe('conversión de fechas (America/Bogota, UTC-5 fijo)', () => {
    it('from=2026-10-10 → inicio de ese día en Bogotá: 2026-10-10T05:00:00.000Z', async () => {
      await useCase.execute({ ...base, from: '2026-10-10' });

      expect(filterSentToRepository().from?.toISOString()).toBe(
        '2026-10-10T05:00:00.000Z',
      );
      expect(filterSentToRepository().to).toBeUndefined();
    });

    it('to=2026-10-10 → exclusivo, inicio del día siguiente: 2026-10-11T05:00:00.000Z', async () => {
      await useCase.execute({ ...base, to: '2026-10-10' });

      expect(filterSentToRepository().to?.toISOString()).toBe(
        '2026-10-11T05:00:00.000Z',
      );
      expect(filterSentToRepository().from).toBeUndefined();
    });

    it('un mismo día en from y to (from == to) es válido y cubre el día completo', async () => {
      await useCase.execute({ ...base, from: '2026-10-10', to: '2026-10-10' });

      expect(filterSentToRepository().from?.toISOString()).toBe(
        '2026-10-10T05:00:00.000Z',
      );
      expect(filterSentToRepository().to?.toISOString()).toBe(
        '2026-10-11T05:00:00.000Z',
      );
    });

    it('to al final de mes y de año rueda correctamente al día siguiente', async () => {
      await useCase.execute({ ...base, to: '2026-12-31' });

      expect(filterSentToRepository().to?.toISOString()).toBe(
        '2027-01-01T05:00:00.000Z',
      );
    });
  });

  describe('validación de fechas', () => {
    it('2028-02-29 (año bisiesto) es válida', async () => {
      await useCase.execute({ ...base, from: '2028-02-29' });

      expect(filterSentToRepository().from?.toISOString()).toBe(
        '2028-02-29T05:00:00.000Z',
      );
    });

    it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31'])(
      'from=%s no existe en el calendario: lanza InvalidOrderListFilterError sin consultar',
      async (from) => {
        await expect(useCase.execute({ ...base, from })).rejects.toThrow(
          InvalidOrderListFilterError,
        );

        expect(orderRepository.findViewsByBusiness).not.toHaveBeenCalled();
      },
    );

    it('to inexistente: lanza InvalidOrderListFilterError', async () => {
      await expect(
        useCase.execute({ ...base, to: '2026-02-30' }),
      ).rejects.toThrow(InvalidOrderListFilterError);
    });

    it('formato incorrecto que llegue al caso de uso: lanza InvalidOrderListFilterError', async () => {
      await expect(
        useCase.execute({ ...base, from: '10/10/2026' }),
      ).rejects.toThrow(InvalidOrderListFilterError);
    });

    it('from posterior a to: lanza InvalidOrderListFilterError', async () => {
      await expect(
        useCase.execute({ ...base, from: '2026-10-11', to: '2026-10-10' }),
      ).rejects.toThrow(InvalidOrderListFilterError);

      expect(orderRepository.findViewsByBusiness).not.toHaveBeenCalled();
    });
  });

  it('un error del repositorio se propaga', async () => {
    const dbError = new Error('db caída');
    orderRepository.findViewsByBusiness.mockRejectedValue(dbError);

    await expect(useCase.execute(base)).rejects.toBe(dbError);
  });
});
