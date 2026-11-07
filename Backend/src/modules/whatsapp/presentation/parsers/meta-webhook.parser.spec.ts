import { parseMetaWebhook } from './meta-webhook.parser';

const PHONE_NUMBER_ID = '106540352242922';

const textMessage = (id: string, from = '573001111111', body = 'Hola') => ({
  from,
  id,
  timestamp: '1700000000',
  type: 'text',
  text: { body },
});

const payload = (value: Record<string, unknown>, field = 'messages') => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '102290129340398',
      changes: [
        {
          field,
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550253483', phone_number_id: PHONE_NUMBER_ID },
            ...value,
          },
        },
      ],
    },
  ],
});

describe('parseMetaWebhook', () => {
  const empty = { messages: [], statuses: [], unsupportedMessageTypes: [] };

  it('mensaje de texto: extrae phone_number_id, remitente, texto y wamid', () => {
    const result = parseMetaWebhook(
      payload({
        contacts: [{ profile: { name: 'Cliente' }, wa_id: '573001111111' }],
        messages: [textMessage('wamid.AAA', '573001111111', 'Quiero ver el menú')],
      }),
    );

    expect(result).toEqual({
      messages: [
        {
          phoneNumberId: PHONE_NUMBER_ID,
          customerNumber: '573001111111',
          text: 'Quiero ver el menú',
          providerMessageId: 'wamid.AAA',
        },
      ],
      statuses: [],
      unsupportedMessageTypes: [],
    });
  });

  it.each(['sent', 'delivered', 'read'])('estado "%s": extrae wamid y estado', (status) => {
    const result = parseMetaWebhook(
      payload({ statuses: [{ id: 'wamid.BBB', status, recipient_id: '573001111111' }] }),
    );

    expect(result).toEqual({
      ...empty,
      statuses: [{ providerMessageId: 'wamid.BBB', status }],
    });
  });

  it('estado failed: incluye code y message del primer error', () => {
    const result = parseMetaWebhook(
      payload({
        statuses: [
          {
            id: 'wamid.CCC',
            status: 'failed',
            errors: [
              { code: 131047, title: 'Re-engagement message', message: 'Re-engagement message' },
              { code: 1, message: 'otro' },
            ],
          },
        ],
      }),
    );

    expect(result.statuses).toEqual([
      {
        providerMessageId: 'wamid.CCC',
        status: 'failed',
        error: { code: 131047, message: 'Re-engagement message' },
      },
    ]);
  });

  it('estado failed sin errors o con error malformado: sin detalle', () => {
    const result = parseMetaWebhook(
      payload({
        statuses: [
          { id: 'wamid.1', status: 'failed' },
          { id: 'wamid.2', status: 'failed', errors: [{ code: 'x' }] },
        ],
      }),
    );

    expect(result.statuses).toEqual([
      { providerMessageId: 'wamid.1', status: 'failed' },
      { providerMessageId: 'wamid.2', status: 'failed' },
    ]);
  });

  it('mensaje y estado mezclados en el mismo value', () => {
    const result = parseMetaWebhook(
      payload({
        messages: [textMessage('wamid.M1')],
        statuses: [{ id: 'wamid.S1', status: 'delivered' }],
      }),
    );

    expect(result.messages).toHaveLength(1);
    expect(result.statuses).toEqual([{ providerMessageId: 'wamid.S1', status: 'delivered' }]);
  });

  it('varios mensajes y estados, también en varios entry/changes', () => {
    const body = {
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [textMessage('wamid.1'), textMessage('wamid.2', '573002222222', 'Hola 2')],
                statuses: [
                  { id: 'wamid.S1', status: 'sent' },
                  { id: 'wamid.S2', status: 'read' },
                ],
              },
            },
          ],
        },
        {
          changes: [
            {
              field: 'messages',
              value: {
                metadata: { phone_number_id: '222' },
                messages: [textMessage('wamid.3')],
              },
            },
          ],
        },
      ],
    };

    const result = parseMetaWebhook(body);

    expect(result.messages.map((m) => [m.providerMessageId, m.phoneNumberId])).toEqual([
      ['wamid.1', PHONE_NUMBER_ID],
      ['wamid.2', PHONE_NUMBER_ID],
      ['wamid.3', '222'],
    ]);
    expect(result.statuses.map((s) => s.providerMessageId)).toEqual(['wamid.S1', 'wamid.S2']);
  });

  it('tipos no textuales: se descartan y se reportan sus tipos, sin contenido del cliente', () => {
    const result = parseMetaWebhook(
      payload({
        messages: [
          { from: '573001111111', id: 'wamid.IMG', type: 'image', image: { id: 'media-1', caption: 'secreto' } },
          { from: '573001111111', id: 'wamid.AUD', type: 'audio', audio: { id: 'media-2' } },
          textMessage('wamid.TXT'),
        ],
      }),
    );

    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['wamid.TXT']);
    expect(result.unsupportedMessageTypes).toEqual(['image', 'audio']);
    expect(JSON.stringify(result)).not.toContain('secreto');
  });

  it('mensaje sin type se reporta como "unknown"', () => {
    const result = parseMetaWebhook(payload({ messages: [{ from: '573001111111', id: 'wamid.X' }] }));

    expect(result.messages).toEqual([]);
    expect(result.unsupportedMessageTypes).toEqual(['unknown']);
  });

  it('ignora los changes cuyo field no es "messages"', () => {
    const result = parseMetaWebhook(
      payload({ messages: [textMessage('wamid.1')] }, 'message_template_status_update'),
    );

    expect(result).toEqual(empty);
  });

  it('estado con status desconocido se descarta', () => {
    const result = parseMetaWebhook(payload({ statuses: [{ id: 'wamid.1', status: 'deleted' }] }));

    expect(result).toEqual(empty);
  });

  it('texto sin body, sin remitente, sin id o sin phone_number_id: se descarta sin lanzar', () => {
    const incomplete = parseMetaWebhook(
      payload({
        messages: [
          { from: '573001111111', id: 'wamid.1', type: 'text', text: {} },
          { id: 'wamid.2', type: 'text', text: { body: 'x' } },
          { from: '573001111111', type: 'text', text: { body: 'x' } },
        ],
      }),
    );
    const noMetadata = parseMetaWebhook({
      entry: [{ changes: [{ field: 'messages', value: { messages: [textMessage('wamid.1')] } }] }],
    });

    expect(incomplete).toEqual(empty);
    expect(noMetadata).toEqual(empty);
  });

  it.each([
    ['payload vacío', {}],
    ['entry vacío', { entry: [] }],
    ['changes vacío', { entry: [{ changes: [] }] }],
    ['null', null],
    ['undefined', undefined],
    ['un string', 'texto'],
    ['un número', 42],
    ['un array', []],
    ['entry no es array', { entry: 'x' }],
    ['changes con nulos', { entry: [null, { changes: [null, 1, 'x'] }] }],
    ['value no es objeto', { entry: [{ changes: [{ field: 'messages', value: 'x' }] }] }],
    ['messages no es array', { entry: [{ changes: [{ field: 'messages', value: { messages: {} } }] }] }],
  ])('payload inesperado (%s): devuelve vacío sin lanzar', (_label, body) => {
    expect(parseMetaWebhook(body)).toEqual(empty);
  });
});
