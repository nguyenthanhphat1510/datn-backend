import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Review } from './entities/review.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { CreateReviewDto } from './dto/create-review.dto';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewsRepository: MongoRepository<Review>,
    @InjectRepository(Order)
    private ordersRepository: MongoRepository<Order>,
    private productsService: ProductsService,
    private usersService: UsersService,
    private cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Tính lại averageRating + reviewCount của sản phẩm từ TẤT CẢ review
   * (gom từ mọi đơn), rồi ghi denormalize vào Product.
   */
  private async recalcProductRating(productId: string): Promise<void> {
    const reviews = await this.reviewsRepository.find({ where: { productId } });
    const count = reviews.length;
    const average =
      count === 0
        ? 0
        : reviews.reduce((sum, r) => sum + r.rating, 0) / count;
    // Làm tròn 1 chữ số thập phân để hiển thị gọn (vd 4.3)
    const rounded = Math.round(average * 10) / 10;
    await this.productsService.setRating(productId, rounded, count);
  }

  /** Lấy review theo id (kèm validate ObjectId) — throw nếu không tồn tại. */
  private async findById(reviewId: string): Promise<Review> {
    if (!ObjectId.isValid(reviewId)) {
      throw new BadRequestException('ID đánh giá không hợp lệ');
    }
    const review = await this.reviewsRepository.findOne({
      where: { _id: new ObjectId(reviewId) },
    });
    if (!review) {
      throw new NotFoundException('Không tìm thấy đánh giá');
    }
    return review;
  }

  /**
   * POST /reviews — tạo đánh giá cho 1 sản phẩm trong 1 đơn cụ thể.
   * Yêu cầu:
   *  - Đơn thuộc về user, đã DELIVERED, và có chứa sản phẩm này.
   *  - Chưa đánh giá sản phẩm này TRONG ĐƠN NÀY (mua lại đơn khác vẫn đánh giá được).
   * Sau khi tạo là khóa — không sửa/xóa (chỉ admin xóa được).
   */
  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    if (!ObjectId.isValid(dto.orderId)) {
      throw new BadRequestException('ID đơn hàng không hợp lệ');
    }

    // Sản phẩm phải tồn tại
    await this.productsService.findOne(dto.productId);

    // Đơn phải của user, đã giao, và chứa sản phẩm này
    const order = await this.ordersRepository.findOne({
      where: { _id: new ObjectId(dto.orderId) },
    });
    if (!order || order.userId !== userId) {
      throw new ForbiddenException('Đơn hàng không hợp lệ');
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new ForbiddenException(
        'Chỉ đánh giá được khi đơn hàng đã giao thành công',
      );
    }
    const inOrder = order.items.some(
      (item) => item.productId === dto.productId,
    );
    if (!inOrder) {
      throw new BadRequestException('Sản phẩm không nằm trong đơn hàng này');
    }

    // Chống trùng theo (orderId, productId) — mỗi lượt mua chỉ 1 đánh giá
    const existed = await this.reviewsRepository.findOne({
      where: { orderId: dto.orderId, productId: dto.productId },
    });
    if (existed) {
      throw new BadRequestException(
        'Bạn đã đánh giá sản phẩm này trong đơn hàng này rồi',
      );
    }

    // Snapshot tên người đánh giá
    const user = await this.usersService.findById(userId);
    const userName = user?.fullName || user?.email || 'Người dùng';

    const review = this.reviewsRepository.create({
      productId: dto.productId,
      orderId: dto.orderId,
      userId,
      userName,
      rating: dto.rating,
      comment: dto.comment ?? '',
      images: [],
    });
    const saved = await this.reviewsRepository.save(review);

    await this.recalcProductRating(dto.productId);
    return saved;
  }

  /**
   * POST /reviews/:id/images — thêm ảnh cho review của mình.
   * Dùng ngay sau khi tạo (lúc đánh giá) — không phải sửa nội dung.
   */
  async addImages(
    userId: string,
    reviewId: string,
    files: Express.Multer.File[],
  ): Promise<Review> {
    if (!files?.length) {
      throw new BadRequestException('Chưa có file nào được upload');
    }
    const review = await this.findById(reviewId);
    if (review.userId !== userId) {
      throw new ForbiddenException('Bạn không thể sửa đánh giá của người khác');
    }
    const uploaded = await Promise.all(
      files.map((f) => this.cloudinaryService.uploadImage(f, 'datn/reviews')),
    );
    review.images = [...(review.images ?? []), ...uploaded];
    return this.reviewsRepository.save(review);
  }

  /** [Admin] DELETE /reviews/admin/:id — xóa review vi phạm. */
  async removeByAdmin(reviewId: string): Promise<{ message: string }> {
    const review = await this.findById(reviewId);
    if (review.images?.length) {
      await Promise.all(
        review.images.map((img) =>
          this.cloudinaryService.deleteImage(img.publicId),
        ),
      );
    }
    const { productId } = review;
    await this.reviewsRepository.remove(review);
    await this.recalcProductRating(productId);
    return { message: 'Đã xóa đánh giá thành công' };
  }

  /** GET /reviews/product/:productId — danh sách review của 1 sản phẩm. */
  async findByProduct(
    productId: string,
    pagination: PaginationOptions = {},
    rating?: number,
  ): Promise<{ data: Review[]; total: number; page: number; limit: number }> {
    if (!ObjectId.isValid(productId)) {
      throw new BadRequestException('ID sản phẩm không hợp lệ');
    }
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 10));
    const skip = (page - 1) * limit;

    const where: Record<string, any> = { productId };
    if (rating !== undefined) where.rating = rating;

    const [data, total] = await this.reviewsRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' } as any,
    });

    return { data, total, page, limit };
  }

  /**
   * GET /reviews/order/:orderId/reviewed — danh sách productId đã đánh giá
   * trong đơn này (để frontend ẩn nút "Đánh giá" cho item đã đánh giá).
   */
  async getReviewedProductIds(
    userId: string,
    orderId: string,
  ): Promise<string[]> {
    if (!ObjectId.isValid(orderId)) {
      throw new BadRequestException('ID đơn hàng không hợp lệ');
    }
    const reviews = await this.reviewsRepository.find({
      where: { userId, orderId },
    });
    return reviews.map((r) => r.productId);
  }
}
