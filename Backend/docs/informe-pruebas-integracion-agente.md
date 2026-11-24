# BeeCode
*Construimos la tecnología que impulsa tu idea.*

# “TREMIA”
### Agente Conversacional de IA para Atención al Cliente y Gestión de Pedidos a través de WhatsApp

---

## **Informe de Pruebas de Integración: Módulo Agente**
**Versión 1.0**

---

### **Historial de Revisiones**

| Fecha | Versión | Descripción | Autores |
|---|---|---|---|
| 16/11/2026 | 1.0 | Versión inicial del informe de pruebas de integración del módulo Agente (`agent`): alcance, aislamiento, casos de prueba (IT-AGENT-01 al 22), ejecución automatizada y resultados. | Equipo BeeCode (Julián & Angela) |

---

### **Tabla de Contenido**
1. [Introducción](#1-introducción)
2. [Propósito](#2-propósito)
3. [Objetivos y Alcance](#3-objetivos-y-alcance)
   - 3.1. Objetivo General
   - 3.2. Objetivos Específicos
   - 3.3. Alcance
   - 3.4. Fuera de alcance
4. [Estrategia de Pruebas](#4-estrategia-de-pruebas)
   - 4.1. Enfoque y Estándar Modular
   - 4.2. Aislamiento y Fakes Fieles de Base de Datos
   - 4.3. Criterios de Entrada y Salida
5. [Ambiente de Pruebas](#5-ambiente-de-pruebas)
   - 5.1. Medidas de Seguridad y Control de Datos
6. [Casos de Prueba Diseñados](#6-casos-de-prueba-diseñados)
   - 6.1. Configuración del Agente (API HTTP)
   - 6.2. Procesamiento de Mensajes y Atención al Cliente
   - 6.3. Generación y Validación de Pedidos Asistidos por IA
   - 6.4. Control de Cuota y Consumo de Tokens de IA
7. [Resultados de la Ejecución](#7-resultados-de-la-ejecución)
   - 7.1. Resumen Global
   - 7.2. Resultados por Suite
   - 7.3. Resultados Detallados por Caso de Prueba
8. [Defectos y Hallazgos](#8-defectos-y-hallazgos)
9. [Matriz de Trazabilidad](#9-matriz-de-trazabilidad)
10. [Limitaciones y Trabajo Futuro](#10-limitaciones-y-trabajo-futuro)
11. [Conclusiones](#11-conclusiones)
12. [Anexo: Cómo Reproducir las Pruebas](#12-anexo-cómo-reproducir-las-pruebas)
13. [Bibliografía](#13-bibliografía)

---

### 1. Introducción
El presente informe documenta el diseño, la ejecución y los resultados de las pruebas de integración del **Módulo del Agente (`AgentModule`)** de la plataforma SaaS **TREMIA (WhatsBot Menú)**, desarrollada por el equipo BeeCode.

A diferencia de las pruebas unitarias que aíslan cada clase mediante mocks estáticos, las pruebas de integración de este módulo ejercitan los componentes reales de la arquitectura hexagonal conectados entre sí: los casos de uso (`ProcessCustomerMessageUseCase`, `GetAgentConfigUseCase`, `UpdateAgentConfigUseCase`), el controlador HTTP (`AgentConfigController`), los guards de autenticación y autorización (`SupabaseAuthGuard`, `PlanActivoGuard`), y la integración con los adaptadores de catálogo, pedidos, cuotas y consumo de tokens.

Siguiendo el estándar de arquitectura y pruebas por módulo del proyecto, las pruebas residen dentro del propio módulo en `Backend/src/modules/agent/test/` con separación estricta entre especificaciones de flujo (`integration/`) y componentes de soporte (`support/`).

---

### 2. Propósito
Garantizar que el módulo del Agente cumple a cabalidad con los requerimientos funcionales (RF-10, RF-11, RF-22) y no funcionales (RNF-08 de control de cuotas) del sistema, verificando:
- La correcta configuración del agente y su persistencia a través de la API REST.
- La protección de endpoints según el estado de la suscripción (`PlanActivoGuard`, HU-8.5).
- El flujo conversacional, incluyendo la bienvenida en el primer mensaje, el envío de contingencia ante fallos del LLM y el respeto del horario y estado de atención del negocio.
- La delegación precisa y formateo confiable de pedidos creados desde WhatsApp hacia el módulo de órdenes, descartando alucinaciones del modelo.
- La medición y corte del servicio ante el agotamiento de cuota de tokens.

---

### 3. Objetivos y Alcance

#### 3.1. Objetivo General
Verificar mediante pruebas automatizadas que el módulo del Agente se integra de forma robusta, consistente y segura con sus dependencias de dominio, persistencia y puertos externos, validando la integridad de las reglas de negocio bajo aislamiento controlado.

#### 3.2. Objetivos Específicos
- Validar el contrato HTTP de `GET` y `PATCH /api/agent/config`, su validación de esquemas (DTOs) y el bloqueo en solo lectura cuando el plan del negocio está vencido.
- Probar el ciclo de vida del procesamiento de mensajes en `ProcessCustomerMessageUseCase`, exigiendo la precondición de persistencia previa del mensaje entrante.
- Constatar que la respuesta de bienvenida solo se anexa en el primer mensaje de la conversación y nunca se repite en mensajes subsecuentes.
- Comprobar la resiliencia del agente frente a excepciones del proveedor LLM o fallos en el registro de telemetría (la respuesta al usuario final nunca se descarta por errores de métricas).
- Verificar la creación asistida de pedidos, formateando los totales, productos disponibles y productos rechazados con nombres reales del catálogo.
- Validar las restricciones de unicidad de pedidos activos por conversación (`uq_pedidos_conversacion_abierto`) y la no duplicidad de id de mensajes.
- Validar el corte de atención cuando la cuota de tokens de IA se encuentra agotada.

#### 3.3. Alcance

| Área / Componente | Elementos Cubiertos |
|---|---|
| **API REST de Configuración** | `GET /api/agent/config`, `PATCH /api/agent/config`, DTOs de actualización, validaciones de longitud y enums, `PlanActivoGuard` y `SupabaseAuthGuard`. |
| **Atención Conversacional** | `ProcessCustomerMessageUseCase`, cálculo de `isFirstMessage`, mensaje de bienvenida, mensaje de no disponibilidad cuando la atención automática está inactiva, historial de turnos recientes. |
| **Gestión de Pedidos** | Traducción de pedidos propuestos por el LLM a `OrderPort`, formateo de respuestas de confirmación, gestión de productos agotados y rechazo de pedidos duplicados abiertos. |
| **Control de Tokens y Cuota** | Verificación de cuota con `UsageQuotaPort`, registro transaccional de tokens con `TokenUsagePort`, validación de restricciones no-negativas en tokens. |

#### 3.4. Fuera de alcance
- **Llamadas de red reales a APIs externas (Google Gemini API / Meta WhatsApp Cloud API):** De acuerdo con la Regla 4 del estándar, se bloquean las llamadas de red externas para asegurar reproducibilidad determinista y ejecución ultrarrápida sin consumo de saldo real.
- **Frontend web (Astro):** Corresponde a pruebas end-to-end (E2E) de la interfaz de usuario.

---

### 4. Estrategia de Pruebas

#### 4.1. Enfoque y Estándar Modular
Las pruebas se diseñaron bajo el **Estándar de pruebas de integración por módulo** de TREMIA:
```
src/modules/agent/
  └── test/
       ├── integration/  <- specs nombrados por flujo: <flujo>.integration.spec.ts
       └── support/      <- helpers: app de prueba, repos in-memory, fakes de puertos, builders
```

Se definieron 4 flujos principales:
1. `configuracion-agente.integration.spec.ts`: Flujo HTTP REST completo con guards y validadores.
2. `procesamiento-mensajes.integration.spec.ts`: Flujo de atención y orquestación del caso de uso principal.
3. `pedidos-agente.integration.spec.ts`: Flujo de interacción con el puerto de órdenes y respuestas seguras.
4. `consumo-cuota-ia.integration.spec.ts`: Flujo de control de cuotas y telemetría de tokens.

#### 4.2. Aislamiento y Fakes Fieles de Base de Datos
Para garantizar la fidelidad con PostgreSQL/Supabase sin depender de conexión a base de datos externa:
- **Aislamiento Total (Regla 4):** Sin lectura de variables de `.env` locales ni conexión a red (`global.fetch` bloqueado explícitamente).
- **Fakes Fieles (Regla 6):** Los repositorios y puertos in-memory imitan rigurosamente los constraints reales definidos en `schema_snapshot.sql`:
  - `configuracion_agente_negocio_id_key` (UNIQUE `negocio_id`).
  - `chk_tono` y `chk_estilo_regional` (CHECK constraints de enums válidos).
  - `uq_pedidos_conversacion_abierto` (Índice único parcial que impide más de un pedido abierto por conversación).
  - `catalogo_productos_precio_check` (CHECK precio >= 0).
  - `consumo_ia_tokens_entrada_check` y `consumo_ia_tokens_salida_check` (CHECK tokens >= 0).
  - `mensajes_id_mensaje_proveedor_key` (UNIQUE `id_mensaje_proveedor`).

#### 4.3. Criterios de Entrada y Salida
- **Criterio de Entrada:** Código del módulo `agent` compilable en TypeScript 6 / Node.js 24, dependencias instaladas en `Backend/package.json`.
- **Criterio de Salida:** 100 % de los casos de prueba ejecutados y aprobados; generación del archivo de evidencia `test-results/agent-integration.json`.

---

### 5. Ambiente de Pruebas

| Componente | Configuración |
|---|---|
| **Backend** | NestJS 12.0.1 · TypeScript 6.0.2 · Node.js v24.13.1 |
| **Framework de Pruebas** | Jest 30.0.0 · ts-jest 29.2.5 · supertest 7.0.0 |
| **Modo de Ejecución** | ECMAScript Modules (`--experimental-vm-modules`) |
| **Repositorio / Rama** | `angelamenast/WhatsBot-Menu` · Rama `feature/pruebas-agente` |
| **Directorio de Pruebas** | `Backend/src/modules/agent/test/` |
| **Comando de Ejecución** | `npm run test:agent:int` |

#### 5.1. Medidas de Seguridad y Control de Datos
- Las pruebas no utilizan credenciales vivas ni tokens de producción.
- `AgentTestApp` restaura el estado y los repositorios antes de cada prueba (`beforeEach`).
- Cada test aísla las variables de entorno restaurando `process.env`.

---

### 6. Casos de Prueba Diseñados

#### 6.1. Configuración del Agente (API HTTP)
| ID | Flujo / Endpoint | Objetivo | Resultado Esperado |
|---|---|---|---|
| **IT-AGENT-01** | `GET /api/agent/config` | Consultar configuración cuando el negocio nunca ha personalizado su agente. | Retorna HTTP 200 con la configuración por defecto (la misma que usa el bot). |
| **IT-AGENT-02** | `GET /api/agent/config` | Consultar configuración cuando existen datos guardados en el repositorio. | Retorna HTTP 200 con los datos personalizados (personalidad, tono, estilo, bienvenida). |
| **IT-AGENT-03** | `GET /api/agent/config` | Intentar consultar sin token Bearer de autenticación. | Retorna HTTP 401 Unauthorized (`Token no proporcionado`). |
| **IT-AGENT-04** | `GET /api/agent/config` | Consultar cuando el usuario no tiene un negocio registrado en la plataforma. | Retorna HTTP 404 NotFound (`No tienes un negocio registrado`). |
| **IT-AGENT-05** | `PATCH /api/agent/config` | Actualizar los parámetros del agente con suscripción activa. | Retorna HTTP 200, persiste los cambios y son verificables en el siguiente GET. |
| **IT-AGENT-06** | `PATCH /api/agent/config` | Intentar actualizar cuando la suscripción del negocio está vencida (HU-8.5). | Retorna HTTP 403 Forbidden (`PLAN_VENCIDO`) y no altera los datos en persistencia. |
| **IT-AGENT-07** | `PATCH /api/agent/config` | Enviar valores inválidos para `tone` o `regionalStyle`. | Retorna HTTP 400 Bad Request por fallo en validación de DTO (`ValidationPipe`). |
| **IT-AGENT-08** | `PATCH /api/agent/config` | Enviar mensaje de bienvenida que supera la longitud máxima permitida (> 500 caracteres). | Retorna HTTP 400 Bad Request por exceder `MaxLength(500)`. |

#### 6.2. Procesamiento de Mensajes y Atención al Cliente
| ID | Caso de Uso | Objetivo | Resultado Esperado |
|---|---|---|---|
| **IT-AGENT-09** | `ProcessCustomerMessage` | Procesar mensaje cuando el negocio se encuentra inactivo (`businessActive: false`). | Retorna `null` (el agente no responde) y no realiza llamadas al LLM. |
| **IT-AGENT-10** | `ProcessCustomerMessage` | Procesar mensaje con atención automática desactivada (`autoAttentionActive: false`). | Retorna mensaje de no disponibilidad de inmediato sin invocar al LLM ni consumir cuota. |
| **IT-AGENT-11** | `ProcessCustomerMessage` | Procesar mensaje si este no fue previamente guardado en BD (`count = 0`). | Lanza `IncomingMessageNotPersistedError` (violación de precondición obligatoria). |
| **IT-AGENT-12** | `ProcessCustomerMessage` | Procesar el primer mensaje de una conversación (`count = 1`). | Antepone el saludo de bienvenida a la respuesta del LLM y marca `isFirstMessage: true`. |
| **IT-AGENT-13** | `ProcessCustomerMessage` | Procesar mensajes posteriores (`count > 1`). | No repite el saludo de bienvenida e inyecta el historial previo en el contexto del LLM. |
| **IT-AGENT-14** | `ProcessCustomerMessage` | Manejar fallo o timeout del modelo de lenguaje (LLM). | Responde con el mensaje de contingencia (`FALLBACK_RESPONSE_TEXT`) sin romper el flujo. |
| **IT-AGENT-15** | `ProcessCustomerMessage` | Manejar fallo inesperado al persistir la telemetría de tokens (`TokenUsagePort`). | La respuesta conversacional se entrega al cliente con éxito (resiliencia de telemetría). |

#### 6.3. Generación y Validación de Pedidos Asistidos por IA
| ID | Caso de Uso | Objetivo | Resultado Esperado |
|---|---|---|---|
| **IT-AGENT-16** | `ProcessCustomerMessage` | El LLM propone un pedido válido (`CREATED`). | Crea el pedido vía `OrderPort`, descarta texto alucinado del modelo y formatea resumen con total exacto. |
| **IT-AGENT-17** | `ProcessCustomerMessage` | El pedido solicitado contiene productos agotados (`NO_VALID_ITEMS`). | Informa que no se pudo registrar el pedido y nombra los productos rechazados usando el catálogo real. |
| **IT-AGENT-18** | `ProcessCustomerMessage` | La conversación ya posee un pedido abierto (`uq_pedidos_conversacion_abierto`). | Responde informando que ya existe un pedido en curso (`CONVERSATION_ALREADY_HAS_ORDER`). |
| **IT-AGENT-19** | `ProcessCustomerMessage` | Ocurre un fallo inesperado al invocar la creación del pedido. | Responde con `ORDER_REGISTRATION_FAILED_TEXT` de forma segura sin exponer errores internos. |

#### 6.4. Control de Cuota y Consumo de Tokens de IA
| ID | Caso de Uso | Objetivo | Resultado Esperado |
|---|---|---|---|
| **IT-AGENT-20** | `ProcessCustomerMessage` | Procesar mensaje cuando el negocio agotó su cuota de tokens mensual (RNF-08). | El agente se silencia retornando `null` y no invoca al LLM ni a telemetría. |
| **IT-AGENT-21** | `ProcessCustomerMessage` | Negocio con cuota activa que genera respuesta exitosa. | Registra en `tokenUsagePort.record` los tokens de entrada, salida y modelo empleado. |
| **IT-AGENT-22** | `TokenUsagePort` | Intentar registrar consumo con valores de tokens negativos. | El adaptador in-memory rechaza la operación respaldando los constraints CHECK de la BD. |

---

### 7. Resultados de la Ejecución

#### 7.1. Resumen Global
La ejecución automatizada se llevó a cabo sobre la rama `feature/pruebas-agente` con el comando:
```bash
npm run test:agent:int -- --json --outputFile=test-results/agent-integration.json
```
La evidencia primaria quedó consolidada en el archivo `Backend/test-results/agent-integration.json`.

| Indicador | Valor Obtenido |
|---|---|
| **Suites ejecutadas** | **4 de 4 (100 %)** |
| **Casos de prueba ejecutados** | **22** |
| **Casos aprobados** | **22 (100 %)** |
| **Casos fallidos** | **0** |
| **Casos omitidos / pendientes** | **0** |
| **Aserciones verificadas** | **59** |
| **Duración total de la corrida** | **≈ 1,84 s** |
| **Resultado global (success)** | **true (APROBADO)** |

#### 7.2. Resultados por Suite

| Archivo de Suite | Área Funcional | Casos Aprobados | Estado |
|---|---|:---:|:---:|
| `configuracion-agente.integration.spec.ts` | Configuración del Agente (API HTTP REST) | 8 / 8 | **PASS** |
| `procesamiento-mensajes.integration.spec.ts` | Atención Conversacional y Procesamiento | 7 / 7 | **PASS** |
| `pedidos-agente.integration.spec.ts` | Creación Asistida de Pedidos | 4 / 4 | **PASS** |
| `consumo-cuota-ia.integration.spec.ts` | Control de Cuota y Telemetría de Tokens | 3 / 3 | **PASS** |

#### 7.3. Resultados Detallados por Caso de Prueba

| ID | Suite | Descripción del Caso | Resultado | Aserciones |
|---|---|---|:---:|:---:|
| **IT-AGENT-01** | `configuracion-agente` | Retorna configuración por defecto si el negocio no ha configurado su agente | **Aprobado** | 1 |
| **IT-AGENT-02** | `configuracion-agente` | Retorna configuración personalizada previamente persistida en repositorio | **Aprobado** | 1 |
| **IT-AGENT-03** | `configuracion-agente` | Rechaza con 401 Unauthorized si no se incluye token Bearer | **Aprobado** | 1 |
| **IT-AGENT-04** | `configuracion-agente` | Responde 404 NotFound si el usuario autenticado no tiene negocio | **Aprobado** | 1 |
| **IT-AGENT-05** | `configuracion-agente` | Actualiza parámetros del agente y los persiste en el repositorio | **Aprobado** | 2 |
| **IT-AGENT-06** | `configuracion-agente` | Bloquea edición con 403 PLAN_VENCIDO cuando el plan está vencido | **Aprobado** | 2 |
| **IT-AGENT-07** | `configuracion-agente` | Rechaza con 400 Bad Request valores inválidos de tono o estilo regional | **Aprobado** | 1 |
| **IT-AGENT-08** | `configuracion-agente` | Rechaza con 400 Bad Request si mensaje de bienvenida excede 500 caracteres | **Aprobado** | 1 |
| **IT-AGENT-09** | `procesamiento-mensajes` | Negocio inactivo (`businessActive: false`) silencia al agente (retorna null) | **Aprobado** | 2 |
| **IT-AGENT-10** | `procesamiento-mensajes` | Atención automática desactivada entrega mensaje no disponible sin llamar LLM | **Aprobado** | 4 |
| **IT-AGENT-11** | `procesamiento-mensajes` | Sin mensajes en conversación (`count = 0`) lanza `IncomingMessageNotPersistedError` | **Aprobado** | 2 |
| **IT-AGENT-12** | `procesamiento-mensajes` | Primer mensaje (`count = 1`) antepone bienvenida a la respuesta del LLM | **Aprobado** | 4 |
| **IT-AGENT-13** | `procesamiento-mensajes` | Mensajes posteriores (`count > 1`) no repiten bienvenida y pasan historial | **Aprobado** | 6 |
| **IT-AGENT-14** | `procesamiento-mensajes` | Si el LLM falla, responde con contingencia sin romper el flujo del cliente | **Aprobado** | 3 |
| **IT-AGENT-15** | `procesamiento-mensajes` | Si el registro de tokens falla, la respuesta igualmente se entrega | **Aprobado** | 2 |
| **IT-AGENT-16** | `pedidos-agente` | Propuesta válida del LLM crea el pedido y responde con resumen exacto | **Aprobado** | 9 |
| **IT-AGENT-17** | `pedidos-agente` | Productos agotados informan rechazo nombrando el catálogo real | **Aprobado** | 4 |
| **IT-AGENT-18** | `pedidos-agente` | Pedido abierto previo responde informando el pedido existente en curso | **Aprobado** | 3 |
| **IT-AGENT-19** | `pedidos-agente` | Fallo inesperado al crear pedido responde con contingencia segura | **Aprobado** | 2 |
| **IT-AGENT-20** | `consumo-cuota-ia` | Cuota de tokens agotada silencia al agente y no invoca al LLM | **Aprobado** | 3 |
| **IT-AGENT-21** | `consumo-cuota-ia` | Cuota disponible registra fielmente tokens de entrada y salida | **Aprobado** | 4 |
| **IT-AGENT-22** | `consumo-cuota-ia` | Adaptador rechaza tokens negativos según CHECK constraints de base de datos | **Aprobado** | 2 |

---

### 8. Defectos y Hallazgos
Durante la implementación e integración de la suite se identificaron y resolvieron los siguientes aspectos arquitecturales clave:
1. **Ciclo ESM de `@nestjs/throttler`:** Al ejecutarse Jest bajo Node.js con VM Modules (`--experimental-vm-modules`), la importación estática de controladores que consumen decoradores de `@nestjs/throttler` generaba una excepción de ciclo CJS/ESM. Se solventó implementando la carga dinámica de `AgentModule` en el método `initialize()` de `AgentTestApp`, garantizando que `@nestjs/common` esté completamente evaluado antes de resolver dependencias secundarias.
2. **Dependencias globales de módulos secundarios:** `OrdersModule` y `SubscriptionsModule` requerían providers globales provistos por `AppModule` en producción (`SupabaseService`, `ConfigService`, `EventEmitter2`). Se construyó `GlobalTestSupabaseModule` y se incorporaron `ConfigModule.forRoot({ isGlobal: true })` y `EventEmitterModule.forRoot()` en la configuración de montaje de prueba sin vulnerar el principio de importar `AgentModule` de forma autónoma.
3. **Idempotencia y anti-alucinación de pedidos:** Se constató que `ProcessCustomerMessageUseCase` descarta de forma intencional el texto libre devuelto por el LLM en el turno en que se crea un pedido, garantizando que el usuario solo reciba la confirmación estricta y verídica proveniente de la base de datos de órdenes.

---

### 9. Matriz de Trazabilidad

| Requisito / Objetivo | Casos que lo Verifican | Estado |
|---|---|:---:|
| **RF-22: Configuración del Agente** (Personalidad, tono, estilo regional, horarios) | IT-AGENT-01, IT-AGENT-02, IT-AGENT-05, IT-AGENT-07, IT-AGENT-08 | **Verificado** |
| **HU-8.5: Modo solo lectura con suscripción vencida** (`PlanActivoGuard`) | IT-AGENT-06 | **Verificado** |
| **Seguridad: Control de acceso con autenticación JWT** (`SupabaseAuthGuard`) | IT-AGENT-03, IT-AGENT-04 | **Verificado** |
| **RF-10: Atención al Cliente por WhatsApp** (Bienvenida y turnos) | IT-AGENT-10, IT-AGENT-11, IT-AGENT-12, IT-AGENT-13 | **Verificado** |
| **Resiliencia y Disponibilidad del Servicio Conversacional** | IT-AGENT-09, IT-AGENT-14, IT-AGENT-15 | **Verificado** |
| **RF-11: Gestión de Pedidos Asistidos por WhatsApp** | IT-AGENT-16, IT-AGENT-17, IT-AGENT-18, IT-AGENT-19 | **Verificado** |
| **RNF-08: Límite y Control de Cuota de Tokens de IA** | IT-AGENT-20, IT-AGENT-21, IT-AGENT-22 | **Verificado** |

---

### 10. Limitaciones y Trabajo Futuro
- **Pruebas End-to-End con el Webhook de Meta:** Ejecutar pruebas de aceptación integrando el dispatch directo desde el webhook real de WhatsApp hacia el agente.
- **Validación del prompt de Gemini en sandbox:** Diseñar pruebas de integración de adaptadores específicas para el cliente oficial de Gemini (`@google/genai`) utilizando cassettes HTTP grabados (VCR) para verificar los schemas de function calling sin costo por invocación.
- **Integración continua:** Incorporar `npm run test:agent:int` en el pipeline de GitHub Actions para ejecución automática en cada Pull Request a `develop`.

---

### 11. Conclusiones
Las 22 pruebas de integración desarrolladas y ejecutadas para el módulo del Agente confirman que este opera de manera robusta, consistente y aislada, cumpliendo al 100% con los estándares de calidad y arquitectura hexagonal del proyecto TREMIA.

Se validó con éxito que:
- La API HTTP protege las rutas con autenticación y respeta la política de suscripción activa de la plataforma.
- La lógica conversacional maneja adecuadamente las bienvenidas, las contingencias y el estado del negocio.
- El registro de órdenes delega de forma segura al módulo de pedidos sin riesgo de alucinación por parte del LLM.
- La telemetría y el corte de consumo ante agotamiento de cuota de tokens protegen los costos operativos del SaaS.

---

### 12. Anexo: Cómo Reproducir las Pruebas

1. Posicionarse en la rama de pruebas:
   ```bash
   git checkout feature/pruebas-agente
   ```
2. Acceder al directorio del Backend:
   ```bash
   cd Backend
   ```
3. Ejecutar la suite completa de integración del módulo del Agente:
   ```bash
   npm run test:agent:int
   ```
4. Para generar el reporte JSON de evidencia:
   ```bash
   npm run test:agent:int -- --json --outputFile=test-results/agent-integration.json
   ```

---

### 13. Bibliografía
- NestJS Documentation. (2026). *Testing Fundamentals & Integration Testing*. https://docs.nestjs.com/fundamentals/testing
- Jest Documentation. (2026). *ECMAScript Modules & CLI configuration*. https://jestjs.io/docs/ecmascript-modules
- Supertest. (2026). *HTTP assertions for Node.js*. https://github.com/ladjs/supertest
- IEEE. (2008). *IEEE Std 829-2008: Standard for Software and System Test Documentation*.
