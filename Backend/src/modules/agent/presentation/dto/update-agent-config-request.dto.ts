import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { AgentRegionalStyle, AgentTone } from '../../domain/enums/agent-style';
import { MaxJsonSize } from '../validators/max-json-size.validator';

export const MAX_TEXT_LENGTH = 500;
export const MAX_BUSINESS_HOURS_BYTES = 4096;

// @IsOptional() deja pasar undefined (no tocar) y null (borrar el valor).
export class UpdateAgentConfigRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  personality?: string | null;

  @IsOptional()
  @IsEnum(AgentTone)
  tone?: AgentTone | null;

  @IsOptional()
  @IsEnum(AgentRegionalStyle)
  regionalStyle?: AgentRegionalStyle | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  welcomeMessage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  unavailableMessage?: string | null;

  @IsOptional()
  @IsObject()
  @MaxJsonSize(MAX_BUSINESS_HOURS_BYTES)
  businessHours?: Record<string, unknown> | null;
}
