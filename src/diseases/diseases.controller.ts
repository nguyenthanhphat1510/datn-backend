import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiBody } from '@nestjs/swagger';
import { DiseasesService } from './diseases.service';
import { DiseasePredictionService } from './disease-prediction.service';
import { CreateDiseaseDto } from './dto/create-disease.dto';
import { UpdateDiseaseDto } from './dto/update-disease.dto';
import { Public } from '../auth/decorators/public.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Roles } from '../auth/decorators/roles.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UserRole } from '../users/entities/user.entity';
// ^ Giữ import để dễ revert khi bật lại @Roles(UserRole.ADMIN).

@Controller('diseases')
export class DiseasesController {
  constructor(
    private readonly diseasesService: DiseasesService,
    private readonly predictionService: DiseasePredictionService,
  ) {}

  /**
   * POST /diseases/predict
   * Upload ảnh lá lúa -> ml-service (FastAPI) dự đoán -> map với DB để trả kèm
   * thông tin bệnh + thuốc gợi ý. Public.
   */
  @Public()
  @Post('predict')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  predict(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Vui lòng tải lên 1 ảnh lá lúa (field "file")');
    }
    return this.predictionService.predict(file);
  }

  /**
   * GET /diseases
   * Lấy danh sách bệnh — Public
   * Query: ?includeInactive=true để lấy cả bệnh đã ẩn
   */
  @Public()
  @Get()
  findAll(@Query('includeInactive') includeInactiveStr?: string) {
    const includeInactive = includeInactiveStr === 'true';
    return this.diseasesService.findAll(includeInactive);
  }

  /**
   * GET /diseases/:id
   * Lấy chi tiết 1 bệnh — Public
   */
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.diseasesService.findOnePublic(id);
  }

  /**
   * POST /diseases — Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Post()
  create(@Body() dto: CreateDiseaseDto) {
    return this.diseasesService.create(dto);
  }

  /**
   * PATCH /diseases/:id — Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDiseaseDto) {
    return this.diseasesService.update(id, dto);
  }

  /**
   * PATCH /diseases/:id/restore — Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.diseasesService.restore(id);
  }

  /**
   * DELETE /diseases/:id — soft delete, Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.diseasesService.softDelete(id);
  }

  /**
   * DELETE /diseases/:id/permanent — hard delete, Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id/permanent')
  removePermanent(@Param('id') id: string) {
    return this.diseasesService.remove(id);
  }

  /**
   * POST /diseases/:id/images
   * Upload 1-5 ảnh minh họa cho bệnh lên Cloudinary — Admin
   * Form-data: field `files` (multiple), tối đa 5MB/file, mime image/*
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('files', 5))
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/(jpeg|jpg|png|webp|gif)/ }),
        ],
      }),
    )
    files: Express.Multer.File[],
  ) {
    return this.diseasesService.addImages(id, files);
  }

  /**
   * DELETE /diseases/:id/images?publicId=...
   * Xóa 1 ảnh khỏi bệnh (và khỏi Cloudinary) — Admin
   * publicId truyền qua query để tránh phiền với dấu `/` trong path
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id/images')
  removeImage(@Param('id') id: string, @Query('publicId') publicId: string) {
    return this.diseasesService.removeImage(id, publicId);
  }
}
