import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Đăng ký tài khoản mới
   */
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Đăng ký thành công, trả về thông tin user và access_token',
    schema: {
      example: {
        message: 'Đăng ký thành công',
        user: {
          id: '663f1a2b4c5d6e7f8a9b0c1d',
          email: 'user@example.com',
          fullName: 'Nguyễn Văn A',
          role: 'user',
          isActive: true,
        },
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Email đã được sử dụng' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * POST /auth/login
   * Đăng nhập và nhận JWT token
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập lấy JWT token' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Đăng nhập thành công',
    schema: {
      example: {
        message: 'Đăng nhập thành công',
        user: {
          id: '663f1a2b4c5d6e7f8a9b0c1d',
          email: 'user@example.com',
          fullName: 'Nguyễn Văn A',
          role: 'user',
          isActive: true,
        },
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 401, description: 'Email hoặc mật khẩu không đúng' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * GET /auth/profile
   * Lấy thông tin user đang đăng nhập (cần JWT token)
   */
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy thông tin profile của user đang đăng nhập' })
  @ApiResponse({
    status: 200,
    description: 'Thông tin user',
    schema: {
      example: {
        id: '663f1a2b4c5d6e7f8a9b0c1d',
        email: 'user@example.com',
        fullName: 'Nguyễn Văn A',
        role: 'user',
        isActive: true,
        createdAt: '2024-05-01T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Không có hoặc token không hợp lệ' })
  async getProfile(@CurrentUser() user: { userId: string }) {
    return this.authService.getProfile(user.userId);
  }

  // ────────────────────────────────────────────────────────────
  //  GOOGLE OAUTH
  // ────────────────────────────────────────────────────────────

  /**
   * GET /auth/google
   * Bước 1: Passport tự redirect user sang trang đăng nhập Google.
   * Không cần viết logic ở đây.
   */
  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Khởi tạo đăng nhập bằng Google (redirect đến Google)' })
  async googleAuth() {
    // Passport xử lý redirect — body này không bao giờ chạy
  }

  /**
   * GET /auth/google/callback
   * Bước 2: Google gọi về đây sau khi user đồng ý.
   * Passport xác thực, GoogleStrategy.validate() chạy → req.user = User entity.
   * Ta tạo JWT và redirect về frontend kèm token.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth2 callback — trả JWT về frontend' })
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.googleLogin(req.user as any);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    // Redirect về trang callback của frontend kèm JWT token
    return res.redirect(
      `${frontendUrl}/auth/callback?token=${result.access_token}`,
    );
  }
}
