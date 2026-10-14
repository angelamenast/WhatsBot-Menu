import { jest } from '@jest/globals';
import { CreateNegocioUseCase } from './create-negocio.use-case';
import { NegocioRepository } from '../../domain/repositories/negocio.repository';
import { CreateNegocioCommand } from '../dto/create-negocio.command';
import { NegocioYaExisteError } from '../../domain/errors/business.errors';
import { Negocio } from '../../domain/entities/negocio.entity';

describe('CreateNegocioUseCase', () => {
  let useCase: CreateNegocioUseCase;
  let negocioRepository: jest.Mocked<NegocioRepository>;

  beforeEach(() => {
    negocioRepository = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn(),
    };
    useCase = new CreateNegocioUseCase(negocioRepository);
  });

  it('crea el negocio cuando el usuario no tiene ninguno activo', async () => {
    negocioRepository.existeNegocioActivoPorUsuario.mockResolvedValue(false);
    const negocioEsperado = new Negocio('1', 'user-1', 'Mi Negocio', '+573001234567', 'activo', null);
    negocioRepository.crear.mockResolvedValue(negocioEsperado);

    const command = new CreateNegocioCommand('user-1', 'Mi Negocio', '+573001234567');
    const result = await useCase.execute(command);

    expect(result).toEqual(negocioEsperado);
  });

  it('lanza NegocioYaExisteError si el usuario ya tiene un negocio activo', async () => {
    negocioRepository.existeNegocioActivoPorUsuario.mockResolvedValue(true);

    const command = new CreateNegocioCommand('user-1', 'Mi Negocio', '+573001234567');

    await expect(useCase.execute(command)).rejects.toThrow(NegocioYaExisteError);
    expect(negocioRepository.crear).not.toHaveBeenCalled();
  });
});