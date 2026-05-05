import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Nguyễn Văn B',
    description: 'Họ và tên mới',
  })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({
    enum: UserRole,
    example: UserRole.ADMIN,
    description: 'Vai trò của người dùng',
  })
  @IsEnum(UserRole, { message: 'Role phải là user hoặc admin' })
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    example: true,
    description: 'Trạng thái kích hoạt tài khoản',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
