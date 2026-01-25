import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AiQuotaReservation,
  AiQuotaReservationDocument,
  AiQuotaReservationStatus,
} from '../database/schemas/ai-quota-reservation.schema';

export interface CreateAiReservationDto {
  ownerId: string;
  subscriptionId: string;
  lineAccountId: string;
  lineUserId: string;
  messageId?: string;
  amount?: number;
}

@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);

  constructor(
    @InjectModel(AiQuotaReservation.name)
    private aiQuotaReservationModel: Model<AiQuotaReservationDocument>,
  ) {}

  /**
   * Create a new AI quota reservation record
   */
  async createReservation(data: CreateAiReservationDto): Promise<AiQuotaReservationDocument> {
    const expiresAt = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes from now

    const reservation = new this.aiQuotaReservationModel({
      ownerId: data.ownerId,
      subscriptionId: data.subscriptionId,
      lineAccountId: data.lineAccountId,
      lineUserId: data.lineUserId,
      messageId: data.messageId,
      status: AiQuotaReservationStatus.RESERVED,
      amount: data.amount || 1,
      expiresAt,
    });

    const saved = await reservation.save();
    this.logger.log(`Created AI quota reservation ${saved._id} for owner ${data.ownerId}`);
    return saved;
  }

  /**
   * Confirm a reservation (mark as used)
   */
  async confirmReservation(reservationId: string): Promise<void> {
    const result = await this.aiQuotaReservationModel.findByIdAndUpdate(
      reservationId,
      {
        status: AiQuotaReservationStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
      { new: true },
    );

    if (result) {
      this.logger.log(`Confirmed AI quota reservation ${reservationId}`);
    } else {
      this.logger.warn(`AI quota reservation ${reservationId} not found for confirmation`);
    }
  }

  /**
   * Rollback a reservation (release quota)
   */
  async rollbackReservation(reservationId: string, reason: string): Promise<void> {
    const result = await this.aiQuotaReservationModel.findByIdAndUpdate(
      reservationId,
      {
        status: AiQuotaReservationStatus.ROLLED_BACK,
        rolledBackAt: new Date(),
        reason,
      },
      { new: true },
    );

    if (result) {
      this.logger.log(`Rolled back AI quota reservation ${reservationId}: ${reason}`);
    } else {
      this.logger.warn(`AI quota reservation ${reservationId} not found for rollback`);
    }
  }

  /**
   * Expire stale reservations
   */
  async expireStaleReservations(): Promise<number> {
    const result = await this.aiQuotaReservationModel.updateMany(
      {
        status: AiQuotaReservationStatus.RESERVED,
        expiresAt: { $lt: new Date() },
      },
      {
        status: AiQuotaReservationStatus.EXPIRED,
        reason: 'auto_expired',
      },
    );

    if (result.modifiedCount > 0) {
      this.logger.warn(`Expired ${result.modifiedCount} stale AI quota reservations`);
    }

    return result.modifiedCount;
  }

  /**
   * Get reservation statistics for a user
   */
  async getReservationStats(ownerId: string): Promise<{
    totalReserved: number;
    totalConfirmed: number;
    totalRolledBack: number;
    totalExpired: number;
  }> {
    const stats = await this.aiQuotaReservationModel.aggregate([
      { $match: { ownerId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const result = {
      totalReserved: 0,
      totalConfirmed: 0,
      totalRolledBack: 0,
      totalExpired: 0,
    };

    for (const stat of stats) {
      switch (stat._id) {
        case AiQuotaReservationStatus.RESERVED:
          result.totalReserved = stat.totalAmount;
          break;
        case AiQuotaReservationStatus.CONFIRMED:
          result.totalConfirmed = stat.totalAmount;
          break;
        case AiQuotaReservationStatus.ROLLED_BACK:
          result.totalRolledBack = stat.totalAmount;
          break;
        case AiQuotaReservationStatus.EXPIRED:
          result.totalExpired = stat.totalAmount;
          break;
      }
    }

    return result;
  }
}
