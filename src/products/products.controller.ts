import type {} from 'multer';
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
  UploadedFiles,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Public } from '../auth/decorators/public.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Roles } from '../auth/decorators/roles.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UserRole } from '../users/entities/user.entity';
// ^ Giữ lại import để dễ revert khi bật lại @Roles(UserRole.ADMIN). TODO ở từng endpoint.

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * POST /products
   * Tạo sản phẩm mới — chỉ Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
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
   *   - categoryId (ObjectId string của Category)
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
    @Query('categoryId') categoryId?: string,
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
        categoryId,
        isActive,
        search,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      },
      { page, limit },
    );
  }

  /**
   * POST /products/reembed-all
   * Backfill: sinh lại embedding cho toàn bộ sản phẩm — Admin.
   * Chạy 1 lần sau khi bật tính năng vector search để SP cũ tìm được.
   * Đặt TRƯỚC route :id để không bị bắt nhầm thành id.
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Post('reembed-all')
  reEmbedAll() {
    return this.productsService.reEmbedAll();
  }

  /**
   * GET /products/:id
   * Lấy chi tiết 1 sản phẩm — Public
   */
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOnePublic(id);
  }

  /**
   * PUT /products/:id
   * Cập nhật toàn bộ sản phẩm — chỉ Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Put(':id')
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productsService.update(id, updateProductDto);
  }

  /**
   * PATCH /products/:id
   * Cập nhật một phần sản phẩm — chỉ Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
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
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
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
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.productsService.restore(id);
  }

  /**
   * DELETE /products/:id
   * Xóa mềm (ẩn sản phẩm) — chỉ Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.softDelete(id);
  }

  /**
   * DELETE /products/:id/permanent
   * Xóa cứng khỏi DB — chỉ Admin
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id/permanent')
  removePermanent(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  /**
   * POST /products/:id/images
   * Upload 1-5 ảnh sản phẩm lên Cloudinary — chỉ Admin
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
    return this.productsService.addImages(id, files);
  }

  /**
   * DELETE /products/:id/images?publicId=...
   * Xóa 1 ảnh khỏi sản phẩm (và khỏi Cloudinary) — chỉ Admin
   * publicId truyền qua query để tránh phiền với dấu `/` trong path
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi cô yêu cầu phân quyền
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete(':id/images')
  removeImage(
    @Param('id') id: string,
    @Query('publicId') publicId: string,
  ) {
    return this.productsService.removeImage(id, publicId);
  }
}
