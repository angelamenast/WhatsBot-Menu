import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { SpreadsheetParserPort } from '../../application/ports/out/spreadsheet-parser.port';
import type {
  CatalogImportInput,
  RawCategoryRow,
  RawProductRow,
} from '../../domain/services/plan-catalog-import';
import { InvalidCatalogFileError } from '../../domain/errors/catalog-import.errors';
import { normalizeName } from '../../domain/services/normalize-name';

// Sheet and column names are the contract of the Excel template (user-facing, so in Spanish).
// Matching ignores case and accents: "Categorías" and "categorias" are the same sheet.
const CATEGORIES_SHEET = { label: 'Categorias', key: 'categorias' };
const PRODUCTS_SHEET = { label: 'Productos', key: 'productos' };

interface ColumnDefinition {
  header: string;
  required: boolean;
}

const CATEGORY_COLUMNS = {
  name: { header: 'nombre', required: true },
} satisfies Record<string, ColumnDefinition>;

const PRODUCT_COLUMNS = {
  name: { header: 'nombre', required: true },
  category: { header: 'categoria', required: true },
  price: { header: 'precio', required: true },
  description: { header: 'descripcion', required: false },
  available: { header: 'disponible', required: false },
  imageUrl: { header: 'imagen_url', required: false },
} satisfies Record<string, ColumnDefinition>;

// Flattens exceljs cell values (rich text, formulas, hyperlinks, ...) into plain primitives
function toPrimitive(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('result' in value) return toPrimitive(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text);
    if ('error' in value) return String(value.error);
    return null;
  }
  return value;
}

@Injectable()
export class ExcelJsSpreadsheetParserAdapter implements SpreadsheetParserPort {
  async parseCatalog(file: Buffer): Promise<CatalogImportInput> {
    // .xlsx files are zip archives, which start with the bytes "PK"
    if (file.length < 4 || file[0] !== 0x50 || file[1] !== 0x4b) {
      throw new InvalidCatalogFileError('El archivo no es un Excel válido (.xlsx)');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
    } catch {
      throw new InvalidCatalogFileError(
        'No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido y que no esté dañado',
      );
    }

    const categoriesSheet = this.findSheet(workbook, CATEGORIES_SHEET);
    const productsSheet = this.findSheet(workbook, PRODUCTS_SHEET);

    const categories: RawCategoryRow[] = this.readRows(categoriesSheet, CATEGORIES_SHEET.label, CATEGORY_COLUMNS).map(
      ({ row, values }) => ({ row, name: values.name }),
    );

    const products: RawProductRow[] = this.readRows(productsSheet, PRODUCTS_SHEET.label, PRODUCT_COLUMNS).map(
      ({ row, values }) => ({
        row,
        name: values.name,
        category: values.category,
        price: values.price,
        description: values.description,
        available: values.available,
        imageUrl: values.imageUrl,
      }),
    );

    return { categories, products };
  }

  private findSheet(workbook: ExcelJS.Workbook, sheet: { label: string; key: string }): ExcelJS.Worksheet {
    const found = workbook.worksheets.find((worksheet) => normalizeName(worksheet.name) === sheet.key);
    if (!found) {
      throw new InvalidCatalogFileError(`Falta la hoja "${sheet.label}" en el archivo`);
    }
    return found;
  }

  // The header must be in row 1. Returns the rows below it that have at least one value.
  private readRows<T extends Record<string, ColumnDefinition>>(
    sheet: ExcelJS.Worksheet,
    label: string,
    columns: T,
  ): { row: number; values: Record<keyof T, unknown> }[] {
    const columnByField = new Map<keyof T, number>();

    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const text = toPrimitive(cell.value);
      if (typeof text !== 'string') return;

      const headerKey = normalizeName(text);
      for (const field of Object.keys(columns) as (keyof T)[]) {
        if (columns[field].header === headerKey && !columnByField.has(field)) {
          columnByField.set(field, columnNumber);
        }
      }
    });

    for (const field of Object.keys(columns) as (keyof T)[]) {
      if (columns[field].required && !columnByField.has(field)) {
        throw new InvalidCatalogFileError(`En la hoja "${label}" falta la columna "${columns[field].header}"`);
      }
    }

    const rows: { row: number; values: Record<keyof T, unknown> }[] = [];

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const values = {} as Record<keyof T, unknown>;
      let hasContent = false;

      for (const field of Object.keys(columns) as (keyof T)[]) {
        const columnNumber = columnByField.get(field);
        const value = columnNumber === undefined ? null : toPrimitive(row.getCell(columnNumber).value);
        values[field] = value;
        if (value !== null && !(typeof value === 'string' && value.trim() === '')) {
          hasContent = true;
        }
      }

      if (hasContent) {
        rows.push({ row: rowNumber, values });
      }
    });

    return rows;
  }
}
