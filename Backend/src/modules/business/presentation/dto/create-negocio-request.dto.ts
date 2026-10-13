import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateNegocioRequestDto {
  @IsNotEmpty()
  @IsString()
  nombre_negocio: string;

  @IsNotEmpty()
  @IsString()
  numero_whatsapp: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}