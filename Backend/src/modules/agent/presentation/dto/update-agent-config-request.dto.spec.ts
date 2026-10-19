import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MAX_BUSINESS_HOURS_BYTES,
  MAX_TEXT_LENGTH,
  UpdateAgentConfigRequestDto,
} from './update-agent-config-request.dto';

const errorsFor = async (payload: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(plainToInstance(UpdateAgentConfigRequestDto, payload));
  return errors.map((error) => error.property);
};

describe('UpdateAgentConfigRequestDto', () => {
  it('acepta un body vacío y un body completo válido', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
    await expect(
      errorsFor({
        personality: 'Cálida',
        tone: 'CERCANO',
        regionalStyle: 'COSTENO',
        welcomeMessage: 'Hola',
        unavailableMessage: 'Cerrado',
        businessHours: { lunes: '8-18' },
      }),
    ).resolves.toEqual([]);
  });

  it('null limpia el valor: se acepta en todos los campos', async () => {
    await expect(
      errorsFor({
        personality: null,
        tone: null,
        regionalStyle: null,
        welcomeMessage: null,
        unavailableMessage: null,
        businessHours: null,
      }),
    ).resolves.toEqual([]);
  });

  it('rechaza un tono o estilo regional fuera del enum', async () => {
    await expect(errorsFor({ tone: 'GRACIOSO' })).resolves.toEqual(['tone']);
    await expect(errorsFor({ tone: 'formal' })).resolves.toEqual(['tone']);
    await expect(errorsFor({ regionalStyle: 'PASTUSO' })).resolves.toEqual(['regionalStyle']);
  });

  it.each(['personality', 'welcomeMessage', 'unavailableMessage'])(
    '%s: acepta exactamente el máximo y rechaza uno más',
    async (field) => {
      await expect(errorsFor({ [field]: 'a'.repeat(MAX_TEXT_LENGTH) })).resolves.toEqual([]);
      await expect(errorsFor({ [field]: 'a'.repeat(MAX_TEXT_LENGTH + 1) })).resolves.toEqual([field]);
    },
  );

  it('businessHours: rechaza lo que serializado supera 4 KB y acepta lo que cabe', async () => {
    const overhead = JSON.stringify({ d: '' }).length;
    const fits = { d: 'x'.repeat(MAX_BUSINESS_HOURS_BYTES - overhead) };
    const tooBig = { d: 'x'.repeat(MAX_BUSINESS_HOURS_BYTES - overhead + 1) };

    await expect(errorsFor({ businessHours: fits })).resolves.toEqual([]);
    await expect(errorsFor({ businessHours: tooBig })).resolves.toEqual(['businessHours']);
  });

  it('businessHours: el tamaño se mide en bytes UTF-8, no en caracteres', async () => {
    const overhead = JSON.stringify({ d: '' }).length;
    const charsThatFit = MAX_BUSINESS_HOURS_BYTES - overhead;

    // 'ñ' ocupa 2 bytes: la mitad de caracteres ya llena el cupo.
    await expect(errorsFor({ businessHours: { d: 'ñ'.repeat(charsThatFit) } })).resolves.toEqual([
      'businessHours',
    ]);
  });

  it('businessHours debe ser un objeto', async () => {
    await expect(errorsFor({ businessHours: 'lunes a viernes' })).resolves.toEqual(['businessHours']);
  });
});
