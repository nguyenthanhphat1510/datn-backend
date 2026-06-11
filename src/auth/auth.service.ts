import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, fullName } = registerDto;

    // Kiểm tra email đã tồn tại chưa
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email đã được sử dụng');
    }

    // Hash password với bcrypt (salt rounds = 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo user mới. Set isActive=true rõ ràng vì MongoDB không áp default của
    // TypeORM khi insert → nếu thiếu, JwtStrategy.validate sẽ coi như bị khóa.
    const user = await this.usersService.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName,
      isActive: true,
    });

    return {
      message: 'Đăng ký thành công',
      user: this.sanitizeUser(user),
      access_token: this.generateToken(user),
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Tìm user theo email
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // Kiểm tra tài khoản có bị khóa không
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
    }

    // So sánh password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    return {
      message: 'Đăng nhập thành công',
      user: this.sanitizeUser(user),
      access_token: this.generateToken(user),
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }
    return {
      ...this.sanitizeUser(user),
      avatar: user.avatar,
      createdAt: user.createdAt,
    };
  }

  /**
   * Được gọi sau khi Google OAuth xác thực thành công.
   * req.user đã chứa User entity từ GoogleStrategy.validate()
   */
  async googleLogin(user: User) {
    return {
      message: 'Đăng nhập Google thành công',
      user: this.sanitizeUser(user),
      access_token: this.generateToken(user),
    };
  }

  /** Loại bỏ password trước khi trả về client */
  private sanitizeUser(user: User) {
    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      avatar: user.avatar ?? null,
      role: user.role,
      isActive: user.isActive,
    };
  }

  private generateToken(user: User): string {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }
}

