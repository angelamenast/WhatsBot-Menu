export class GenerarLinkPagoCommand {
  constructor(
    public readonly negocioId: string,
    public readonly planId: string,
    // Página del frontend a la que Wompi redirige después de pagar (WOMPI_REDIRECT_URL).
    public readonly redirectUrl: string,
  ) {}
}
