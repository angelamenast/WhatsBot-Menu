import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { CatalogImportController } from './catalog-import.controller';
import { PreviewCatalogImportUseCase } from '../../application/use-cases/preview-catalog-import.use-case';
import { SPREADSHEET_PARSER } from '../../application/ports/out/spreadsheet-parser.port';
import { ExcelJsSpreadsheetParserAdapter } from '../../infrastructure/adapters/exceljs-spreadsheet-parser.adapter';
import { NEGOCIO_REPOSITORY } from '../../domain/repositories/negocio.repository';
import { CATEGORY_REPOSITORY } from '../../domain/repositories/category.repository';
import { PRODUCT_REPOSITORY } from '../../domain/repositories/product.repository';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/presentation/guards/supabase-auth.guard';
import { Negocio } from '../../domain/entities/negocio.entity';

async function validXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const categories = workbook.addWorksheet('Categorias');
  categories.addRow(['nombre']);
  categories.addRow(['Bebidas']);
  const products = workbook.addWorksheet('Productos');
  products.addRow(['nombre', 'categoria', 'precio']);
  products.addRow(['Gaseosa 400ml', 'Bebidas', 4000]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('POST /business/catalog/import/preview', () => {
  let app: INestApplication;
  const businessRepository = { buscarPorUsuario: jest.fn(), existeNegocioActivoPorUsuario: jest.fn(), crear: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogImportController],
      providers: [
        PreviewCatalogImportUseCase,
        { provide: SPREADSHEET_PARSER, useClass: ExcelJsSpreadsheetParserAdapter },
        { provide: NEGOCIO_REPOSITORY, useValue: businessRepository },
        { provide: CATEGORY_REPOSITORY, useValue: { listByBusiness: jest.fn().mockResolvedValue([]) } },
        { provide: PRODUCT_REPOSITORY, useValue: { listByBusiness: jest.fn().mockResolvedValue([]) } },
      ],
    })
      .overrideGuard(SupabaseAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    businessRepository.buscarPorUsuario.mockResolvedValue(
      new Negocio('biz-1', 'user-1', 'My Business', '+573001234567', 'activo', null),
    );
  });

  it('returns the preview for a valid file', async () => {
    const response = await request(app.getHttpServer())
      .post('/business/catalog/import/preview')
      .attach('file', await validXlsx(), 'catalog.xlsx');

    expect(response.status).toBe(200);
    expect(response.body.summary).toEqual({
      categoriesToCreate: 1,
      productsToCreate: 1,
      productsToUpdate: 0,
      productsUnchanged: 0,
      rejectedRows: 0,
    });
  });

  it('returns 400 when no file is sent', async () => {
    const response = await request(app.getHttpServer()).post('/business/catalog/import/preview');
    expect(response.status).toBe(400);
  });

  it('returns 422 for a file that is not an xlsx', async () => {
    const response = await request(app.getHttpServer())
      .post('/business/catalog/import/preview')
      .attach('file', Buffer.from('nombre,precio'), 'catalog.csv');

    expect(response.status).toBe(422);
  });

  it('returns 413 when the file is bigger than 2 MB', async () => {
    const response = await request(app.getHttpServer())
      .post('/business/catalog/import/preview')
      .attach('file', Buffer.alloc(2 * 1024 * 1024 + 10), 'big.xlsx');

    expect(response.status).toBe(413);
  });

  it('returns 404 when the user has no business', async () => {
    businessRepository.buscarPorUsuario.mockResolvedValue(null);

    const response = await request(app.getHttpServer())
      .post('/business/catalog/import/preview')
      .attach('file', await validXlsx(), 'catalog.xlsx');

    expect(response.status).toBe(404);
  });
});
