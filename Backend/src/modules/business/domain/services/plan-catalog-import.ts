import { Category } from '../entities/category.entity';
import { Product } from '../entities/product.entity';
import { normalizeName } from './normalize-name';
export type CatalogSheet = 'Categorias' | 'Productos';

export interface RawCategoryRow {
  row: number;
  name: unknown;
}

export interface RawProductRow {
  row: number;
  name: unknown;
  category: unknown;
  price: unknown;
  description: unknown;
  available: unknown;
  imageUrl: unknown;
}

export interface CatalogImportInput {
  categories: RawCategoryRow[];
  products: RawProductRow[];
}

export interface CatalogImportIssue {
  sheet: CatalogSheet;
  row: number;
  message: string;
}

export type ProductField = 'category' | 'price' | 'description' | 'available' | 'imageUrl';

export interface PlannedCategory {
  name: string;
  action: 'create' | 'existing';
  existingId: string | null;
}

export interface PlannedProduct {
  row: number;
  name: string;
  categoryName: string;
  price: number;
  description: string | null;
  available: boolean;
  imageUrl: string | null;
  action: 'create' | 'update' | 'unchanged';
  existingId: string | null;
  previousPrice: number | null;
  changedFields: ProductField[];
  needsPriceReview: boolean;
}

export interface CatalogImportPlan {
  categories: PlannedCategory[];
  products: PlannedProduct[];
  issues: CatalogImportIssue[];
}

// numeric(12,2) in Postgres
export const MAX_PRICE = 9_999_999_999.99;
// A price change bigger than this (50%) is flagged for the owner to double-check
export const PRICE_REVIEW_THRESHOLD = 0.5;

const TRUE_VALUES = new Set(['si', 's', 'true', '1', 'yes', 'y']);
const FALSE_VALUES = new Set(['no', 'n', 'false', '0']);

function toCleanText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function parsePrice(value: unknown): { price: number } | { error: string } {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return { error: 'El precio es obligatorio' };
  }
  // Never guess a price: "$12.000" could mean twelve thousand or twelve
  if (typeof value !== 'number') {
    return { error: 'El precio debe ser un número, sin símbolos ni separadores (ej. 4500)' };
  }
  if (!Number.isFinite(value) || value < 0) {
    return { error: 'El precio debe ser un número mayor o igual a 0' };
  }
  if (value > MAX_PRICE) {
    return { error: 'El precio es demasiado alto' };
  }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    return { error: 'El precio admite máximo 2 decimales' };
  }
  return { price: Math.round(value * 100) / 100 };
}

function parseAvailable(value: unknown): { available: boolean } | { error: string } {
  const text = toCleanText(value);
  if (text === null) {
    return { available: true }; // empty cell defaults to available
  }
  const key = normalizeName(text);
  if (TRUE_VALUES.has(key)) return { available: true };
  if (FALSE_VALUES.has(key)) return { available: false };
  return { error: 'El valor de "disponible" debe ser SI o NO' };
}

function parseImageUrl(value: unknown): { imageUrl: string | null } | { error: string } {
  const text = toCleanText(value);
  if (text === null) {
    return { imageUrl: null };
  }
  if (!/^https?:\/\/\S+$/i.test(text)) {
    return { error: 'La imagen debe ser un enlace que empiece por http:// o https://' };
  }
  return { imageUrl: text };
}

