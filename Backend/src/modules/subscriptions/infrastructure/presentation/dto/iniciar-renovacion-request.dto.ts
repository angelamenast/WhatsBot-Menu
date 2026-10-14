import { IsBoolean, IsOptional } from 'class-validator';

export class IniciarRenovacionRequestDto {
  // HU-8.3 criterio 2: true cuando el usuario ya confirmó renovar un plan aún vigente.
  @IsOptional()
  @IsBoolean()
  confirmarRenovacionAnticipada?: boolean;
}
