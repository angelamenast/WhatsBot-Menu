// The uploaded file cannot be read as a catalog (wrong format, missing sheet or column, ...).
export class InvalidCatalogFileError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class CatalogTooLargeError extends Error {
  constructor(public readonly maxRows: number) {
    super(`El archivo supera el máximo de ${maxRows} filas por hoja`);
  }
}
