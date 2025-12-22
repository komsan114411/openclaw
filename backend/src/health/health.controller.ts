import { Controller, Get, Query, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional() private readonly healthService?: HealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Simple health check for load balancers' })
  async check() {
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

  @Get('detailed')
  @ApiOperation({ summary: 'Detailed health check with service status' })
  @ApiQuery({ name: 'includeExternal', required: false, type: Boolean })
  async detailedCheck(
    @Query('includeExternal') includeExternal: string = 'false',
  ) {
    if (!this.healthService) {
      return {
        status: 'error',
        message: 'Health service not available',
        timestamp: new Date().toISOString(),
      };
    }

    const shouldCheckExternal = includeExternal === 'true';
    return this.healthService.checkHealth(shouldCheckExternal);
  }

  @Get('ping')
  @ApiOperation({ summary: 'Quick ping endpoint' })
  async ping() {
    if (this.healthService) {
      return this.healthService.ping();
    }
    return { status: 'ok', timestamp: new Date() };
  }

  @Get('cached')
  @ApiOperation({ summary: 'Get cached health status' })
  getCachedHealth() {
    if (!this.healthService) {
      return {
        status: 'error',
        message: 'Health service not available',
      };
    }

    const cached = this.healthService.getCachedHealth();
    if (cached) {
      return cached;
    }

    return {
      status: 'unknown',
      message: 'No cached health data available yet',
    };
  }
}
