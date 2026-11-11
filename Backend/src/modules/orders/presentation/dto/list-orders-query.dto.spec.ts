import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ListOrdersQueryDto } from './list-orders-query.dto';

describe('ListOrdersQueryDto', () => {
  // Mismo pipe que usa el controller en @Query: el global no transforma.
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const parse = (query: Record<string, unknown>) =>
    pipe.transform(query, {
      type: 'query',
      metatype: ListOrdersQueryDto,
    }) as Promise<ListOrdersQueryDto>;

  it('sin parámetros: aplica los defaults limit=20 y offset=0', async () => {
    const dto = await parse({});

    expect(dto.limit).toBe(20);
    expect(dto.offset).toBe(0);
    expect(dto.from).toBeUndefined();
    expect(dto.to).toBeUndefined();
  });

  it('coerciona limit y offset de string a número', async () => {
    const dto = await parse({ limit: '50', offset: '100' });

    expect(dto.limit).toBe(50);
    expect(dto.offset).toBe(100);
    expect(typeof dto.limit).toBe('number');
    expect(typeof dto.offset).toBe('number');
  });

  it('acepta los límites: limit=1, limit=100, offset=0', async () => {
    await expect(parse({ limit: '1' })).resolves.toMatchObject({ limit: 1 });
    await expect(parse({ limit: '100' })).resolves.toMatchObject({ limit: 100 });
    await expect(parse({ offset: '0' })).resolves.toMatchObject({ offset: 0 });
  });

  it('acepta from y to con formato YYYY-MM-DD', async () => {
    const dto = await parse({ from: '2026-10-01', to: '2026-10-10' });

    expect(dto.from).toBe('2026-10-01');
    expect(dto.to).toBe('2026-10-10');
  });

  it.each([
    ['limit=0', { limit: '0' }],
    ['limit=101', { limit: '101' }],
    ['limit=-5', { limit: '-5' }],
    ['limit=abc', { limit: 'abc' }],
    ['limit=1.5', { limit: '1.5' }],
    ['offset=-1', { offset: '-1' }],
    ['offset=x', { offset: 'x' }],
    ['from mal formada (10/10/2026)', { from: '10/10/2026' }],
    ['from sin ceros (2026-1-5)', { from: '2026-1-5' }],
    ['to con hora (2026-10-10T00:00:00Z)', { to: '2026-10-10T00:00:00Z' }],
    ['to vacío', { to: '' }],
  ])('%s: rechaza con 400', async (_label, query) => {
    await expect(parse(query)).rejects.toThrow(BadRequestException);
  });

  it('descarta propiedades desconocidas (whitelist)', async () => {
    const dto = await parse({ limit: '5', businessId: 'otro-negocio' });

    expect(dto).not.toHaveProperty('businessId');
  });
});
