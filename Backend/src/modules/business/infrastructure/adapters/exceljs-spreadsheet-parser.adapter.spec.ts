import ExcelJS from 'exceljs';
import { ExcelJsSpreadsheetParserAdapter } from './exceljs-spreadsheet-parser.adapter';
import { InvalidCatalogFileError } from '../../domain/errors/catalog-import.errors';

async function buildFile(build: (workbook: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('ExcelJsSpreadsheetParserAdapter', () => {
  const parser = new ExcelJsSpreadsheetParserAdapter();

  it('reads categories and products with their Excel row numbers', async () => {
    const file = await buildFile((workbook) => {
      const categories = workbook.addWorksheet('Categorias');
      categories.addRow(['nombre']);
      categories.addRow(['Bebidas']);

      const products = workbook.addWorksheet('Productos');
      products.addRow(['nombre', 'categoria', 'precio', 'descripcion', 'disponible', 'imagen_url']);
      products.addRow(['Gaseosa 400ml', 'Bebidas', 4000, 'Fría', 'SI', null]);
    });

    const result = await parser.parseCatalog(file);

    expect(result.categories).toEqual([{ row: 2, name: 'Bebidas' }]);
    expect(result.products).toEqual([
      {
        row: 2,
        name: 'Gaseosa 400ml',
        category: 'Bebidas',
        price: 4000,
        description: 'Fría',
        available: 'SI',
        imageUrl: null,
      },
    ]);
  });

  it('matches sheet and column names ignoring case and accents, in any column order', async () => {
    const file = await buildFile((workbook) => {
      const categories = workbook.addWorksheet('Categorías');
      categories.addRow(['Nombre']);
      categories.addRow(['Postres']);

      const products = workbook.addWorksheet('PRODUCTOS');
      products.addRow(['Precio', 'Categoría', 'Nombre']);
      products.addRow([9500, 'Postres', 'Brownie']);
    });

    const result = await parser.parseCatalog(file);

    expect(result.products[0]).toMatchObject({ name: 'Brownie', category: 'Postres', price: 9500 });
  });

  it('skips empty rows, keeps real row numbers and ignores extra sheets', async () => {
    const file = await buildFile((workbook) => {
      workbook.addWorksheet('Instrucciones').addRow(['Lee esto primero']);

      const categories = workbook.addWorksheet('Categorias');
      categories.addRow(['nombre']);
      categories.addRow(['Bebidas']);

      const products = workbook.addWorksheet('Productos');
      products.addRow(['nombre', 'categoria', 'precio']);
      products.addRow(['Gaseosa', 'Bebidas', 4000]);
      products.addRow([]);
      products.addRow(['   ', null, null]);
      products.addRow(['Jugo', 'Bebidas', 5000]);
    });

    const result = await parser.parseCatalog(file);

    expect(result.products.map((p) => p.row)).toEqual([2, 5]);
  });

  it('flattens formulas and rich text, and keeps text prices as text so validation can reject them', async () => {
    const file = await buildFile((workbook) => {
      const categories = workbook.addWorksheet('Categorias');
      categories.addRow(['nombre']);
      categories.addRow([{ richText: [{ text: 'Beb' }, { text: 'idas' }] }]);

      const products = workbook.addWorksheet('Productos');
      products.addRow(['nombre', 'categoria', 'precio']);
      products.addRow(['Gaseosa', 'Bebidas', { formula: '2000*2', result: 4000 }]);
      products.addRow(['Jugo', 'Bebidas', '$5.000']);
    });

    const result = await parser.parseCatalog(file);

    expect(result.categories[0].name).toBe('Bebidas');
    expect(result.products.map((p) => p.price)).toEqual([4000, '$5.000']);
  });

  it('fails when a sheet is missing', async () => {
    const file = await buildFile((workbook) => {
      workbook.addWorksheet('Categorias').addRow(['nombre']);
    });

    await expect(parser.parseCatalog(file)).rejects.toThrow('Falta la hoja "Productos"');
  });

  it('fails when a required column is missing', async () => {
    const file = await buildFile((workbook) => {
      workbook.addWorksheet('Categorias').addRow(['nombre']);
      workbook.addWorksheet('Productos').addRow(['nombre', 'categoria']);
    });

    await expect(parser.parseCatalog(file)).rejects.toThrow('En la hoja "Productos" falta la columna "precio"');
  });

  it('rejects files that are not xlsx', async () => {
    await expect(parser.parseCatalog(Buffer.from('nombre,precio\nGaseosa,4000'))).rejects.toThrow(
      InvalidCatalogFileError,
    );
    await expect(parser.parseCatalog(Buffer.from('PK-but-not-really-a-zip'))).rejects.toThrow(
      InvalidCatalogFileError,
    );
  });
});
