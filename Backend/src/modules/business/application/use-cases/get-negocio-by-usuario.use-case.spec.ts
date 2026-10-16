import { jest } from '@jest/globals';
import { GetNegocioByUsuarioUseCase } from './get-negocio-by-usuario.use-case';
import { NegocioRepository } from '../../domain/repositories/negocio.repository';
import { GetNegocioByUsuarioCommand } from '../dto/get-negocio-by-usuario.command';
import { Negocio } from '../../domain/entities/negocio.entity';

describe('GetNegocioByUsuarioUseCase', () => {
  let useCase: GetNegocioByUsuarioUseCase;
  let negocioRepository: jest.Mocked<NegocioRepository>;

  beforeEach(() => {
    negocioRepository = {
      existeNegocioActivoPorUsuario: jest.fn(),
      crear: jest.fn(),
      buscarPorUsuario: jest.fn(),
    };
    useCase = new GetNegocioByUsuarioUseCase(negocioRepository);
  });

  it('retorna el negocio cuando existe', async () => {
    const negocio = new Negocio('1', 'user-1', 'Mi Negocio', '+573001234567', 'activo', null);
    negocioRepository.buscarPorUsuario.mockResolvedValue(negocio);

    const result = await useCase.execute(new GetNegocioByUsuarioCommand('user-1'));

    expect(result).toEqual(negocio);
  });

  it('retorna null cuando el usuario no tiene negocio', async () => {
    negocioRepository.buscarPorUsuario.mockResolvedValue(null);

    const result = await useCase.execute(new GetNegocioByUsuarioCommand('user-2'));

    expect(result).toBeNull();
  });
});