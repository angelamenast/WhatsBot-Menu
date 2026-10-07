import { TransaccionPago, EstadoTransaccion } from '../entities/transaccion-pago.entity';

export interface CrearTransaccionData {
  suscripcionId: string;
  referenciaWompi: string;
  monto: number;
}

export interface TransaccionPagoRepository {
  crear(data: CrearTransaccionData): Promise<TransaccionPago>;
  buscarPorReferencia(referenciaWompi: string): Promise<TransaccionPago | null>;
  actualizarEstado(id: string, estado: EstadoTransaccion): Promise<void>;
}

export const TRANSACCION_PAGO_REPOSITORY = Symbol('TRANSACCION_PAGO_REPOSITORY');