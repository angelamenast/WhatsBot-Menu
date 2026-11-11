import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { PaymentsController } from './payments.controller';

describe('PaymentsController (checkout del frontend)', () => {
  let controller: PaymentsController;
  const buscarPorUsuario = jest.fn<(...args: any[]) => Promise<any>>();
  const execute = jest.fn<(...args: any[]) => Promise<any>>();
  beforeAll(async () => {
    const modulePath = './payments.controller';
    const { PaymentsController: Controller } = await import(modulePath);
    controller = new Controller({ execute } as any, {} as any, {} as any, {} as any,
      { buscarPorUsuario } as any, new ConfigService({ FRONTEND_URL: 'http://localhost:4321' }));
  });
  beforeEach(() => jest.clearAllMocks());
  it('asocia el checkout al negocio del usuario y vuelve al frontend real', async () => {
    buscarPorUsuario.mockResolvedValue({ id: 'own-business' });
    execute.mockResolvedValue({ paymentUrl: 'https://checkout.wompi.co/l/link', suscripcionId: 'subscription' });
    const result = await controller.generarLink({ user: { id: 'owner' } } as any, { planId: 'plan' });
    expect(buscarPorUsuario).toHaveBeenCalledWith('owner');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ negocioId: 'own-business', planId: 'plan', redirectUrl: 'http://localhost:4321/billing' }));
    expect(result.suscripcionId).toBe('subscription');
  });
  it('rechaza un negocio enviado por otro usuario', async () => {
    buscarPorUsuario.mockResolvedValue({ id: 'own-business' });
    await expect(controller.generarLink({ user: { id: 'owner' } } as any, { planId: 'plan', negocioId: 'foreign-business' })).rejects.toThrow('No tienes un negocio');
    expect(execute).not.toHaveBeenCalled();
  });
});