function samePrice(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * Pure planning step shared by "preview" and "confirm": validates the raw rows and compares
 * them against what the business already has. It never touches the database.
 *
 * Rules (decided with the team):
 *  - categories are processed first and become a map normalizedName -> category;
 *  - a product whose category is not in the categories sheet is rejected (never auto-created);
 *  - invalid rows are reported and left out; valid rows still go through;
 *  - products are matched with existing ones by normalized name within the business.
 */
export function planCatalogImport(
  input: CatalogImportInput,
  existingCategories: Category[],
  existingProducts: Product[],
): CatalogImportPlan {
  const issues: CatalogImportIssue[] = [];

  // ---- 1. categories ----
  const existingCategoryByKey = new Map(
    existingCategories.map((category) => [normalizeName(category.name), category] as const),
  );
  const plannedCategories = new Map<string, PlannedCategory>();
  const categoryRowByKey = new Map<string, number>();

  for (const raw of input.categories) {
    const name = toCleanText(raw.name);
    if (name === null) {
      issues.push({ sheet: 'Categorias', row: raw.row, message: 'El nombre de la categoría es obligatorio' });
      continue;
    }

    const key = normalizeName(name);
    if (plannedCategories.has(key)) {
      issues.push({
        sheet: 'Categorias',
        row: raw.row,
        message: `La categoría "${name}" está repetida (ya aparece en la fila ${categoryRowByKey.get(key)})`,
      });
      continue;
    }

    const existing = existingCategoryByKey.get(key);
    plannedCategories.set(
      key,
      existing
        ? { name: existing.name, action: 'existing', existingId: existing.id }
        : { name, action: 'create', existingId: null },
    );
    categoryRowByKey.set(key, raw.row);
  }

  // ---- 2. products ----
  const existingProductByKey = new Map(
    existingProducts.map((product) => [normalizeName(product.name), product] as const),
  );
  const categoryNameById = new Map(existingCategories.map((category) => [category.id, category.name] as const));
  const productRowByKey = new Map<string, number>();
  const products: PlannedProduct[] = [];

  for (const raw of input.products) {
    const problems: string[] = [];

    const name = toCleanText(raw.name);
    if (name === null) {
      problems.push('El nombre del producto es obligatorio');
    }

    let categoryName: string | null = null;
    const categoryText = toCleanText(raw.category);
    if (categoryText === null) {
      problems.push('La categoría es obligatoria');
    } else {
      const category = plannedCategories.get(normalizeName(categoryText));
      if (category) {
        categoryName = category.name;
      } else {
        problems.push(`La categoría "${categoryText}" no está en la hoja Categorias`);
      }
    }

    const priceResult = parsePrice(raw.price);
    if ('error' in priceResult) problems.push(priceResult.error);

    const availableResult = parseAvailable(raw.available);
    if ('error' in availableResult) problems.push(availableResult.error);

    const imageResult = parseImageUrl(raw.imageUrl);
    if ('error' in imageResult) problems.push(imageResult.error);

    const description = toCleanText(raw.description);

    let key: string | null = null;
    if (name !== null) {
      key = normalizeName(name);
      const firstRow = productRowByKey.get(key);
      if (firstRow !== undefined) {
        problems.push(`El producto "${name}" está repetido (ya aparece en la fila ${firstRow})`);
      } else {
        productRowByKey.set(key, raw.row);
      }
    }

    if (
      problems.length > 0 ||
      name === null ||
      key === null ||
      categoryName === null ||
      'error' in priceResult ||
      'error' in availableResult ||
      'error' in imageResult
    ) {
      for (const message of problems) {
        issues.push({ sheet: 'Productos', row: raw.row, message });
      }
      continue;
    }

    const { price } = priceResult;
    const { available } = availableResult;
    const { imageUrl } = imageResult;
    const existing = existingProductByKey.get(key);

    if (!existing) {
      products.push({
        row: raw.row,
        name,
        categoryName,
        price,
        description,
        available,
        imageUrl,
        action: 'create',
        existingId: null,
        previousPrice: null,
        changedFields: [],
        needsPriceReview: false,
      });
      continue;
    }

    const changedFields: ProductField[] = [];
    const currentCategoryName = existing.categoryId ? categoryNameById.get(existing.categoryId) : undefined;
    if (currentCategoryName === undefined || normalizeName(currentCategoryName) !== normalizeName(categoryName)) {
      changedFields.push('category');
    }
    if (!samePrice(existing.price, price)) changedFields.push('price');
    if ((existing.description ?? null) !== description) changedFields.push('description');
    if (existing.available !== available) changedFields.push('available');
    if ((existing.imageUrl ?? null) !== imageUrl) changedFields.push('imageUrl');

    const priceChanged = changedFields.includes('price');
    products.push({
      row: raw.row,
      name,
      categoryName,
      price,
      description,
      available,
      imageUrl,
      action: changedFields.length === 0 ? 'unchanged' : 'update',
      existingId: existing.id,
      previousPrice: existing.price,
      changedFields,
      needsPriceReview:
        priceChanged && existing.price > 0 && Math.abs(price - existing.price) / existing.price > PRICE_REVIEW_THRESHOLD,
    });
  }

  return { categories: [...plannedCategories.values()], products, issues };
}
