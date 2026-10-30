import { ConfigService } from '@nestjs/config';

export const DEFAULT_WHATSAPP_API_VERSION = 'v25.0';

export interface MetaConfig {
  apiVersion: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
}

const REQUIRED_VARIABLES = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'] as const;

/**
 * Lee la configuración de la WhatsApp Cloud API. Se invoca al construir los adaptadores `meta`, así que
 * una variable ausente tumba el arranque con un mensaje claro en vez de fallar en el primer uso.
 * Los valores nunca se incluyen en los mensajes de error.
 */
export function loadMetaConfig(configService: ConfigService): MetaConfig {
  const missing = REQUIRED_VARIABLES.filter((name) => !configService.get<string>(name)?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Con proveedor de WhatsApp "meta" faltan variables de entorno: ${missing.join(', ')}.`,
    );
  }

  const apiVersion = configService.get<string>('WHATSAPP_API_VERSION')?.trim() || DEFAULT_WHATSAPP_API_VERSION;

  // La versión se interpola en la URL: solo se admite el formato "vNN.N".
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error(`WHATSAPP_API_VERSION inválida: "${apiVersion}". Usa el formato "v25.0".`);
  }

  return {
    apiVersion,
    accessToken: configService.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN').trim(),
    appSecret: configService.getOrThrow<string>('WHATSAPP_APP_SECRET').trim(),
    verifyToken: configService.getOrThrow<string>('WHATSAPP_VERIFY_TOKEN').trim(),
  };
}
