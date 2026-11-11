export interface ListOrdersCommand {
  businessId: string;
  /** YYYY-MM-DD en America/Bogota, inclusivo. */
  from?: string;
  /** YYYY-MM-DD en America/Bogota; el día completo queda incluido. */
  to?: string;
  limit: number;
  offset: number;
}
