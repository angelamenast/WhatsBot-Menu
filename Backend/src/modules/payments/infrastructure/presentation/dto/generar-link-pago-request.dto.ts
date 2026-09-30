import { IsUUID, IsOptional } from 'class-validator';

export class GenerarLinkPagoRequestDto {
  @IsUUID()
  @IsOptional()
  negocioId?: string;

  @IsUUID()
  planId: string;
}