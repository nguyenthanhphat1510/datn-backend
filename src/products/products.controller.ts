import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  ParseFloatPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductCategory } from './entities/product.entity';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * POST /products
   * Tạo sản phẩm mới — chỉ Admin
   */
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  /**
   * GET /products
   * Lấy danh sách sản phẩm — Public, hỗ trợ filter & phân trang
   *
   * Query params:
   *   - page (default: 1)
   *   - limit (default: 10)
   *   - category (ProductCategory enum)
   *   - isActive (boolean, default: true)
   *   - search (string, tìm theo tên)
   *   - minPrice (number)
   *   - maxPrice (number)
   */
  @Public()
  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('category') category?: ProductCategory,
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('isActive') isActiveStr?: string,
  ) {
    // Chuyển đổi manual để tránh lỗi khi query param không có
    const isActive = isActiveStr !== undefined
      ? isActiveStr === 'true'
      : undefined;

    return this.productsService.findAll(
      {
        category,
        isActive,
        search,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      },
      { page, limit },
    );
  }

  /**
   * GET /products/:id
   * Lấy chi tiết 1 sản phẩm — Public
   */
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  /**
   * PUT /products/:id
   * Cập nhật toàn bộ sản phẩm — chỉ Admin
   */
  @Roles(UserRole.ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  /**
   * PATCH /products/:id
   * Cập nhật một phần sản phẩm — chỉ Admin
   */
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  partialUpdate(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  /**
   * PATCH /products/:id/stock
   * Điều chỉnh tồn kho (+ thêm / - bớt) — chỉ Admin
   * Body: { quantity: number }
   */
  @Roles(UserRole.ADMIN)
  @Patch(':id/stock')
  updateStock(
    @Param('id') id: string,
    @Body('quantity', ParseIntPipe) quantity: number,
  ) {
    return this.productsService.updateStock(id, quantity);
  }

  /**
   * PATCH /products/:id/restore
   * Khôi phục sản phẩm đã ẩn — chỉ Admin
   */
  @Roles(UserRole.ADMIN)
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.productsService.restore(id);
  }

  /**
   * DELETE /products/:id
   * Xóa mềm (ẩn sản phẩm) — chỉ Admin
   */
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.softDelete(id);
  }

  /**
   * DELETE /products/:id/permanent
   * Xóa cứng khỏi DB — chỉ Admin
   */
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Delete(':id/permanent')
  removePermanent(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
