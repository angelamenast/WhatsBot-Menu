import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsController } from './subscriptions.controller';
import { ObtenerEstadoSuscripcionUseCase } from '../../../application/use-cases/obtener-estado-suscripcion.use-case';
import { IniciarRenovacionUseCase } from '../../../application/use-cases/iniciar-renovacion.use-case';
import { ConsultarRenovacionUseCase } from '../../../application/use-cases/consultar-renovacion.use-case';
import {
  PlanVigenteConfirmarError,
  RenovacionNoEncontradaError,
  SinSuscripcionError,
} from '../../../domain/errors/subscriptions.errors';
import type { AuthenticatedRequest } from '../../../../../shared/types/authenticated-request';

const req = { user: { id: 'user-1' } } as unknown as AuthenticatedRequest;

async function respuestaDeError(promesa: Promise<unknown>): Promise<{ tipo: unknown; body: unknown }> {
  const error = await promesa.catch((e: unknown) => e);
  return { tipo: error, body: (error as HttpException).getResponse() };
}

describe('SubscriptionsController — renovación', () => {
  let controller: SubscriptionsController;
  let iniciarRenovacion: jest.Mocked<IniciarRenovacionUseCase>;
  let consultarRenovacion: jest.Mocked<ConsultarRenovacionUseCase>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    iniciarRenovacion = { execute: jest.fn() } as any;
    consultarRenovacion = { execute: jest.fn() } as any;
    configService = { get: jest.fn() } as any;

    controller = new SubscriptionsController(
      {} as ObtenerEstadoSuscripcionUseCase,
      iniciarRenovacion,
      consultarRenovacion,
      configService,
    );
  });

  it('inicia la renovación con el usuario del token y la URL de retorno configurada', async () => {
    configService.get.mockReturnValue('https://front.test/pago');
    const resultado = { referencia: 'ren-1', monto: 50000, moneda: 'COP' as const, paymentUrl: 'https://checkout.wompi.co/l/1' };
    iniciarRenovacion.execute.mockResolvedValue(resultado);

    await expect(controller.iniciarRenovacion(req, { confirmarRenovacionAnticipada: true })).resolves.toEqual(resultado);
    expect(iniciarRenovacion.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarioId: 'user-1',
        confirmarRenovacionAnticipada: true,
        redirectUrl: 'https://front.test/pago',
      }),
    );
  });

  it('sin confirmación explícita la envía como false', async () => {
    iniciarRenovacion.execute.mockResolvedValue({} as any);

    await controller.iniciarRenovacion(req, {});

    expect(iniciarRenovacion.execute).toHaveBeenCalledWith(
      expect.objectContaining({ confirmarRenovacionAnticipada: false }),
    );
  });

  it('traduce SinSuscripcionError a 404 SIN_SUSCRIPCION', async () => {
    iniciarRenovacion.execute.mockRejectedValue(new SinSuscripcionError());

    const { tipo, body } = await respuestaDeError(controller.iniciarRenovacion(req, {}));

    expect(tipo).toBeInstanceOf(NotFoundException);
    expect(body).toMatchObject({ statusCode: 404, codigo: 'SIN_SUSCRIPCION' });
  });

  it('traduce PlanVigenteConfirmarError a 409 con la fecha de vencimiento', async () => {
    const fechaFin = new Date('2026-10-15T15:00:00.000Z');
    iniciarRenovacion.execute.mockRejectedValue(new PlanVigenteConfirmarError(fechaFin));

    const { tipo, body } = await respuestaDeError(controller.iniciarRenovacion(req, {}));

    expect(tipo).toBeInstanceOf(ConflictException);
    expect(body).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Tu plan aún está vigente hasta 2026-10-15. ¿Deseas renovarlo de todas formas?',
      codigo: 'PLAN_VIGENTE_CONFIRMAR',
      fechaFin: '2026-10-15T15:00:00.000Z',
    });
  });

  it('un fallo de Wompi o de la BD responde 400 RENOVACION_FALLIDA sin detalles internos', async () => {
    iniciarRenovacion.execute.mockRejectedValue(new Error('timeout en api.wompi.co'));

    const { tipo, body } = await respuestaDeError(controller.iniciarRenovacion(req, {}));

    expect(tipo).toBeInstanceOf(BadRequestException);
    expect(body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'No pudimos iniciar la renovación. Intenta nuevamente.',
      codigo: 'RENOVACION_FALLIDA',
    });
  });

  it('consulta la renovación y serializa la fecha en ISO', async () => {
    consultarRenovacion.execute.mockResolvedValue({
      referencia: 'ren-1',
      estado: 'APROBADO',
      fechaFin: new Date('2026-11-20T15:00:00.000Z'),
      mensaje: 'Plan renovado correctamente.',
    });

    await expect(controller.consultarRenovacion(req, 'ren-1')).resolves.toEqual({
      referencia: 'ren-1',
      estado: 'APROBADO',
      fechaFin: '2026-11-20T15:00:00.000Z',
      mensaje: 'Plan renovado correctamente.',
    });
  });

  it('traduce RenovacionNoEncontradaError a 404 RENOVACION_NO_ENCONTRADA', async () => {
    consultarRenovacion.execute.mockRejectedValue(new RenovacionNoEncontradaError());

    const { tipo, body } = await respuestaDeError(controller.consultarRenovacion(req, 'ren-x'));

    expect(tipo).toBeInstanceOf(NotFoundException);
    expect(body).toMatchObject({ statusCode: 404, codigo: 'RENOVACION_NO_ENCONTRADA' });
  });
});
