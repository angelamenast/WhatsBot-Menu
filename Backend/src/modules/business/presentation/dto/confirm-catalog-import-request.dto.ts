import { ArrayMaxSize, Allow, IsArray, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Only the structure is validated here. The VALUES are validated by the domain
// (planCatalogImport), so they are marked with @Allow to survive `whitelist: true`.
class CategoryRowRequestDto {
  @IsInt()
  @Min(1)
  row: number;

  @Allow()
  name: unknown;
}

class ProductRowRequestDto {
  @IsInt()
  @Min(1)
  row: number;

  @Allow()
  name: unknown;

  @Allow()
  category: unknown;

  @Allow()
  price: unknown;

  @Allow()
  description: unknown;

  @Allow()
  available: unknown;

  @Allow()
  imageUrl: unknown;
}

export class ConfirmCatalogImportRequestDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CategoryRowRequestDto)
  categories: CategoryRowRequestDto[];

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ProductRowRequestDto)
  products: ProductRowRequestDto[];
}
