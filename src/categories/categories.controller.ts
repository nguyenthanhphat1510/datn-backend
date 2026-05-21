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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Public } from '../auth/decorators/public.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Roles } from '../auth/decorators/roles.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UserRole } from '../users/entities/user.entity';
// ^ Giữ import để dễ revert khi bật lại @Roles(UserRole.ADMIN).

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * GET /categories
   * Lấy danh sách danh mục — Public
   * Query: ?includeInactive=true để lấy cả category đã ẩn
   */
  @Public()
  @Get()
  findAll(@Query('includeInactive') includeInactiveStr?: string) {
    const includeInactive = includeInactiveStr === 'true';
    return this.categoriesService.findAll(includeInactive);
  }

  /**
   * GET /categories/:id
   * Lấy chi tiết 1 danh mục — Public
   */
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  /**
   * POST /categories — Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  /**
   * PATCH /categories/:id — Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  /**
   * PATCH /categories/:id/restore — Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.categoriesService.restore(id);
  }

  /**
   * DELETE /categories/:id — soft delete, Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.softDelete(id);
  }

  /**
   * DELETE /categories/:id/permanent — hard delete, chặn nếu còn product, Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id/permanent')
  removePermanent(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
