import { IsNotEmpty, IsString } from 'class-validator';

export class TwilioStatusCallbackDto {
  @IsNotEmpty()
  @IsString()
  MessageSid: string;

  @IsNotEmpty()
  @IsString()
  MessageStatus: string;
}
