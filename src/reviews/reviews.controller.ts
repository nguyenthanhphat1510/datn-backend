import type {} from 'multer';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UploadedFiles,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Roles } from '../auth/decorators/roles.decorator';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { UserRole } from '../users/entities/user.entity';
// ^ Giữ import để dễ bật lại @Roles(UserRole.ADMIN) khi phân quyền.

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * GET /reviews/product/:productId
   * Danh sách đánh giá của 1 sản phẩm (gom từ mọi đơn) — Public.
   * Hỗ trợ phân trang + lọc theo sao.
   */
  @Public()
  @Get('product/:productId')
  findByProduct(
    @Param('productId') productId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('rating') rating?: string,
  ) {
    return this.reviewsService.findByProduct(
      productId,
      {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      rating ? parseInt(rating, 10) : undefined,
    );
  }

  /**
   * GET /reviews/order/:orderId/reviewed
   * Danh sách productId user đã đánh giá trong đơn này (để ẩn nút). Cần đăng nhập.
   */
  @Get('order/:orderId/reviewed')
  getReviewed(
    @CurrentUser() user: { userId: string },
    @Param('orderId') orderId: string,
  ) {
    return this.reviewsService.getReviewedProductIds(user.userId, orderId);
  }

  /**
   * POST /reviews
   * Tạo đánh giá cho 1 sản phẩm trong 1 đơn đã giao. Cần đăng nhập.
   */
  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.userId, dto);
  }

  /**
   * POST /reviews/:id/images
   * Upload 1-5 ảnh cho đánh giá vừa tạo. Form-data: field `files`, tối đa 5MB/file.
   */
  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('files', 5))
  uploadImages(
    @CurrentUser() user: { userId: string },
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
    return this.reviewsService.addImages(user.userId, id, files);
  }

  /**
   * [Admin] DELETE /reviews/admin/:id
   * Xóa đánh giá vi phạm.
   * TODO: bật lại @Roles(UserRole.ADMIN) khi bật phân quyền.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Delete('admin/:id')
  removeByAdmin(@Param('id') id: string) {
    return this.reviewsService.removeByAdmin(id);
  }
}
