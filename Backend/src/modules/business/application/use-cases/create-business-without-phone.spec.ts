import { jest } from '@jest/globals';
import { validate } from 'class-validator';
import { CreateNegocioUseCase } from './create-negocio.use-case';
import { CreateNegocioCommand } from '../dto/create-negocio.command';
import { CreateNegocioRequestDto } from '../../presentation/dto/create-negocio-request.dto';
import type { NegocioRepository } from '../../domain/repositories/negocio.repository';

describe('Registro de negocio separado de WhatsApp', () => {
  it('el DTO acepta registrar un negocio sin número', async () => {
    const dto = Object.assign(new CreateNegocioRequestDto(), {nombre_negocio:'Mi cafetería'});
    expect(await validate(dto)).toHaveLength(0);
  });
  it('guarda null y permite vincular el número después', async () => {
    const crear = jest.fn<(...args:any[])=>Promise<any>>().mockResolvedValue({id:'business',numeroWhatsapp:null});
    const repository = { existeNegocioActivoPorUsuario:async()=>false, crear } as unknown as NegocioRepository;
    const result = await new CreateNegocioUseCase(repository).execute(new CreateNegocioCommand('owner','Mi cafetería'));
    expect(crear).toHaveBeenCalledWith(expect.objectContaining({usuarioId:'owner',numeroWhatsapp:null}));expect(result.numeroWhatsapp).toBeNull();
  });
});
