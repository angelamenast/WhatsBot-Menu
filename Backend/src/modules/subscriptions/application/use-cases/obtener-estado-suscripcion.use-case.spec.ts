import { jest } from '@jest/globals';
import { ObtenerEstadoSuscripcionUseCase } from './obtener-estado-suscripcion.use-case';
import { ObtenerEstadoSuscripcionCommand } from '../dto/obtener-estado-suscripcion.command';
import { SuscripcionConsultaRepository } from '../../domain/repositories/suscripcion-consulta.repository';
import { SuscripcionVigente } from '../../domain/entities/suscripcion-vigente.entity';
import type { EstadoSuscripcion } from '../../domain/entities/suscripcion-vigente.entity';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-10-01T12:00:00.000Z');
const PLAN = { id: 'plan-1', nombre: 'Pro', precio: 50000 };

const suscripcion = (estado: EstadoSuscripcion, diasParaVencer: number) =>
  new SuscripcionVigente('sus-1', 'neg-1', estado, new Date(AHORA.getTime() + diasParaVencer * DIA), PLAN);

describe('ObtenerEstadoSuscripcionUseCase', () => {
  let useCase: ObtenerEstadoSuscripcionUseCase;
  let repository: jest.Mocked<SuscripcionConsultaRepository>;

  beforeEach(() => {
    repository = {
      buscarNegocioIdPorUsuario: jest.fn(),
      buscarVigentePorNegocio: jest.fn(),
    };
    useCase = new ObtenerEstadoSuscripcionUseCase(repository);
  });

  it('resuelve el negocio desde el usuario y devuelve ACTIVO sin alerta', async () => {
    repository.buscarNegocioIdPorUsuario.mockResolvedValue('neg-1');
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 20));

    const result = await useCase.execute(ObtenerEstadoSuscripcionCommand.porUsuario('user-1'), AHORA);

    expect(repository.buscarVigentePorNegocio).toHaveBeenCalledWith('neg-1');
    expect(result).toMatchObject({
      estado: 'ACTIVO',
      negocioId: 'neg-1',
      suscripcionId: 'sus-1',
      plan: PLAN,
      diasRestantes: 20,
      puedeEditar: true,
      puedeUsarAgente: true,
      alerta: null,
    });
  });

  it('consulta por negocio sin resolver el usuario', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 20));

    await useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA);

    expect(repository.buscarNegocioIdPorUsuario).not.toHaveBeenCalled();
    expect(repository.buscarVigentePorNegocio).toHaveBeenCalledWith('neg-1');
  });

  it('devuelve SIN_PLAN sin error cuando el usuario aún no tiene negocio', async () => {
    repository.buscarNegocioIdPorUsuario.mockResolvedValue(null);

    const result = await useCase.execute(ObtenerEstadoSuscripcionCommand.porUsuario('user-1'), AHORA);

    expect(repository.buscarVigentePorNegocio).not.toHaveBeenCalled();
    expect(result).toMatchObject({ estado: 'SIN_PLAN', puedeEditar: true, puedeUsarAgente: false, alerta: null });
  });

  it('devuelve SIN_PLAN cuando el negocio no tiene suscripción vigente', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(null);

    const result = await useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA);

    expect(result).toMatchObject({ estado: 'SIN_PLAN', suscripcionId: null, fechaFin: null, diasRestantes: null });
  });

  it('incluye la alerta POR_VENCER con los días restantes', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 2));

    const result = await useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA);

    expect(result.estado).toBe('POR_VENCER');
    expect(result.alerta).toEqual({ tipo: 'POR_VENCER', mensaje: 'Tu plan vence en 2 días. Renuévalo aquí.' });
  });

  it('usa singular cuando falta un día', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('activa', 1));

    const result = await useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA);

    expect(result.alerta?.mensaje).toBe('Tu plan vence en 1 día. Renuévalo aquí.');
  });

  it('con plan vencido restringe edición y agente, y alerta la restricción', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValue(suscripcion('vencida', -2));

    const result = await useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA);

    expect(result).toMatchObject({ estado: 'VENCIDO', diasRestantes: 0, puedeEditar: false, puedeUsarAgente: false });
    expect(result.alerta?.tipo).toBe('VENCIDO');
  });

  // HU-8.5 criterio 3: al confirmarse la renovación (el webhook de pago deja la suscripción
  // activa con fecha_fin extendida) el acceso se restablece sin ninguna acción adicional.
  it('restablece el acceso completo en cuanto fecha_fin se extiende', async () => {
    repository.buscarVigentePorNegocio.mockResolvedValueOnce(suscripcion('vencida', -1));
    const antes = await useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA);

    repository.buscarVigentePorNegocio.mockResolvedValueOnce(suscripcion('activa', 30));
    const despues = await useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA);

    expect(antes).toMatchObject({ estado: 'VENCIDO', puedeEditar: false, puedeUsarAgente: false });
    expect(despues).toMatchObject({ estado: 'ACTIVO', puedeEditar: true, puedeUsarAgente: true, alerta: null });
  });

  it('propaga los errores del repositorio', async () => {
    repository.buscarVigentePorNegocio.mockRejectedValue(new Error('db caída'));

    await expect(
      useCase.execute(ObtenerEstadoSuscripcionCommand.porNegocio('neg-1'), AHORA),
    ).rejects.toThrow('db caída');
  });
});
