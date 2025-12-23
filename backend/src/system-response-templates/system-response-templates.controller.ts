import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { SystemResponseTemplatesService } from './system-response-templates.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { SystemResponseType } from '../database/schemas/system-response-template.schema';

@Controller('api/admin/system-response-templates')
@UseGuards(AdminGuard)
export class SystemResponseTemplatesController {
  constructor(
    private readonly templatesService: SystemResponseTemplatesService,
  ) {}

  @Get()
  async getAll() {
    const templates = await this.templatesService.getAll();
    return {
      success: true,
      data: templates,
    };
  }

  @Get(':type')
  async getByType(@Param('type') type: SystemResponseType) {
    const template = await this.templatesService.getByType(type);
    if (!template) {
      return {
        success: false,
        error: 'Template not found',
      };
    }
    return {
      success: true,
      data: template,
    };
  }

  @Put(':type')
  async update(
    @Param('type') type: SystemResponseType,
    @Body() updates: any,
    @Req() req: any,
  ) {
    const updatedBy = req.user?.email || req.user?.username || 'admin';
    const template = await this.templatesService.update(type, updates, updatedBy);
    
    if (!template) {
      return {
        success: false,
        error: 'Failed to update template',
      };
    }

    return {
      success: true,
      data: template,
      message: 'อัปเดตเทมเพลตสำเร็จ',
    };
  }

  @Post(':type/reset')
  async resetToDefault(
    @Param('type') type: SystemResponseType,
    @Req() req: any,
  ) {
    const updatedBy = req.user?.email || req.user?.username || 'admin';
    const template = await this.templatesService.resetToDefault(type, updatedBy);
    
    if (!template) {
      return {
        success: false,
        error: 'Failed to reset template',
      };
    }

    return {
      success: true,
      data: template,
      message: 'รีเซ็ตเทมเพลตเป็นค่าเริ่มต้นสำเร็จ',
    };
  }

  @Post('reset-all')
  async resetAllToDefault(@Req() req: any) {
    const updatedBy = req.user?.email || req.user?.username || 'admin';
    const success = await this.templatesService.resetAllToDefault(updatedBy);
    
    return {
      success,
      message: success ? 'รีเซ็ตเทมเพลตทั้งหมดสำเร็จ' : 'เกิดข้อผิดพลาด',
    };
  }

  @Post(':type/preview')
  async preview(
    @Param('type') type: SystemResponseType,
    @Body() body: { variables?: Record<string, string> },
  ) {
    const response = await this.templatesService.getResponse(type, body.variables);
    return {
      success: true,
      data: response,
    };
  }
}
