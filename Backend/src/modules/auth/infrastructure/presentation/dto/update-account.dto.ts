import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateAccountDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsString() currentPassword?: string;
}
