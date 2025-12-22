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
import { SlipTemplatesService, CreateTemplateDto } from './slip-templates.service';
import { TemplateType } from '../database/schemas/slip-template.schema';

@Controller('api/user/line-accounts')
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
