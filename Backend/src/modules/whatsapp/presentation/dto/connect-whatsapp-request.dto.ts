import { IsString, Matches } from 'class-validator';

// Los identificadores de Meta son numéricos.
const META_ID_PATTERN = /^\d{1,32}$/;

export class ConnectWhatsappRequestDto {
  @IsString()
  @Matches(META_ID_PATTERN, { message: 'phoneNumberId debe ser el identificador numérico del número en Meta' })
  phoneNumberId: string;

  @IsString()
  @Matches(META_ID_PATTERN, { message: 'wabaId debe ser el identificador numérico de la cuenta de WhatsApp Business' })
  wabaId: string;
}
