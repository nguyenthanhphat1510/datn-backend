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
} from '@nestjs/common';
import { DiseasesService } from './diseases.service';
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
  constructor(private readonly diseasesService: DiseasesService) {}

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
}
