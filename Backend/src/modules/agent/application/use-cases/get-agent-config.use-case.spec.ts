import { jest } from '@jest/globals';
import { GetAgentConfigUseCase } from './get-agent-config.use-case';
import { AgentConfigRepository } from '../../domain/repositories/agent-config.repository';
import { AgentConfig } from '../../domain/entities/agent-config.entity';
import { DEFAULT_UNAVAILABLE_MESSAGE } from '../constants/agent-messages';

describe('GetAgentConfigUseCase', () => {
  let repository: jest.Mocked<AgentConfigRepository>;
  let useCase: GetAgentConfigUseCase;

  beforeEach(() => {
    repository = { findByBusinessId: jest.fn(), save: jest.fn() };
    useCase = new GetAgentConfigUseCase(repository);
  });

  it('sin fila: devuelve los MISMOS valores por defecto que usa el bot y no persiste nada', async () => {
    repository.findByBusinessId.mockResolvedValue(null);

    const config = await useCase.execute('business-1');
    const botDefault = AgentConfig.default('business-1');

    expect(config.businessId).toBe(botDefault.businessId);
    expect(config.personality).toBe(botDefault.personality);
    expect(config.tone).toBe(botDefault.tone);
    expect(config.regionalStyle).toBe(botDefault.regionalStyle);
    expect(config.welcomeMessage).toBe(botDefault.welcomeMessage);
    expect(config.welcomeMessage).not.toBeNull();
    expect(config.unavailableMessage).toBe(botDefault.unavailableMessage);
    // El dashboard muestra el MISMO texto de no disponibilidad que usa el bot, no un campo vacío.
    expect(config.unavailableMessage).toBe(DEFAULT_UNAVAILABLE_MESSAGE);
    expect(config.businessHours).toBe(botDefault.businessHours);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('con fila: devuelve la guardada', async () => {
    const stored = AgentConfig.default('business-1');
    stored.updateDetails({ welcomeMessage: 'Hola desde la BD' });
    repository.findByBusinessId.mockResolvedValue(stored);

    await expect(useCase.execute('business-1')).resolves.toBe(stored);
  });
});
