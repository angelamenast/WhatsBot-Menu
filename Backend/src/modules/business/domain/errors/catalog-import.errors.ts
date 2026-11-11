import type { CatalogImportIssue } from '../services/plan-catalog-import';

export class InvalidCatalogFileError extends Error {
  constructor(message: string) {
    super(message);
  }
}
export class CatalogImportRejectedError extends Error {
  constructor(public readonly issues: CatalogImportIssue[]) {
    super('El catálogo tiene filas inválidas; corrígelas antes de confirmar');
  }
}

export class CatalogTooLargeError extends Error {
  constructor(public readonly maxRows: number) {
    super(`El archivo supera el máximo de ${maxRows} filas por hoja`);
  }
}

