import { IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RegisterRequestDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  telefono?: string;
}