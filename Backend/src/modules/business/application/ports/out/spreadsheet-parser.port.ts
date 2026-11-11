import type { CatalogImportInput } from '../../../domain/services/plan-catalog-import';

export interface SpreadsheetParserPort {
  // Reads the raw rows of the catalog template. No business validation happens here.
  parseCatalog(file: Buffer): Promise<CatalogImportInput>;
}

export const SPREADSHEET_PARSER = Symbol('SPREADSHEET_PARSER');
