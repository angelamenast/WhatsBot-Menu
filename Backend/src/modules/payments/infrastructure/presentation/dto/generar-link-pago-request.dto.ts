import { IsNotEmpty, IsUUID } from 'class-validator';

export class GenerarLinkPagoRequestDto {
  @IsUUID()
  negocioId: string;

  @IsUUID()
  planId: string;
}