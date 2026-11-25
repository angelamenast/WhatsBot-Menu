import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const js = ts.transpileModule(await read('../src/services/catalog-data.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { parseCatalogCSV } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('el CSV lee la columna categoria (con o sin tilde) y la deja en null si está vacía', () => {
  const rows = parseCatalogCSV('﻿nombre,precio,descripcion,categoría\nJugo,4000,Natural,Bebidas\nPan,1000,,\n');
  assert.deepEqual(rows, [
    { name: 'Jugo', price: 4000, description: 'Natural', category: 'Bebidas' },
    { name: 'Pan', price: 1000, description: null, category: null },
  ]);
});
test('un CSV sin columna categoria sigue funcionando', () => {
  assert.deepEqual(parseCatalogCSV('nombre;precio\nCafé;5000,5\n'), [{ name: 'Café', price: 5000.5, description: null, category: null }]);
});
test('una categoría de más de 80 caracteres se rechaza indicando la fila', () => {
  assert.throws(() => parseCatalogCSV(`nombre,precio,categoria\nJugo,4000,${'x'.repeat(81)}\n`), /categoría de la fila 2/);
});
test('el formulario envía la categoría, la tabla la muestra y la plantilla la incluye', async () => {
  const view = await read('../src/components/customization/CustomizationView.astro');
  assert.match(view, /id="product-category"[^>]*maxlength="80"[^>]*list="catalog-categories"/);
  assert.match(view, /<datalist id="catalog-categories">/);
  assert.match(view, /<th>Precio<\/th><th>Categoría<\/th><th>Descripción<\/th>/);
  const logic = await read('../src/services/customization.ts');
  assert.match(logic, /category:field\('product-category'\)\.value\.trim\(\)\|\|null/);
  assert.match(logic, /field\('product-category'\)\.value=item\.category\?\?''/);
  assert.match(logic, /nombre,precio,descripcion,categoria/);
});
test('el backend de /catalog recibe y devuelve la categoría', async () => {
  const dto = await read('../../Backend/src/modules/catalog/catalog.dto.ts');
  assert.match(dto, /@IsOptional\(\) @IsString\(\) @MaxLength\(80\) category\?: string \| null;/);
  const service = await read('../../Backend/src/modules/catalog/catalog.service.ts');
  assert.match(service, /categorias_producto\(nombre\)/);
  assert.match(service, /categoria_id:this\.categoryId\(ids,item\.category\)/);
});
