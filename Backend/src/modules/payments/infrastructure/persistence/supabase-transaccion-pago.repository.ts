import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../../../shared/supabase/supabase.service';
import type { TransaccionPagoRepository, CrearTransaccionData } from '../../domain/repositories/transaccion-pago.repository';
import { TransaccionPago, EstadoTransaccion } from '../../domain/entities/transaccion-pago.entity';

@Injectable()
export class SupabaseTransaccionPagoRepository implements TransaccionPagoRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async crear(data: CrearTransaccionData): Promise<TransaccionPago> {
    const { data: row, error } = await this.supabaseService.getClient()
      .from('transacciones_pago')
      .insert({
        suscripcion_id: data.suscripcionId,
        referencia_wompi: data.referenciaWompi,
        monto: data.monto,
        estado: 'pendiente',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return new TransaccionPago(row.id, row.suscripcion_id, row.referencia_wompi, row.monto, row.estado);
  }

  async buscarPorReferencia(referenciaWompi: string): Promise<TransaccionPago | null> {
    const { data, error } = await this.supabaseService.getClient()
      .from('transacciones_pago')
      .select('*')
      .eq('referencia_wompi', referenciaWompi)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return new TransaccionPago(data.id, data.suscripcion_id, data.referencia_wompi, data.monto, data.estado);
  }

  async actualizarEstado(id: string, estado: EstadoTransaccion): Promise<void> {
    const { error } = await this.supabaseService.getClient()
      .from('transacciones_pago')
      .update({ estado })
      .eq('id', id);

    if (error) throw new Error(error.message);
  }
}