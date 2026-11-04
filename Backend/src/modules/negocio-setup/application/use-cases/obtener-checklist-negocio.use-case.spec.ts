import { jest } from '@jest/globals';
import { ObtenerChecklistNegocioUseCase } from './obtener-checklist-negocio.use-case';
import { ObtenerChecklistNegocioCommand } from '../dto/obtener-checklist-negocio.command';
import { Negocio } from '../../../business/domain/entities/negocio.entity';
import { Product } from '../../../business/domain/entities/product.entity';
import { NegocioNoEncontradoError } from '../../../business/domain/errors/business.errors';
import { WhatsappConnection, WhatsappConnectionStatus } from '../../../whatsapp/domain/entities/whatsapp-connection.entity';
import { AgentConfig } from '../../../agent/domain/entities/agent-config.entity';
import { AgentTone } from '../../../agent/domain/enums/agent-style';
import type { ObtenerEstadoSuscripcionUseCase } from '../../../subscriptions/application/use-cases/obtener-estado-suscripcion.use-case';

const negocio = new Negocio('biz-1', 'user-1', 'Café', null, 'activo', null);
const producto = new Product('p-1', 'biz-1', null, 'Tinto', null, 3000, true, null);
const conexion = (status: WhatsappConnectionStatus) =>
  WhatsappConnection.create({ id: 'c-1', businessId: 'biz-1', phoneNumber: '+573001234567', twilioSubaccountSid: null, twilioSenderSid: null, status, createdAt: new Date(), updatedAt: new Date() });
const configAgente = (tone: AgentTone | null, welcomeMessage: string | null) =>
  AgentConfig.create({ id: 'a-1', businessId: 'biz-1', personality: null, tone, regionalStyle: null, welcomeMessage, unavailableMessage: null, businessHours: null, createdAt: new Date(), updatedAt: new Date() });

describe('ObtenerChecklistNegocioUseCase', () => {
  let negocioRepository: { buscarPorUsuario: jest.Mock<any> };
  let productRepository: { listByBusiness: jest.Mock<any> };
  let whatsappConnectionRepository: { findByBusinessId: jest.Mock<any> };
  let agentConfigRepository: { findByBusinessId: jest.Mock<any> };
  let estadoSuscripcion: { execute: jest.Mock<any> };
  let useCase: ObtenerChecklistNegocioUseCase;

  beforeEach(() => {
    negocioRepository = { buscarPorUsuario: jest.fn<any>().mockResolvedValue(negocio) };
    productRepository = { listByBusiness: jest.fn<any>().mockResolvedValue([producto]) };
    whatsappConnectionRepository = { findByBusinessId: jest.fn<any>().mockResolvedValue(conexion(WhatsappConnectionStatus.CONNECTED)) };
    agentConfigRepository = { findByBusinessId: jest.fn<any>().mockResolvedValue(configAgente(AgentTone.AMABLE, '¡Hola! Bienvenido')) };
    estadoSuscripcion = { execute: jest.fn<any>().mockResolvedValue({ puedeUsarAgente: true }) };
    useCase = new ObtenerChecklistNegocioUseCase(
      negocioRepository as any,
      productRepository as any,
      whatsappConnectionRepository as any,
      agentConfigRepository as any,
      estadoSuscripcion as unknown as ObtenerEstadoSuscripcionUseCase,
    );
  });

  it('con todo configurado devuelve el checklist completo al 100%', async () => {
    const resultado = await useCase.execute(new ObtenerChecklistNegocioCommand('user-1'));

    expect(resultado).toEqual({
      items: [
        { clave: 'plan_activo', completo: true, label: 'Plan activo' },
        { clave: 'whatsapp_conectado', completo: true, label: 'WhatsApp vinculado' },
        { clave: 'catalogo', completo: true, label: 'Al menos 1 producto en el catálogo' },
        { clave: 'agente_configurado', completo: true, label: 'Agente configurado (tono y mensaje de bienvenida)' },
      ],
      completo: true,
      porcentaje: 100,
    });
    expect(estadoSuscripcion.execute).toHaveBeenCalledWith(expect.objectContaining({ negocioId: 'biz-1' }));
    expect(productRepository.listByBusiness).toHaveBeenCalledWith('biz-1', { onlyAvailable: true });
  });

  it('marca incompletos los pasos que faltan y calcula el porcentaje', async () => {
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(conexion(WhatsappConnectionStatus.PENDING));
    agentConfigRepository.findByBusinessId.mockResolvedValue(null);

    const resultado = await useCase.execute(new ObtenerChecklistNegocioCommand('user-1'));

    expect(resultado.completo).toBe(false);
    expect(resultado.porcentaje).toBe(50);
    expect(resultado.items.filter(item => !item.completo).map(item => item.clave)).toEqual(['whatsapp_conectado', 'agente_configurado']);
  });

  it('sin plan, sin conexión y sin productos disponibles queda en 0%', async () => {
    estadoSuscripcion.execute.mockResolvedValue({ puedeUsarAgente: false });
    whatsappConnectionRepository.findByBusinessId.mockResolvedValue(null);
    productRepository.listByBusiness.mockResolvedValue([]);
    agentConfigRepository.findByBusinessId.mockResolvedValue(null);

    await expect(useCase.execute(new ObtenerChecklistNegocioCommand('user-1'))).resolves.toMatchObject({ completo: false, porcentaje: 0 });
  });

  it('el agente no cuenta como configurado sin tono o con bienvenida vacía', async () => {
    agentConfigRepository.findByBusinessId.mockResolvedValue(configAgente(null, '¡Hola!'));
    const sinTono = await useCase.evaluar('biz-1');
    agentConfigRepository.findByBusinessId.mockResolvedValue(configAgente(AgentTone.FORMAL, '   '));
    const sinBienvenida = await useCase.evaluar('biz-1');

    const agente = (checklist: typeof sinTono) => checklist.items.find(item => item.clave === 'agente_configurado')?.completo;
    expect(agente(sinTono)).toBe(false);
    expect(agente(sinBienvenida)).toBe(false);
  });

  it('falla si el usuario no tiene negocio', async () => {
    negocioRepository.buscarPorUsuario.mockResolvedValue(null);

    await expect(useCase.execute(new ObtenerChecklistNegocioCommand('user-1'))).rejects.toBeInstanceOf(NegocioNoEncontradoError);
    expect(estadoSuscripcion.execute).not.toHaveBeenCalled();
  });
});
