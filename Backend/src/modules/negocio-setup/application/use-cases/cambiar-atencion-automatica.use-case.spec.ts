import { jest } from '@jest/globals';
import { CambiarAtencionAutomaticaUseCase } from './cambiar-atencion-automatica.use-case';
import { CambiarAtencionAutomaticaCommand } from '../dto/cambiar-atencion-automatica.command';
import type { ObtenerChecklistNegocioUseCase } from './obtener-checklist-negocio.use-case';
import { construirChecklist } from '../../domain/checklist-negocio';
import { ChecklistIncompletoError } from '../../domain/errors/negocio-setup.errors';
import { Negocio } from '../../../business/domain/entities/negocio.entity';
import { NegocioNoEncontradoError } from '../../../business/domain/errors/business.errors';

const negocio = new Negocio('biz-1', 'user-1', 'Café', null, 'activo', null);
const completo = construirChecklist({ plan_activo: true, whatsapp_conectado: true, catalogo: true, agente_configurado: true });
const incompleto = construirChecklist({ plan_activo: true, whatsapp_conectado: false, catalogo: true, agente_configurado: false });

describe('CambiarAtencionAutomaticaUseCase', () => {
  let negocioRepository: { buscarPorUsuario: jest.Mock<any>; actualizarAtencionAutomatica: jest.Mock<any> };
  let checklist: { evaluar: jest.Mock<any> };
  let useCase: CambiarAtencionAutomaticaUseCase;

  beforeEach(() => {
    negocioRepository = {
      buscarPorUsuario: jest.fn<any>().mockResolvedValue(negocio),
      actualizarAtencionAutomatica: jest.fn<any>().mockImplementation(async (_id: string, activa: boolean) => activa),
    };
    checklist = { evaluar: jest.fn<any>().mockResolvedValue(completo) };
    useCase = new CambiarAtencionAutomaticaUseCase(negocioRepository as any, checklist as unknown as ObtenerChecklistNegocioUseCase);
  });

  it('activa la atención si el checklist está completo', async () => {
    await expect(useCase.execute(new CambiarAtencionAutomaticaCommand('user-1', true))).resolves.toEqual({ atencionAutomaticaActiva: true });
    expect(checklist.evaluar).toHaveBeenCalledWith('biz-1');
    expect(negocioRepository.actualizarAtencionAutomatica).toHaveBeenCalledWith('biz-1', true);
  });

  it('no activa con el checklist incompleto e informa qué falta', async () => {
    checklist.evaluar.mockResolvedValue(incompleto);

    const error = await useCase.execute(new CambiarAtencionAutomaticaCommand('user-1', true)).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ChecklistIncompletoError);
    expect((error as ChecklistIncompletoError).faltantes).toEqual([
      { clave: 'whatsapp_conectado', label: 'WhatsApp vinculado' },
      { clave: 'agente_configurado', label: 'Agente configurado (tono y mensaje de bienvenida)' },
    ]);
    expect(negocioRepository.actualizarAtencionAutomatica).not.toHaveBeenCalled();
  });

  it('desactiva siempre, sin revisar el checklist', async () => {
    checklist.evaluar.mockResolvedValue(incompleto);

    await expect(useCase.execute(new CambiarAtencionAutomaticaCommand('user-1', false))).resolves.toEqual({ atencionAutomaticaActiva: false });
    expect(checklist.evaluar).not.toHaveBeenCalled();
    expect(negocioRepository.actualizarAtencionAutomatica).toHaveBeenCalledWith('biz-1', false);
  });

  it('falla si el usuario no tiene negocio', async () => {
    negocioRepository.buscarPorUsuario.mockResolvedValue(null);

    await expect(useCase.execute(new CambiarAtencionAutomaticaCommand('user-1', false))).rejects.toBeInstanceOf(NegocioNoEncontradoError);
    expect(negocioRepository.actualizarAtencionAutomatica).not.toHaveBeenCalled();
  });
});
