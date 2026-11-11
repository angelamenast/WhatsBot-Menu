import { IsNotEmpty } from 'class-validator';

export class RefreshRequestDto {
  @IsNotEmpty()
  refresh_token: string;
}