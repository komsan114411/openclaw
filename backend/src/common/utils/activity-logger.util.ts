import { Logger } from '@nestjs/common';
import { ActivityLogsService } from '../../activity-logs/activity-logs.service';
import { ActivityActorRole } from '../../database/schemas/activity-log.schema';

export interface ActivityLogParams {
  actorUserId?: string;
  actorRole: ActivityActorRole;
  subjectUserId?: string;
  action: string;
  entityId?: string;
  entityType: string;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Safe activity logging - never fails the main transaction
 * Use this utility to log activities without risking the main operation
 */
export async function logActivitySafe(
  activityLogsService: ActivityLogsService,
  logger: Logger,
  params: ActivityLogParams,
): Promise<void> {
  try {
    await activityLogsService.log(params);
  } catch (error) {
    logger.error(`Failed to log activity: ${params.action}`, error);
  }
}

/**
 * Creates a bound activity logger for a specific entity type
 * Use this in services to create a reusable logger function
 */
export function createActivityLogger(
  activityLogsService: ActivityLogsService,
  logger: Logger,
  entityType: string,
) {
  return async (params: Omit<ActivityLogParams, 'entityType'>): Promise<void> => {
    await logActivitySafe(activityLogsService, logger, { ...params, entityType });
  };
}
