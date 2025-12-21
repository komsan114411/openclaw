import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLineAccountDto {
  @ApiProperty({ example: 'My LINE OA' })
  @IsString()
  @IsNotEmpty()
  accountName: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  channelId: string;

  @ApiProperty({ example: 'channel-secret-xxx' })
  @IsString()
  @IsNotEmpty()
  channelSecret: string;

  @ApiProperty({ example: 'channel-access-token-xxx' })
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @ApiPropertyOptional({ example: 'My business LINE account' })
  @IsOptional()
  @IsString()
  description?: string;
}
