import { IsNotEmpty, IsString } from 'class-validator';

export class TwilioWebhookDto {
  @IsNotEmpty()
  @IsString()
  From: string;

  @IsNotEmpty()
  @IsString()
  To: string;

  @IsNotEmpty()
  @IsString()
  Body: string;

  @IsNotEmpty()
  @IsString()
  MessageSid: string;
}
