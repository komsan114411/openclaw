import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../database/schemas/user.schema';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import axios from 'axios';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    slipApi: ServiceHealth;
    aiApi: ServiceHealth;
  };
  metrics: {
    memoryUsage: number;
    heapUsage: number;
    activeConnections?: number;
  };
}

export interface ServiceHealth {
  status: 'up' | 'down' | 'degraded' | 'unconfigured';
  latency?: number;
  message?: string;
  lastChecked: Date;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private startTime = Date.now();
  private lastHealthCheck: HealthStatus | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private redisService: RedisService,
    private systemSettingsService: SystemSettingsService,
  ) {
    // Start periodic health check
    this.startPeriodicHealthCheck();
  }

  private startPeriodicHealthCheck() {
    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth(false);
      } catch (error) {
        this.logger.error('Periodic health check failed:', error);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Get comprehensive health status
   */
  async checkHealth(includeExternal = true): Promise<HealthStatus> {
    const now = new Date();
    const services: HealthStatus['services'] = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      slipApi: includeExternal ? await this.checkSlipApi() : this.getCachedOrUnconfigured('slipApi'),
      aiApi: includeExternal ? await this.checkAiApi() : this.getCachedOrUnconfigured('aiApi'),
    };

    // Calculate overall status
    const serviceStatuses = Object.values(services).map(s => s.status);
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (serviceStatuses.includes('down')) {
      // Critical services down
      if (services.database.status === 'down') {
        overallStatus = 'unhealthy';
      } else {
        overallStatus = 'degraded';
      }
    } else if (serviceStatuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    const memoryUsage = process.memoryUsage();
    
    const status: HealthStatus = {
      status: overallStatus,
      timestamp: now,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      services,
      metrics: {
        memoryUsage: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapUsage: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      },
    };

    this.lastHealthCheck = status;
    return status;
  }

  /**
   * Get cached health status or return unconfigured
   */
  private getCachedOrUnconfigured(service: string): ServiceHealth {
    if (this.lastHealthCheck?.services) {
      const cached = (this.lastHealthCheck.services as any)[service];
      if (cached) return cached;
    }
    return {
      status: 'unconfigured',
      lastChecked: new Date(),
    };
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.userModel.findOne().maxTimeMS(5000).lean();
      return {
        status: 'up',
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return {
        status: 'down',
        message: (error as Error).message,
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const redisStatus = this.redisService.getStatus();
      
      if (redisStatus.connected) {
        // Test actual operation
        await this.redisService.set('health:check', Date.now().toString(), 60);
        return {
          status: 'up',
          latency: Date.now() - start,
          lastChecked: new Date(),
        };
      } else {
        return {
          status: 'degraded',
          message: `Using ${redisStatus.mode} fallback`,
          lastChecked: new Date(),
        };
      }
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return {
        status: 'degraded',
        message: 'Redis unavailable, using memory fallback',
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check Slip Verification API health
   */
  private async checkSlipApi(): Promise<ServiceHealth> {
    try {
      const settings = await this.systemSettingsService.getSettings();
      
      if (!settings?.slipApiKey) {
        return {
          status: 'unconfigured',
          message: 'API key not configured',
          lastChecked: new Date(),
        };
      }

      const start = Date.now();
      const response = await axios.get('https://api.thunder.in.th/v1/me', {
        headers: { Authorization: `Bearer ${settings.slipApiKey}` },
        timeout: 10000,
      });

      if (response.status === 200) {
        return {
          status: 'up',
          latency: Date.now() - start,
          message: `Quota: ${response.data?.data?.remainingQuota || 'N/A'}`,
          lastChecked: new Date(),
        };
      }

      return {
        status: 'degraded',
        message: 'Unexpected response',
        lastChecked: new Date(),
      };
    } catch (error: any) {
      const status = error.response?.status;
      
      if (status === 401 || status === 403) {
        return {
          status: 'down',
          message: 'Invalid API key',
          lastChecked: new Date(),
        };
      }
      
      return {
        status: 'down',
        message: (error as Error).message,
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Check AI API health
   */
  private async checkAiApi(): Promise<ServiceHealth> {
    try {
      const settings = await this.systemSettingsService.getSettings();
      
      if (!settings?.aiApiKey) {
        return {
          status: 'unconfigured',
          message: 'API key not configured',
          lastChecked: new Date(),
        };
      }

      const start = Date.now();
      // Just check if API key format is valid (don't make actual call to save costs)
      if (settings.aiApiKey.startsWith('sk-') && settings.aiApiKey.length > 20) {
        return {
          status: 'up',
          latency: Date.now() - start,
          message: 'API key configured',
          lastChecked: new Date(),
        };
      }

      return {
        status: 'degraded',
        message: 'API key format may be invalid',
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        status: 'down',
        message: (error as Error).message,
        lastChecked: new Date(),
      };
    }
  }

  /**
   * Simple health check for load balancers
   */
  async ping(): Promise<{ status: 'ok' | 'error'; timestamp: Date }> {
    try {
      // Quick database check
      await this.userModel.findOne().maxTimeMS(3000).lean();
      return { status: 'ok', timestamp: new Date() };
    } catch {
      return { status: 'error', timestamp: new Date() };
    }
  }

  /**
   * Get cached health status
   */
  getCachedHealth(): HealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}
