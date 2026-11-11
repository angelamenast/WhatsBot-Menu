export class ProcesarWebhookPagoCommand {
  constructor(
    public readonly referenciaWompi: string,
    public readonly estadoTransaccion: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR',
  ) {}
}