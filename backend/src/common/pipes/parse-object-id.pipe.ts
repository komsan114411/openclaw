import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

/**
 * Validates that a string is a valid MongoDB ObjectId
 * Use with @Param() to validate route parameters
 *
 * @example
 * @Get(':id')
 * async findOne(@Param('id', ParseObjectIdPipe) id: string) {
 *   return this.service.findById(id);
 * }
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) {
      throw new BadRequestException('ID is required');
    }

    if (!isValidObjectId(value)) {
      throw new BadRequestException('Invalid ID format');
    }

    return value;
  }
}
