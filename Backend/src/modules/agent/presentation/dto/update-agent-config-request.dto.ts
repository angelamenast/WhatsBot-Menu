import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateAgentConfigRequestDto {
  @IsOptional()
  @IsString()
  personality?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  welcomeMessage?: string;

  @IsOptional()
  @IsObject()
  businessHours?: Record<string, unknown>;
}