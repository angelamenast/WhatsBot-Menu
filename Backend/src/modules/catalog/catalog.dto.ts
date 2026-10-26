import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class CatalogProductDto {
 @Transform(({value})=>typeof value==='string'?value.trim():value)
 @IsString() @MinLength(1) @MaxLength(200) name!: string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) price!: number;
 @IsOptional() @IsString() @MaxLength(2000) description?: string;
 @IsOptional() @IsBoolean() available?: boolean;
}
export class ImportCatalogDto {
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>CatalogProductDto)
 items!: CatalogProductDto[];
}
