import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Solo valida forma. Que la fecha exista en el calendario y que from <= to lo
 * decide ListOrdersByBusinessUseCase (InvalidOrderListFilterError → 400).
 * Requiere un ValidationPipe con transform: true para que limit/offset lleguen
 * como números y se apliquen los defaults (el pipe global no lo tiene).
 */
export class ListOrdersQueryDto {
  @IsOptional()
  @Matches(DATE_FORMAT, { message: 'from debe tener formato YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(DATE_FORMAT, { message: 'to debe tener formato YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
