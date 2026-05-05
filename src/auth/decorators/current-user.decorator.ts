import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Lấy thông tin user đang đăng nhập từ request
 * @example @CurrentUser() user: { userId, email, role }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
