import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Announcement, AnnouncementDocument } from '../database/schemas/announcement.schema';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectModel(Announcement.name) private announcementModel: Model<AnnouncementDocument>,
  ) {}

  async create(dto: CreateAnnouncementDto): Promise<AnnouncementDocument> {
    const announcement = new this.announcementModel({
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    });
    return announcement.save();
  }

  async findAll(includeInactive = false): Promise<AnnouncementDocument[]> {
    const query = includeInactive ? {} : { isActive: true };
    return this.announcementModel.find(query).sort({ priority: -1, createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<AnnouncementDocument | null> {
    return this.announcementModel.findById(id).exec();
  }

  async findActive(page?: string): Promise<AnnouncementDocument[]> {
    const now = new Date();

    const query: any = {
      isActive: true,
      $or: [
        { startDate: { $exists: false } },
        { startDate: null },
        { startDate: { $lte: now } },
      ],
    };

    // Filter by end date
    const announcements = await this.announcementModel
      .find(query)
      .sort({ priority: -1, createdAt: -1 })
      .exec();

    // Filter out expired announcements
    const activeAnnouncements = announcements.filter(a => {
      if (!a.endDate) return true;
      return new Date(a.endDate) >= now;
    });

    // Filter by target page if specified
    if (page) {
      return activeAnnouncements.filter(a => {
        if (!a.targetPages || a.targetPages.length === 0) return true;
        return a.targetPages.includes(page) || a.targetPages.includes('all');
      });
    }

    return activeAnnouncements;
  }

  async update(id: string, dto: UpdateAnnouncementDto): Promise<AnnouncementDocument> {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    Object.assign(announcement, {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : announcement.startDate,
      endDate: dto.endDate ? new Date(dto.endDate) : announcement.endDate,
    });

    return announcement.save();
  }

  async delete(id: string): Promise<void> {
    const result = await this.announcementModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Announcement not found');
    }
  }

  async incrementViewCount(id: string): Promise<void> {
    await this.announcementModel.updateOne(
      { _id: id },
      { $inc: { viewCount: 1 } },
    );
  }

  async incrementDismissCount(id: string): Promise<void> {
    await this.announcementModel.updateOne(
      { _id: id },
      { $inc: { dismissCount: 1 } },
    );
  }

  async toggleActive(id: string): Promise<AnnouncementDocument> {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }
    announcement.isActive = !announcement.isActive;
    return announcement.save();
  }
}
