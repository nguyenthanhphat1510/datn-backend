import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users
   * Lấy danh sách tất cả người dùng (Admin only)
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi gắn JWT ở admin
  @Public()
  @Get()
  @ApiOperation({ summary: '[Admin] Lấy danh sách tất cả người dùng' })
  @ApiResponse({
    status: 200,
    description: 'Danh sách người dùng (không bao gồm password)',
    schema: {
      example: [
        {
          _id: '663f1a2b4c5d6e7f8a9b0c1d',
          email: 'user@example.com',
          fullName: 'Nguyễn Văn A',
          role: 'user',
          isActive: true,
          createdAt: '2024-05-01T10:00:00.000Z',
          updatedAt: '2024-05-01T10:00:00.000Z',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền Admin' })
  async findAll() {
    return this.usersService.findAll();
  }

  /**
   * GET /users/:id
   * Lấy thông tin một người dùng theo ID (Admin only)
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi gắn JWT ở admin
  @Public()
  @Get(':id')
  @ApiOperation({ summary: '[Admin] Lấy thông tin người dùng theo ID' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của người dùng', example: '663f1a2b4c5d6e7f8a9b0c1d' })
  @ApiResponse({
    status: 200,
    description: 'Thông tin người dùng',
    schema: {
      example: {
        _id: '663f1a2b4c5d6e7f8a9b0c1d',
        email: 'user@example.com',
        fullName: 'Nguyễn Văn A',
        role: 'user',
        isActive: true,
        createdAt: '2024-05-01T10:00:00.000Z',
        updatedAt: '2024-05-01T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền Admin' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng' })
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pwd, ...rest } = user as any;
    return rest;
  }

  /**
   * PATCH /users/:id
   * Cập nhật thông tin người dùng (Admin only)
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi gắn JWT ở admin
  @Public()
  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Cập nhật thông tin người dùng' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của người dùng', example: '663f1a2b4c5d6e7f8a9b0c1d' })
  @ApiResponse({
    status: 200,
    description: 'Cập nhật thành công',
    schema: {
      example: {
        message: 'Cập nhật thành công',
        user: {
          _id: '663f1a2b4c5d6e7f8a9b0c1d',
          email: 'user@example.com',
          fullName: 'Nguyễn Văn B',
          role: 'admin',
          isActive: true,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền Admin' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng' })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  /**
   * DELETE /users/:id
   * Xóa người dùng (Admin only)
   */
  // TODO: bật lại @Roles(UserRole.ADMIN) khi gắn JWT ở admin
  @Public()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Xóa người dùng' })
  @ApiParam({ name: 'id', description: 'MongoDB ObjectId của người dùng', example: '663f1a2b4c5d6e7f8a9b0c1d' })
  @ApiResponse({ status: 204, description: 'Xóa thành công' })
  @ApiResponse({ status: 401, description: 'Chưa xác thực' })
  @ApiResponse({ status: 403, description: 'Không có quyền Admin' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
