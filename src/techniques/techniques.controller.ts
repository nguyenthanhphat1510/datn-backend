import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TechniquesService } from './techniques.service';
import { Public } from '../auth/decorators/public.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Roles } from '../auth/decorators/roles.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UserRole } from '../users/entities/user.entity';
// ^ Giữ import để dễ revert khi bật lại @Roles(UserRole.ADMIN).

@Controller('techniques')
export class TechniquesController {
  constructor(private readonly techniquesService: TechniquesService) {}

  /**
   * POST /techniques/upload — Admin
   * Upload tài liệu kỹ thuật (PDF/txt/md), backend tách + chunk + embedding + lưu.
   * Form-data, field "file".
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'Thiếu file (field "file" trong form-data)',
      );
    }
    return this.techniquesService.ingest(file);
  }

  /**
   * GET /techniques — Admin
   * Liệt kê các tài liệu đã nạp (gom theo tài liệu, kèm số chunk).
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Get()
  list() {
    return this.techniquesService.listDocs();
  }

  /**
   * GET /techniques/:docId — Public
   * Lấy toàn bộ nội dung một tài liệu (ghép chunk) để người dùng đọc.
   */
  @Public()
  @Get(':docId')
  getOne(@Param('docId') docId: string) {
    return this.techniquesService.getDocContent(docId);
  }

  /**
   * DELETE /techniques/:docId — Admin
   * Xóa toàn bộ chunk của một tài liệu.
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':docId')
  remove(@Param('docId') docId: string) {
    return this.techniquesService.removeDoc(docId);
  }
}
