import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { ParseObjectIdPipe } from '../common/pipes/parse-object-id.pipe';

@ApiTags('Announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  // Public endpoint - get active announcements for users
  @Get('active')
  @ApiOperation({ summary: 'Get active announcements (public)' })
  async getActive(@Query('page') page?: string) {
    const announcements = await this.announcementsService.findActive(page);
    return {
      success: true,
      announcements: announcements.map(a => ({
        _id: a._id,
        title: a.title,
        message: a.message,
        imageUrl: a.imageUrl,
        imageBase64: a.imageBase64,
        linkUrl: a.linkUrl,
        linkText: a.linkText,
        displayType: a.displayType,
        position: a.position,
        backgroundColor: a.backgroundColor,
        textColor: a.textColor,
        allowDismiss: a.allowDismiss,
        allowDismissFor7Days: a.allowDismissFor7Days,
        startDate: a.startDate,
        endDate: a.endDate,
      })),
    };
  }

  // Public endpoint - track view
  @Post(':id/view')
  @ApiOperation({ summary: 'Track announcement view' })
  async trackView(@Param('id', ParseObjectIdPipe) id: string) {
    await this.announcementsService.incrementViewCount(id);
    return { success: true };
  }

  // Public endpoint - track dismiss
  @Post(':id/dismiss')
  @ApiOperation({ summary: 'Track announcement dismiss' })
  async trackDismiss(@Param('id', ParseObjectIdPipe) id: string) {
    await this.announcementsService.incrementDismissCount(id);
    return { success: true };
  }

  // Admin endpoints
  @Get('admin')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all announcements (Admin)' })
  async getAll(@Query('includeInactive') includeInactive?: string) {
    const announcements = await this.announcementsService.findAll(includeInactive === 'true');
    return {
      success: true,
      announcements,
    };
  }

  @Get('admin/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get announcement by ID (Admin)' })
  async getById(@Param('id', ParseObjectIdPipe) id: string) {
    const announcement = await this.announcementsService.findById(id);
    return {
      success: true,
      announcement,
    };
  }

  @Post('admin')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create announcement (Admin)' })
  async create(@Body() dto: CreateAnnouncementDto) {
    const announcement = await this.announcementsService.create(dto);
    return {
      success: true,
      announcement,
    };
  }

  @Put('admin/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update announcement (Admin)' })
  async update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateAnnouncementDto) {
    const announcement = await this.announcementsService.update(id, dto);
    return {
      success: true,
      announcement,
    };
  }

  @Put('admin/:id/toggle')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle announcement active status (Admin)' })
  async toggleActive(@Param('id', ParseObjectIdPipe) id: string) {
    const announcement = await this.announcementsService.toggleActive(id);
    return {
      success: true,
      announcement,
    };
  }

  @Delete('admin/:id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete announcement (Admin)' })
  async delete(@Param('id', ParseObjectIdPipe) id: string) {
    await this.announcementsService.delete(id);
    return {
      success: true,
    };
  }
}
