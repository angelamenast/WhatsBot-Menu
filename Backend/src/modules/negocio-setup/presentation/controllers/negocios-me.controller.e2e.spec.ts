import { jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NegociosMeController } from './negocios-me.controller';
import { ObtenerChecklistNegocioUseCase } from '../../application/use-cases/obtener-checklist-negocio.use-case';
import { CambiarAtencionAutomaticaUseCase } from '../../application/use-cases/cambiar-atencion-automatica.use-case';
import { construirChecklist } from '../../domain/checklist-negocio';
import { ChecklistIncompletoError } from '../../domain/errors/negocio-setup.errors';
import { NegocioNoEncontradoError } from '../../../business/domain/errors/business.errors';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';

// Usa el SupabaseAuthGuard real: solo el token "valid-token" corresponde a un usuario.
describe('NegociosMeController (/negocios/me)', () => {
  let app: INestApplication;
  const checklistUseCase = { execute: jest.fn<any>() };
  const atencionUseCase = { execute: jest.fn<any>() };
  const supabaseService = {
    getClient: () => ({
      auth: {
        getUser: async (token: string) =>
          token === 'valid-token'
            ? { data: { user: { id: 'user-1' } }, error: null }
            : { data: { user: null }, error: { status: 401, name: 'AuthApiError', message: 'invalid JWT' } },
      },
    }),
  };
  const auth = { Authorization: 'Bearer valid-token' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NegociosMeController],
      providers: [
        SupabaseAuthGuard,
        { provide: SupabaseService, useValue: supabaseService },
        { provide: ObtenerChecklistNegocioUseCase, useValue: checklistUseCase },
        { provide: CambiarAtencionAutomaticaUseCase, useValue: atencionUseCase },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    checklistUseCase.execute.mockReset();
    atencionUseCase.execute.mockReset();
  });

  describe('GET /negocios/me/checklist', () => {
    it('200 con el checklist del usuario autenticado', async () => {
      const checklist = construirChecklist({ plan_activo: true, whatsapp_conectado: false, catalogo: true, agente_configurado: false });
      checklistUseCase.execute.mockResolvedValue(checklist);

      const response = await request(app.getHttpServer()).get('/negocios/me/checklist').set(auth).expect(200);

      expect(response.body).toEqual(checklist);
      expect(checklistUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'user-1' }));
    });

    it('401 sin token o con token inválido', async () => {
      await request(app.getHttpServer()).get('/negocios/me/checklist').expect(401);
      await request(app.getHttpServer()).get('/negocios/me/checklist').set('Authorization', 'Bearer otro').expect(401);
      expect(checklistUseCase.execute).not.toHaveBeenCalled();
    });

    it('404 si el usuario no tiene negocio', async () => {
      checklistUseCase.execute.mockRejectedValue(new NegocioNoEncontradoError());
      await request(app.getHttpServer()).get('/negocios/me/checklist').set(auth).expect(404);
    });
  });

  describe('PATCH /negocios/me/atencion-automatica', () => {
    it('200 al activar con el checklist completo', async () => {
      atencionUseCase.execute.mockResolvedValue({ atencionAutomaticaActiva: true });

      const response = await request(app.getHttpServer()).patch('/negocios/me/atencion-automatica').set(auth).send({ activa: true }).expect(200);

      expect(response.body).toEqual({ atencionAutomaticaActiva: true });
      expect(atencionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: 'user-1', activa: true }));
    });

    it('409 con los faltantes si el checklist está incompleto', async () => {
      const faltantes = [{ clave: 'whatsapp_conectado' as const, label: 'WhatsApp vinculado' }];
      atencionUseCase.execute.mockRejectedValue(new ChecklistIncompletoError(faltantes));

      const response = await request(app.getHttpServer()).patch('/negocios/me/atencion-automatica').set(auth).send({ activa: true }).expect(409);

      expect(response.body).toMatchObject({ message: expect.any(String), faltantes });
    });

    it('401 sin token', async () => {
      await request(app.getHttpServer()).patch('/negocios/me/atencion-automatica').send({ activa: false }).expect(401);
      expect(atencionUseCase.execute).not.toHaveBeenCalled();
    });

    it('400 si activa no es booleano', async () => {
      await request(app.getHttpServer()).patch('/negocios/me/atencion-automatica').set(auth).send({ activa: 'si' }).expect(400);
      await request(app.getHttpServer()).patch('/negocios/me/atencion-automatica').set(auth).send({}).expect(400);
      expect(atencionUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
