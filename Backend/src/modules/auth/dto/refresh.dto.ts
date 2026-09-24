import { IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @IsNotEmpty()
  refresh_token: string;
}