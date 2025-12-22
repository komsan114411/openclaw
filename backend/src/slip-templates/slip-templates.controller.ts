import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/schemas/user.schema';
import { SlipTemplatesService, CreateTemplateDto } from './slip-templates.service';
import { TemplateType } from '../database/schemas/slip-template.schema';

// ============================================
// Admin Controller for Global Templates
// ============================================
@Controller('slip-templates')
@UseGuards(SessionAuthGuard, RolesGuard)
export class AdminSlipTemplatesController {
  constructor(private readonly slipTemplatesService: SlipTemplatesService) {}

  /**
   * Get all global templates (Admin only)
   */
  @Get('global')
  @Roles(UserRole.ADMIN)
  async getGlobalTemplates() {
    const templates = await this.slipTemplatesService.getAllGlobalTemplates();
    return { success: true, templates };
  }

  /**
   * Create a global template (Admin only)
   */
  @Post('global')
  @Roles(UserRole.ADMIN)
  async createGlobalTemplate(
    @Body() body: Omit<CreateTemplateDto, 'lineAccountId'>,
    @Request() req: any,
  ) {
    const template = await this.slipTemplatesService.createGlobalTemplate({
      ...body,
      ownerId: req.user?.id,
    });
    return { success: true, template };
  }

  /**
   * Update a global template (Admin only)
   */
  @Put('global/:templateId')
  @Roles(UserRole.ADMIN)
  async updateGlobalTemplate(
    @Param('templateId') templateId: string,
    @Body() body: Partial<CreateTemplateDto>,
  ) {
    const template = await this.slipTemplatesService.update(templateId, body);
    return { success: true, template };
  }

  /**
   * Delete a global template (Admin only)
   */
  @Delete('global/:templateId')
  @Roles(UserRole.ADMIN)
  async deleteGlobalTemplate(@Param('templateId') templateId: string) {
    await this.slipTemplatesService.delete(templateId);
    return { success: true, message: 'Template deleted' };
  }

  /**
   * Set global template as default for its type (Admin only)
   */
  @Put('global/:templateId/default')
  @Roles(UserRole.ADMIN)
  async setGlobalDefault(@Param('templateId') templateId: string) {
    const template = await this.slipTemplatesService.setGlobalDefault(templateId);
    return { success: true, template };
  }

  /**
   * Preview global template (Admin only)
   */
  @Get('global/:templateId/preview')
  @Roles(UserRole.ADMIN)
  async previewGlobalTemplate(@Param('templateId') templateId: string) {
    const template = await this.slipTemplatesService.getById(templateId);
    const preview = this.slipTemplatesService.preview(template);
    return { success: true, preview };
  }

  /**
   * Initialize default global templates (Admin only)
   */
  @Post('global/init-defaults')
  @Roles(UserRole.ADMIN)
  async initGlobalDefaults(@Request() req: any) {
    await this.slipTemplatesService.createDefaultGlobalTemplates(req.user?.id);
    return { success: true, message: 'Default global templates created' };
  }
}

// ============================================
// User Controller for LINE Account Templates
// ============================================
@Controller('line-accounts')
@UseGuards(SessionAuthGuard)
export class SlipTemplatesController {
  constructor(private readonly slipTemplatesService: SlipTemplatesService) {}

  /**
   * Get all templates for a LINE account
   */
  @Get(':accountId/slip-templates')
  async getTemplates(@Param('accountId') accountId: string) {
    const templates = await this.slipTemplatesService.getByLineAccount(accountId);
    return { success: true, templates };
  }

  /**
   * Get template list (simplified)
   */
  @Get(':accountId/slip-templates-list')
  async getTemplateList(@Param('accountId') accountId: string) {
    const templates = await this.slipTemplatesService.getByLineAccount(accountId);
    return {
      success: true,
      templates: templates.map((t) => ({
        _id: t._id,
        name: t.name,
        type: t.type,
        isDefault: t.isDefault,
        description: t.description,
      })),
    };
  }

  /**
   * Create a new template
   */
  @Post(':accountId/slip-templates')
  async createTemplate(
    @Param('accountId') accountId: string,
    @Body() body: Omit<CreateTemplateDto, 'lineAccountId'>,
    @Request() req: any,
  ) {
    const template = await this.slipTemplatesService.create({
      ...body,
      lineAccountId: accountId,
      ownerId: req.user?.id,
    });
    return { success: true, template };
  }

  /**
   * Update template
   */
  @Put(':accountId/slip-templates/:templateId')
  async updateTemplate(
    @Param('templateId') templateId: string,
    @Body() body: Partial<CreateTemplateDto>,
  ) {
    const template = await this.slipTemplatesService.update(templateId, body);
    return { success: true, template };
  }

  /**
   * Delete template
   */
  @Delete(':accountId/slip-templates/:templateId')
  async deleteTemplate(@Param('templateId') templateId: string) {
    await this.slipTemplatesService.delete(templateId);
    return { success: true, message: 'Template deleted' };
  }

  /**
   * Set template as default
   */
  @Put(':accountId/slip-templates/:templateId/default')
  async setAsDefault(@Param('templateId') templateId: string) {
    const template = await this.slipTemplatesService.setAsDefault(templateId);
    return { success: true, template };
  }

  /**
   * Preview template
   */
  @Get(':accountId/slip-templates/:templateId/preview')
  async previewTemplate(@Param('templateId') templateId: string) {
    const template = await this.slipTemplatesService.getById(templateId);
    const preview = this.slipTemplatesService.preview(template);
    return { success: true, preview };
  }

  /**
   * Create default templates for a LINE account
   */
  @Post(':accountId/slip-templates/init-defaults')
  async initDefaults(
    @Param('accountId') accountId: string,
    @Request() req: any,
  ) {
    await this.slipTemplatesService.createDefaultTemplates(accountId, req.user?.id);
    return { success: true, message: 'Default templates created' };
  }
}
