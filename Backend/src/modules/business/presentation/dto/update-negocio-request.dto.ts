import { IsString, IsOptional } from 'class-validator';

export class UpdateNegocioRequestDto {
  @IsString()
  @IsOptional()
  nombre_negocio?: string;

  @IsString()
  @IsOptional()
  numero_whatsapp?: string;

  @IsString()
  @IsOptional()
  descripcion?: string;
}
