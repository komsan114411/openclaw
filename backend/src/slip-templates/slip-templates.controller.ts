import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.service';
import { UserRole } from '../database/schemas/user.schema';
import { SlipTemplatesService, CreateTemplateDto } from './slip-templates.service';
import { TemplateType } from '../database/schemas/slip-template.schema';

// ============================================
// Public Controller for Global Templates (User can view)
// ============================================
@Controller('slip-templates')
@UseGuards(SessionAuthGuard)
export class PublicSlipTemplatesController {
  constructor(private readonly slipTemplatesService: SlipTemplatesService) {}

  /**
   * Get all active global templates (for users to select)
   */
  @Get('global')
  async getGlobalTemplates() {
    // Use getGlobalTemplates() which only returns active templates
    const templates = await this.slipTemplatesService.getGlobalTemplates();
    return { success: true, templates };
  }
}

// ============================================
// Admin Controller for Global Templates
// ============================================
@Controller('admin/slip-templates')
@UseGuards(SessionAuthGuard, RolesGuard)
export class AdminSlipTemplatesController {
  constructor(private readonly slipTemplatesService: SlipTemplatesService) {}

  /**
   * Get all global templates including inactive (Admin only)
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
    @CurrentUser() user: AuthUser,
  ) {
    const template = await this.slipTemplatesService.createGlobalTemplate({
      ...body,
      ownerId: user.userId,
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
   * Check template usage before delete (Admin only)
   */
  @Get('global/:templateId/usage')
  @Roles(UserRole.ADMIN)
  async checkGlobalTemplateUsage(@Param('templateId') templateId: string) {
    const usage = await this.slipTemplatesService.checkTemplateUsage(templateId);
    return { success: true, ...usage };
  }

  /**
   * Safe delete a global template (Admin only)
   */
  @Delete('global/:templateId/safe-delete')
  @Roles(UserRole.ADMIN)
  async safeDeleteGlobalTemplate(
    @Param('templateId') templateId: string,
    @Body() body: { confirmationText?: string },
  ) {
    const result = await this.slipTemplatesService.safeDelete(templateId, body.confirmationText);
    return { ...result, message: 'Template deleted' };
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
  async initGlobalDefaults(@CurrentUser() user: AuthUser) {
    await this.slipTemplatesService.createDefaultGlobalTemplates(user.userId);
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
  async getTemplates(
    @Param('accountId') accountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    const templates = await this.slipTemplatesService.getByLineAccount(accountId);
    return { success: true, templates };
  }

  /**
   * Get template list (simplified)
   */
  @Get(':accountId/slip-templates-list')
  async getTemplateList(
    @Param('accountId') accountId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
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
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    const template = await this.slipTemplatesService.create({
      ...body,
      lineAccountId: accountId,
      ownerId: user.userId,
    });
    return { success: true, template };
  }

  /**
   * Update template
   */
  @Put(':accountId/slip-templates/:templateId')
  async updateTemplate(
    @Param('accountId') accountId: string,
    @Param('templateId') templateId: string,
    @Body() body: Partial<CreateTemplateDto>,
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    const template = await this.slipTemplatesService.update(templateId, body);
    return { success: true, template };
  }

  /**
   * Check template usage before delete
   */
  @Get(':accountId/slip-templates/:templateId/usage')
  async checkTemplateUsage(
    @Param('accountId') accountId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    const usage = await this.slipTemplatesService.checkTemplateUsage(templateId);
    return { success: true, ...usage };
  }

  /**
   * Safe delete template with confirmation
   */
  @Delete(':accountId/slip-templates/:templateId/safe-delete')
  async safeDeleteTemplate(
    @Param('accountId') accountId: string,
    @Param('templateId') templateId: string,
    @Body() body: { confirmationText?: string },
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    const result = await this.slipTemplatesService.safeDelete(templateId, body.confirmationText);
    return { ...result, message: 'Template deleted' };
  }

  /**
   * Delete template
   */
  @Delete(':accountId/slip-templates/:templateId')
  async deleteTemplate(
    @Param('accountId') accountId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    await this.slipTemplatesService.delete(templateId);
    return { success: true, message: 'Template deleted' };
  }

  /**
   * Set template as default
   */
  @Put(':accountId/slip-templates/:templateId/default')
  async setAsDefault(
    @Param('accountId') accountId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    const template = await this.slipTemplatesService.setAsDefault(templateId);
    return { success: true, template };
  }

  /**
   * Preview template
   */
  @Get(':accountId/slip-templates/:templateId/preview')
  async previewTemplate(
    @Param('accountId') accountId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
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
    @CurrentUser() user: AuthUser,
  ) {
    await this.slipTemplatesService.ensureAccountAccess(accountId, user);
    await this.slipTemplatesService.createDefaultTemplates(accountId, user.userId);
    return { success: true, message: 'Default templates created' };
  }
}
