import { IsBoolean } from 'class-validator';

export class CambiarAtencionAutomaticaRequestDto {
  @IsBoolean()
  activa: boolean;
}
