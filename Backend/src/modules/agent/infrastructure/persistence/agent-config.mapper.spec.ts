import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { AgentConfigMapper, ConfiguracionAgenteRow } from './agent-config.mapper';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { AgentConfig } from '../../domain/entities/agent-config.entity';

describe('AgentConfigMapper', () => {
  let warnSpy: ReturnType<typeof jest.spyOn>;

  const aRow = (overrides: Partial<ConfiguracionAgenteRow> = {}): ConfiguracionAgenteRow => ({
    id: 'config-1',
    negocio_id: 'business-1',
    personalidad: 'Cálida y directa',
    tono: 'FORMAL',
    estilo_regional: 'PAISA',
    mensaje_bienvenida: 'Hola',
    mensaje_no_disponible: 'Cerrado',
    horario_atencion: { lunes: '8-18' },
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-02T10:00:00.000Z',
    ...overrides,
  });

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('mapea una fila válida sin avisos', () => {
    const config = AgentConfigMapper.toDomain(aRow());

    expect(config.tone).toBe(AgentTone.FORMAL);
    expect(config.regionalStyle).toBe(AgentRegionalStyle.PAISA);
    expect(config.unavailableMessage).toBe('Cerrado');
    expect(config.businessHours).toEqual({ lunes: '8-18' });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('tono desconocido (texto libre viejo): se lee como null, no falla y avisa solo con ids', () => {
    const config = AgentConfigMapper.toDomain(aRow({ tono: 'muy gracioso y relajado' }));

    expect(config.tone).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('config-1');
    expect(message).toContain('business-1');
    expect(message).not.toContain('gracioso');
  });

  it('estilo regional desconocido: se lee como null y avisa', () => {
    const config = AgentConfigMapper.toDomain(aRow({ estilo_regional: 'pastuso' }));

    expect(config.regionalStyle).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).not.toContain('pastuso');
  });

  it('null en la BD no es "desconocido": no avisa y se interpreta como AMABLE y NEUTRO', () => {
    const config = AgentConfigMapper.toDomain(aRow({ tono: null, estilo_regional: null }));

    expect(config.tone).toBeNull();
    expect(config.regionalStyle).toBeNull();
    expect(config.effectiveTone).toBe(AgentTone.AMABLE);
    expect(config.effectiveRegionalStyle).toBe(AgentRegionalStyle.NEUTRO);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('toPersistence escribe las columnas reales y no incluye created_at', () => {
    const row = AgentConfigMapper.toPersistence(AgentConfigMapper.toDomain(aRow()));

    expect(row).toMatchObject({
      id: 'config-1',
      negocio_id: 'business-1',
      personalidad: 'Cálida y directa',
      tono: 'FORMAL',
      estilo_regional: 'PAISA',
      mensaje_bienvenida: 'Hola',
      mensaje_no_disponible: 'Cerrado',
      horario_atencion: { lunes: '8-18' },
    });
    expect(row).not.toHaveProperty('created_at');
  });

  it('la config por defecto tiene tono y estilo null (y se aplican AMABLE y NEUTRO)', () => {
    const config = AgentConfig.default('business-1');

    expect(config.tone).toBeNull();
    expect(config.effectiveTone).toBe(AgentTone.AMABLE);
    expect(config.effectiveRegionalStyle).toBe(AgentRegionalStyle.NEUTRO);
  });
});
