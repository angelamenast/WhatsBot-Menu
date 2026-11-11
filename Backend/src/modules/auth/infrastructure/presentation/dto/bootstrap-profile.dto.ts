import { IsBoolean, IsOptional } from 'class-validator';
export class BootstrapProfileDto {
  @IsOptional()
  @IsBoolean()
  createProfile?: boolean;
}
