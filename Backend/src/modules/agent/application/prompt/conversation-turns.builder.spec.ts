import type { HistoryMessage } from '../../domain/repositories/conversation-history.repository';
import { buildConversationTurns, MAX_CHAT_MESSAGE_LENGTH } from './conversation-turns.builder';

const message = (sender: HistoryMessage['sender'], content: string): HistoryMessage => ({
  sender,
  content,
  createdAt: new Date(),
});

describe('buildConversationTurns', () => {
  it('historial en orden con roles neutros y el mensaje actual al final como user', () => {
    const turns = buildConversationTurns(
      [message('CUSTOMER', 'hola'), message('AGENT', 'buenas')],
      'quiero una hamburguesa',
    );

    expect(turns).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'buenas' },
      { role: 'user', content: 'quiero una hamburguesa' },
    ]);
  });

  it('recorta cada mensaje a 1000 caracteres, también el actual', () => {
    const long = 'x'.repeat(5000);
    const turns = buildConversationTurns([message('CUSTOMER', long)], long);

    for (const turn of turns) {
      expect(turn.content).toHaveLength(MAX_CHAT_MESSAGE_LENGTH);
    }
  });

  it('omite los mensajes de historial que quedan vacíos', () => {
    const turns = buildConversationTurns([message('CUSTOMER', '   '), message('AGENT', 'hola')], 'x');

    expect(turns.map((turn) => turn.content)).toEqual(['hola', 'x']);
  });

  it('sin historial devuelve solo el mensaje actual', () => {
    expect(buildConversationTurns([], 'hola')).toEqual([{ role: 'user', content: 'hola' }]);
  });
});
