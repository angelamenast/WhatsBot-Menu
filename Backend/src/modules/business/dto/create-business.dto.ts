import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  nombre_negocio: string;

  @IsString()
  @IsNotEmpty()
  numero_whatsapp: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}