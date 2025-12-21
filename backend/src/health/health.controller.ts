import { Controller, Get, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Optional() @InjectConnection() private readonly connection?: Connection,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    let dbStatus = 'not configured';
    try {
      if (this.connection) {
        dbStatus = this.connection.readyState === 1 ? 'connected' : 'disconnected';
      }
    } catch (e) {
      dbStatus = 'error';
    }
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbStatus,
      version: '2.0.0',
    };
  }
}
