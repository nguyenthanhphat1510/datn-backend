import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Đánh dấu route là public - không cần JWT token
 * @example @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
