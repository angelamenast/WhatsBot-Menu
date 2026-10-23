import { AgentRegionalStyle, AgentTone } from '../../../domain/enums/agent-style';
import {
  FORMAL_REGIONAL_LIMIT,
  REGIONAL_STYLE_GUIDE,
  REGIONAL_STYLE_MODERATION,
  TONE_GUIDE,
} from './style-dictionaries';

describe('diccionarios de estilo', () => {
  it.each(Object.values(AgentTone))('el tono %s tiene texto de prompt', (tone) => {
    expect(TONE_GUIDE[tone].length).toBeGreaterThan(20);
  });

  it.each(Object.values(AgentRegionalStyle))('el estilo regional %s tiene texto de prompt', (style) => {
    expect(REGIONAL_STYLE_GUIDE[style].length).toBeGreaterThan(20);
  });

  it('no hay claves de más: los diccionarios cubren exactamente los enums', () => {
    expect(Object.keys(TONE_GUIDE).sort()).toEqual(Object.values(AgentTone).sort());
    expect(Object.keys(REGIONAL_STYLE_GUIDE).sort()).toEqual(Object.values(AgentRegionalStyle).sort());
  });

  it('las guías de tono describen el trato pedido', () => {
    expect(TONE_GUIDE[AgentTone.FORMAL]).toMatch(/usted/);
    expect(TONE_GUIDE[AgentTone.FORMAL]).toMatch(/sin emojis/);
    expect(TONE_GUIDE[AgentTone.AMABLE]).toMatch(/tú/);
    expect(TONE_GUIDE[AgentTone.SEGURO]).toMatch(/conciso/);
  });

  it('las guías regionales traen los saludos y expresiones pedidos', () => {
    expect(REGIONAL_STYLE_GUIDE[AgentRegionalStyle.PAISA]).toMatch(/Qué más, pues/);
    expect(REGIONAL_STYLE_GUIDE[AgentRegionalStyle.PAISA]).toMatch(/parce/);
    expect(REGIONAL_STYLE_GUIDE[AgentRegionalStyle.COSTENO]).toMatch(/mi reina/);
    expect(REGIONAL_STYLE_GUIDE[AgentRegionalStyle.CALENO]).toMatch(/mijo/);
    expect(REGIONAL_STYLE_GUIDE[AgentRegionalStyle.BOGOTANO]).toMatch(/de una/);
  });

  it('la instrucción común pide moderación y el límite formal prohíbe la jerga', () => {
    expect(REGIONAL_STYLE_MODERATION).toMatch(/sutil/);
    expect(REGIONAL_STYLE_MODERATION).toMatch(/nunca en cada frase/);
    expect(FORMAL_REGIONAL_LIMIT).toMatch(/sin jerga/);
  });
});
