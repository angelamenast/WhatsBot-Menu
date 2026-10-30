import { Logger } from '@nestjs/common';
import {
  MessagingWindowClosedError,
  WhatsappProviderAuthError,
  WhatsappProviderError,
  WhatsappProviderTimeoutError,
} from '../../domain/errors/whatsapp.errors';
import type { MetaConfig } from './meta-config';

const GRAPH_BASE_URL = 'https://graph.facebook.com';
const REQUEST_TIMEOUT_MS = 10_000;

// Códigos documentados en https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const ACCESS_TOKEN_ERROR_CODE = 190;
const REENGAGEMENT_WINDOW_ERROR_CODE = 131047;

interface GraphErrorBody {
  message: string;
  code: number | null;
  traceId: string | null;
}

export interface GraphRequest {
  method: 'GET' | 'POST';
  /** Relativo a la versión, sin "/" inicial: "{phone_number_id}/messages". */
  path: string;
  body?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Por nombre y no por instanceof: AbortSignal.timeout rechaza con un DOMException, que no siempre es
// `instanceof Error` (p. ej. entre contextos de ejecución distintos).
function isAbortError(error: unknown): boolean {
  return isRecord(error) && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function readGraphError(payload: unknown): GraphErrorBody {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};

  return {
    message: typeof error.message === 'string' ? error.message : 'Error sin detalle de la Graph API',
    code: typeof error.code === 'number' ? error.code : null,
    traceId: typeof error.fbtrace_id === 'string' ? error.fbtrace_id : null,
  };
}

/**
 * Cliente mínimo de la Graph API (fetch nativo, sin reintentos, 10 s de timeout). Lo comparten los
 * adaptadores de mensajería y de vinculación. Traduce los errores de la API a errores tipados del
 * dominio; en logs solo van `code`, `message` y `fbtrace_id`, nunca el token.
 */
export class MetaGraphClient {
  private readonly logger = new Logger(MetaGraphClient.name);

  constructor(private readonly config: Pick<MetaConfig, 'apiVersion' | 'accessToken'>) {}

  async request(request: GraphRequest): Promise<unknown> {
    const url = `${GRAPH_BASE_URL}/${this.config.apiVersion}/${request.path}`;

    let response: Response;
    let payload: unknown;

    try {
      response = await fetch(url, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      payload = await response.json().catch(() => null);
    } catch (error) {
      if (isAbortError(error)) {
        this.logger.error(`Timeout de ${REQUEST_TIMEOUT_MS} ms llamando a la Graph API`);
        throw new WhatsappProviderTimeoutError();
      }

      // No se registra el error original: podría traer la URL o cabeceras de la petición.
      this.logger.error('No se pudo contactar a la Graph API');
      throw new WhatsappProviderError('No se pudo contactar a la Graph API');
    }

    if (!response.ok) {
      throw this.toDomainError(readGraphError(payload), response.status);
    }

    return payload;
  }

  private toDomainError(error: GraphErrorBody, httpStatus: number): WhatsappProviderError {
    this.logger.error(
      `Error de la Graph API (HTTP ${httpStatus}): code=${error.code ?? 'desconocido'} message="${error.message}" fbtrace_id=${
        error.traceId ?? 'desconocido'
      }`,
    );

    switch (error.code) {
      case ACCESS_TOKEN_ERROR_CODE:
        return new WhatsappProviderAuthError(error.message, error.code, error.traceId);
      case REENGAGEMENT_WINDOW_ERROR_CODE:
        return new MessagingWindowClosedError(error.message, error.code, error.traceId);
      default:
        return new WhatsappProviderError(error.message, error.code, error.traceId);
    }
  }
}
