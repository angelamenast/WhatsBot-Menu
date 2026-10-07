import { IsNotEmpty, IsString } from 'class-validator';

export class ConnectWhatsappRequestDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber: string;
}
