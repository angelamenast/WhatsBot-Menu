export class GenerarLinkPagoCommand {
  constructor(
    public readonly negocioId: string,
    public readonly planId: string,
  ) {}
}