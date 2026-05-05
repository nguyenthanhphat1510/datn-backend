import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Bật CORS
  app.enableCors({
    origin: '*', // Thay bằng domain frontend trong production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Áp dụng validation pipe toàn cục (dùng class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // Tự động bỏ các field không có trong DTO
      forbidNonWhitelisted: true, // Báo lỗi nếu có field lạ
      transform: true,         // Tự động chuyển đổi kiểu dữ liệu
    }),
  );

  // Prefix API global
  app.setGlobalPrefix('api');

  // Cấu hình Swagger
  const config = new DocumentBuilder()
    .setTitle('DATN API')
    .setDescription('API documentation cho hệ thống chẩn đoán bệnh lúa')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Nhập JWT token (không cần thêm Bearer)',
        in: 'header',
      },
      'access-token', // Tên security scheme, dùng trong @ApiBearerAuth()
    )
    .addTag('Auth', 'Đăng ký, đăng nhập, lấy thông tin profile')
    .addTag('Users', 'Quản lý người dùng (Admin only)')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Giữ token sau khi reload
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Server đang chạy tại: http://localhost:${port}/api`);
  console.log(`📄 Swagger UI tại:     http://localhost:${port}/api/docs`);
}
bootstrap();
