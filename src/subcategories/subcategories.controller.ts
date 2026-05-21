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
import { SubcategoriesService } from './subcategories.service';
import { CreateSubcategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubcategoryDto } from './dto/update-subcategory.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('subcategories')
export class SubcategoriesController {
  constructor(private readonly subcategoriesService: SubcategoriesService) {}

  /**
   * GET /subcategories
   * ?categoryId=<id> — lọc theo danh mục cha
   * ?includeInactive=true — bao gồm cả đang ẩn
   */
  @Public()
  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('includeInactive') includeInactiveStr?: string,
  ) {
    return this.subcategoriesService.findAll({
      categoryId,
      includeInactive: includeInactiveStr === 'true',
    });
  }

  /**
   * GET /subcategories/:id
   */
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subcategoriesService.findOne(id);
  }

  /**
   * POST /subcategories
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Post()
  create(@Body() dto: CreateSubcategoryDto) {
    return this.subcategoriesService.create(dto);
  }

  /**
   * PATCH /subcategories/:id
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSubcategoryDto) {
    return this.subcategoriesService.update(id, dto);
  }

  /**
   * PATCH /subcategories/:id/restore
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.subcategoriesService.restore(id);
  }

  /**
   * DELETE /subcategories/:id — soft delete
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.subcategoriesService.softDelete(id);
  }

  /**
   * DELETE /subcategories/:id/permanent — hard delete
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id/permanent')
  remove(@Param('id') id: string) {
    return this.subcategoriesService.remove(id);
  }
}
