import 'reflect-metadata';
import request from 'supertest';
import { AgentTestApp } from '../support/agent-test-app';
import { AgentTestDataBuilder } from '../support/builders';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { DEFAULT_UNAVAILABLE_MESSAGE, DEFAULT_WELCOME_MESSAGE } from '../../domain/constants/agent-defaults';

describe('Flujo de Integración: Configuración del Agente (HTTP API)', () => {
  const testApp = new AgentTestApp();
  const AUTH_HEADER = 'Bearer test-valid-token';
  const BUSINESS_ID = 'business-test-1';

  beforeAll(async () => {
    await testApp.initialize();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    testApp.reset();
  });

  describe('GET /api/agent/config', () => {
    it('IT-AGENT-01: retorna la configuración por defecto si el negocio no ha configurado su agente', async () => {
      const response = await request(testApp.app.getHttpServer())
        .get('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(response.body).toEqual({
        businessId: BUSINESS_ID,
        personality: null,
        tone: null,
        regionalStyle: null,
        welcomeMessage: DEFAULT_WELCOME_MESSAGE,
        unavailableMessage: DEFAULT_UNAVAILABLE_MESSAGE,
        businessHours: null,
      });
    });

    it('IT-AGENT-02: retorna la configuración personalizada previamente persistida en el repositorio', async () => {
      const customConfig = AgentTestDataBuilder.anAgentConfig({
        businessId: BUSINESS_ID,
        personality: 'Cálido y paciente',
        tone: AgentTone.AMABLE,
        regionalStyle: AgentRegionalStyle.CALENO,
        welcomeMessage: '¡Bienvenido a nuestro restaurante caleño!',
        unavailableMessage: 'Por hoy cerramos la cocina.',
        businessHours: { martes: '10:00 - 20:00' },
      });
      testApp.agentConfigRepo.seed(customConfig);

      const response = await request(testApp.app.getHttpServer())
        .get('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(response.body).toEqual({
        businessId: BUSINESS_ID,
        personality: 'Cálido y paciente',
        tone: AgentTone.AMABLE,
        regionalStyle: AgentRegionalStyle.CALENO,
        welcomeMessage: '¡Bienvenido a nuestro restaurante caleño!',
        unavailableMessage: 'Por hoy cerramos la cocina.',
        businessHours: { martes: '10:00 - 20:00' },
      });
    });

    it('IT-AGENT-03: rechaza con 401 Unauthorized si la petición no incluye token Bearer', async () => {
      const response = await request(testApp.app.getHttpServer())
        .get('/api/agent/config')
        .expect(401);

      expect(response.body.message).toBe('Token no proporcionado');
    });

    it('IT-AGENT-04: responde 404 NotFound si el usuario autenticado no tiene negocio registrado', async () => {
      testApp.userBusinessMap.delete('test-user-1');

      const response = await request(testApp.app.getHttpServer())
        .get('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .expect(404);

      expect(response.body.message).toBe('No tienes un negocio registrado');
    });
  });

  describe('PATCH /api/agent/config', () => {
    it('IT-AGENT-05: actualiza los parámetros del agente y los persiste en el repositorio', async () => {
      const payload = {
        personality: 'Enérgico y jovial',
        tone: AgentTone.ENTUSIASTA,
        regionalStyle: AgentRegionalStyle.COSTENO,
        welcomeMessage: '¡Qué hubo! Bienvenido a la mejor comida costeña.',
        unavailableMessage: 'Cerrado por hoy mi gente.',
        businessHours: { horario: '24/7' },
      };

      const patchResponse = await request(testApp.app.getHttpServer())
        .patch('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .send(payload)
        .expect(200);

      expect(patchResponse.body).toEqual({
        businessId: BUSINESS_ID,
        ...payload,
      });

      // Verificación de integración: el siguiente GET debe devolver lo persistido
      const getResponse = await request(testApp.app.getHttpServer())
        .get('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .expect(200);

      expect(getResponse.body).toEqual({
        businessId: BUSINESS_ID,
        ...payload,
      });
    });

    it('IT-AGENT-06: bloquea la edición con 403 PLAN_VENCIDO cuando el plan está vencido', async () => {
      testApp.subscriptionCanEdit = false;

      const response = await request(testApp.app.getHttpServer())
        .patch('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .send({ personality: 'Intento de cambio no permitido' })
        .expect(403);

      expect(response.body).toEqual({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tu plan venció. Renueva para editar.',
        codigo: 'PLAN_VENCIDO',
      });

      // Verificación en el repositorio: no debe haberse alterado nada
      const savedConfig = await testApp.agentConfigRepo.findByBusinessId(BUSINESS_ID);
      expect(savedConfig).toBeNull();
    });

    it('IT-AGENT-07: rechaza con 400 Bad Request si se envían valores inválidos de tono o estilo regional', async () => {
      const response = await request(testApp.app.getHttpServer())
        .patch('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .send({
          tone: 'INVENTADO',
          regionalStyle: 'EUROPEO',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('tone must be one of the following values'),
          expect.stringContaining('regionalStyle must be one of the following values'),
        ]),
      );
    });

    it('IT-AGENT-08: rechaza con 400 Bad Request si el mensaje de bienvenida excede 500 caracteres', async () => {
      const textoLargo = 'a'.repeat(501);

      const response = await request(testApp.app.getHttpServer())
        .patch('/api/agent/config')
        .set('Authorization', AUTH_HEADER)
        .send({ welcomeMessage: textoLargo })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('welcomeMessage must be shorter than or equal to 500 characters'),
        ]),
      );
    });
  });
});
