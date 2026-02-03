import { IsArray, IsString, IsOptional, IsBoolean, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for batch operations on multiple LINE sessions
 */
export class BatchOperationDto {
  @ApiProperty({
    description: 'Array of session identifiers (can be ObjectId or lineAccountId)',
    example: ['session1', 'session2'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  sessionIds: string[];

  @ApiPropertyOptional({
    description: 'Force the operation even if some conditions are not met',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/**
 * DTO for batch relogin operation
 */
export class BatchReloginDto extends BatchOperationDto {
  @ApiPropertyOptional({
    description: 'Source of the relogin request',
    enum: ['manual', 'auto', 'scheduled'],
    default: 'manual',
  })
  @IsOptional()
  @IsString()
  source?: 'manual' | 'auto' | 'scheduled';
}

/**
 * Result for a single operation in a batch
 */
export interface BatchOperationResult {
  sessionId: string;
  success: boolean;
  message?: string;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Response for batch operations
 */
export interface BatchOperationResponse {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchOperationResult[];
}
