import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import { planCatalogImport } from './plan-catalog-import';
import type { CatalogImportInput, RawProductRow } from './plan-catalog-import';

const BUSINESS_ID = 'biz-1';

function productRow(overrides: Partial<RawProductRow> & { row: number }): RawProductRow {
  return {
    name: 'Gaseosa 400ml',
    category: 'Bebidas',
    price: 4000,
    description: null,
    available: null,
    imageUrl: null,
    ...overrides,
  };
}

function input(overrides: Partial<CatalogImportInput> = {}): CatalogImportInput {
  return {
    categories: [{ row: 2, name: 'Bebidas' }],
    products: [productRow({ row: 2 })],
    ...overrides,
  };
}

describe('planCatalogImport', () => {
  describe('categories', () => {
    it('plans new categories to be created, keeping the owner text', () => {
      const plan = planCatalogImport(input({ categories: [{ row: 2, name: '  Bebidas ' }] }), [], []);

      expect(plan.categories).toEqual([{ name: 'Bebidas', action: 'create', existingId: null }]);
    });

    it('reuses an existing category ignoring case and accents, and keeps the stored name', () => {
      const existing = [new Category('cat-1', BUSINESS_ID, 'Postres')];
      const plan = planCatalogImport(
        input({ categories: [{ row: 2, name: 'PÓSTRES' }], products: [] }),
        existing,
        [],
      );

      expect(plan.categories).toEqual([{ name: 'Postres', action: 'existing', existingId: 'cat-1' }]);
    });

    it('rejects empty and duplicated category rows', () => {
      const plan = planCatalogImport(
        input({
          categories: [
            { row: 2, name: 'Bebidas' },
            { row: 3, name: '   ' },
            { row: 4, name: 'bebidas' },
          ],
          products: [],
        }),
        [],
        [],
      );

      expect(plan.categories).toHaveLength(1);
      expect(plan.issues).toEqual([
        { sheet: 'Categorias', row: 3, message: 'El nombre de la categoría es obligatorio' },
        { sheet: 'Categorias', row: 4, message: 'La categoría "bebidas" está repetida (ya aparece en la fila 2)' },
      ]);
    });
  });

  describe('products', () => {
    it('plans a valid new product', () => {
      const plan = planCatalogImport(
        input({ products: [productRow({ row: 2, description: ' Fría ', available: 'NO' })] }),
        [],
        [],
      );

      expect(plan.issues).toEqual([]);
      expect(plan.products).toEqual([
        {
          row: 2,
          name: 'Gaseosa 400ml',
          categoryName: 'Bebidas',
          price: 4000,
          description: 'Fría',
          available: false,
          imageUrl: null,
          action: 'create',
          existingId: null,
          previousPrice: null,
          changedFields: [],
          needsPriceReview: false,
        },
      ]);
    });

    it('rejects a product whose category is not in the categories sheet, even if it exists in the database', () => {
      const existing = [new Category('cat-9', BUSINESS_ID, 'Postres')];
      const plan = planCatalogImport(
        input({ products: [productRow({ row: 5, name: 'Brownie', category: 'Postres' })] }),
        existing,
        [],
      );

      expect(plan.products).toEqual([]);
      expect(plan.issues).toEqual([
        { sheet: 'Productos', row: 5, message: 'La categoría "Postres" no está en la hoja Categorias' },
      ]);
    });

    it('does not confuse singular and plural category names (no guessing)', () => {
      const plan = planCatalogImport(
        input({
          categories: [{ row: 2, name: 'Postres' }],
          products: [productRow({ row: 2, name: 'Brownie', category: 'Postre' })],
        }),
        [],
        [],
      );

      expect(plan.products).toEqual([]);
      expect(plan.issues[0].message).toContain('"Postre"');
    });

    it('rejects missing name and missing category', () => {
      const plan = planCatalogImport(
        input({ products: [productRow({ row: 2, name: null, category: '' })] }),
        [],
        [],
      );

      expect(plan.issues.map((issue) => issue.message)).toEqual([
        'El nombre del producto es obligatorio',
        'La categoría es obligatoria',
      ]);
    });

    it.each([
      ['text price', '$12.000', 'El precio debe ser un número'],
      ['negative price', -1, 'El precio debe ser un número mayor o igual a 0'],
      ['empty price', null, 'El precio es obligatorio'],
      ['3 decimals', 4500.555, 'El precio admite máximo 2 decimales'],
      ['too high', 1e12, 'El precio es demasiado alto'],
    ])('rejects an invalid price (%s)', (_label, price, expectedMessage) => {
      const plan = planCatalogImport(input({ products: [productRow({ row: 2, price })] }), [], []);

      expect(plan.products).toEqual([]);
      expect(plan.issues[0].message).toContain(expectedMessage);
    });

    it('accepts a price of 0 and prices with up to 2 decimals', () => {
      const plan = planCatalogImport(
        input({
          products: [
            productRow({ row: 2, name: 'Agua', price: 0 }),
            productRow({ row: 3, name: 'Café', price: 3500.5 }),
          ],
        }),
        [],
        [],
      );

      expect(plan.issues).toEqual([]);
      expect(plan.products.map((p) => p.price)).toEqual([0, 3500.5]);
    });

    it.each([
      [null, true],
      ['', true],
      ['SI', true],
      ['Sí', true],
      ['no', false],
      ['NO', false],
      [true, true],
      [false, false],
    ])('parses "disponible" %p as %p', (value, expected) => {
      const plan = planCatalogImport(input({ products: [productRow({ row: 2, available: value })] }), [], []);

      expect(plan.products[0].available).toBe(expected);
    });

    it('rejects an unknown "disponible" value and a bad image link', () => {
      const plan = planCatalogImport(
        input({ products: [productRow({ row: 2, available: 'quizás', imageUrl: 'foto.png' })] }),
        [],
        [],
      );

      expect(plan.issues.map((issue) => issue.message)).toEqual([
        'El valor de "disponible" debe ser SI o NO',
        'La imagen debe ser un enlace que empiece por http:// o https://',
      ]);
    });

    it('rejects a repeated product name inside the file but keeps the first one', () => {
      const plan = planCatalogImport(
        input({
          products: [
            productRow({ row: 2, name: 'Gaseosa 400ml' }),
            productRow({ row: 3, name: 'gaseosa  400ML' }),
          ],
        }),
        [],
        [],
      );

      expect(plan.products).toHaveLength(1);
      expect(plan.issues).toEqual([
        {
          sheet: 'Productos',
          row: 3,
          message: 'El producto "gaseosa  400ML" está repetido (ya aparece en la fila 2)',
        },
      ]);
    });

    it('keeps valid rows when other rows are rejected', () => {
      const plan = planCatalogImport(
        input({
          products: [
            productRow({ row: 2, name: 'Gaseosa 400ml' }),
            productRow({ row: 3, name: 'Jugo', price: 'abc' }),
          ],
        }),
        [],
        [],
      );

      expect(plan.products.map((p) => p.name)).toEqual(['Gaseosa 400ml']);
      expect(plan.issues).toHaveLength(1);
    });
  });

  describe('comparison with the existing catalog', () => {
    const existingCategories = [new Category('cat-1', BUSINESS_ID, 'Bebidas')];
    const existingProduct = new Product('prod-1', BUSINESS_ID, 'cat-1', 'Gaseosa 400ml', null, 4000, true, null);

    it('marks an identical product as unchanged', () => {
      const plan = planCatalogImport(input(), existingCategories, [existingProduct]);

      expect(plan.products[0]).toMatchObject({ action: 'unchanged', existingId: 'prod-1', changedFields: [] });
    });

    it('matches by normalized name and reports the price change', () => {
      const plan = planCatalogImport(
        input({ products: [productRow({ row: 2, name: ' gaseosa 400ML ', price: 4500 })] }),
        existingCategories,
        [existingProduct],
      );

      expect(plan.products[0]).toMatchObject({
        action: 'update',
        existingId: 'prod-1',
        previousPrice: 4000,
        price: 4500,
        changedFields: ['price'],
        needsPriceReview: false,
      });
    });

    it('flags big price changes for review (typo guard)', () => {
      const plan = planCatalogImport(
        input({ products: [productRow({ row: 2, price: 40000 })] }),
        existingCategories,
        [existingProduct],
      );

      expect(plan.products[0].needsPriceReview).toBe(true);
    });

    it('detects changes in category, description, availability and image', () => {
      const plan = planCatalogImport(
        input({
          categories: [{ row: 2, name: 'Bebidas' }, { row: 3, name: 'Jugos' }],
          products: [
            productRow({
              row: 2,
              category: 'Jugos',
              description: 'Nueva',
              available: 'NO',
              imageUrl: 'https://img.test/a.png',
            }),
          ],
        }),
        existingCategories,
        [existingProduct],
      );

      expect(plan.products[0].changedFields).toEqual(['category', 'description', 'available', 'imageUrl']);
    });

    it('ignores soft-deleted or absent products: products missing from the file are not touched', () => {
      const other = new Product('prod-2', BUSINESS_ID, 'cat-1', 'Agua', null, 2000, true, null);
      const plan = planCatalogImport(input(), existingCategories, [existingProduct, other]);

      expect(plan.products.map((p) => p.name)).toEqual(['Gaseosa 400ml']);
    });
  });
});
