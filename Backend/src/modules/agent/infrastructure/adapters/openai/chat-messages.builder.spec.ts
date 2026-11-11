import type { HistoryMessage } from '../../../domain/repositories/conversation-history.repository';
import { buildChatMessages, MAX_CHAT_MESSAGE_LENGTH } from './chat-messages.builder';

const message = (sender: HistoryMessage['sender'], content: string): HistoryMessage => ({
  sender,
  content,
  createdAt: new Date(),
});

describe('buildChatMessages', () => {
  it('system primero, luego el historial en orden y al final el mensaje actual como user', () => {
    const messages = buildChatMessages(
      'SISTEMA',
      [message('CUSTOMER', 'hola'), message('AGENT', 'buenas'), message('CUSTOMER', 'quiero una hamburguesa')],
      'sí, confírmalo',
    );

    expect(messages).toEqual([
      { role: 'system', content: 'SISTEMA' },
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'buenas' },
      { role: 'user', content: 'quiero una hamburguesa' },
      { role: 'user', content: 'sí, confírmalo' },
    ]);
  });

  it('cliente → user y agente → assistant', () => {
    const messages = buildChatMessages('S', [message('CUSTOMER', 'a'), message('AGENT', 'b')], 'c');

    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });

  it('solo hay un mensaje system y es el primero: nada del cliente se concatena a él', () => {
    const messages = buildChatMessages('SISTEMA FIJO', [message('CUSTOMER', 'ORDEN-MALICIOSA')], 'OTRA-ORDEN');

    expect(messages.filter((m) => m.role === 'system')).toHaveLength(1);
    expect(messages[0].content).toBe('SISTEMA FIJO');
    expect(messages[0].content).not.toContain('ORDEN-MALICIOSA');
    expect(messages[0].content).not.toContain('OTRA-ORDEN');
  });

  it('recorta cada mensaje (historial y actual) a 1000 caracteres', () => {
    const long = 'x'.repeat(5000);
    const messages = buildChatMessages('S', [message('CUSTOMER', long), message('AGENT', long)], long);

    for (const m of messages.slice(1)) {
      expect(m.content).toHaveLength(MAX_CHAT_MESSAGE_LENGTH);
      expect(m.content.endsWith('…')).toBe(true);
    }
    expect(MAX_CHAT_MESSAGE_LENGTH).toBe(1000);
  });

  it('un mensaje de exactamente 1000 caracteres no se recorta', () => {
    const exact = 'y'.repeat(1000);

    expect(buildChatMessages('S', [], exact)[1].content).toBe(exact);
  });

  it('quita caracteres de control pero NO toca < ni > (es contenido de usuario, no del system prompt)', () => {
    const control = String.fromCharCode(0) + String.fromCharCode(27);
    const messages = buildChatMessages('S', [message('CUSTOMER', 'a' + control + '<b>')], 'ok');

    expect(messages[1].content).toBe('a<b>');
  });

  it('omite los mensajes de historial que quedan vacíos', () => {
    const messages = buildChatMessages('S', [message('CUSTOMER', '   '), message('AGENT', 'hola')], 'x');

    expect(messages.map((m) => m.content)).toEqual(['S', 'hola', 'x']);
  });

  it('sin historial: system + mensaje actual', () => {
    expect(buildChatMessages('S', [], 'hola').map((m) => m.role)).toEqual(['system', 'user']);
  });
});
