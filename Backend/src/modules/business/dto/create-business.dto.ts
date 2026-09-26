import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBusinessDto {
  @IsNotEmpty()
  @IsString()
  nombre_negocio: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}