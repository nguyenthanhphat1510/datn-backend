import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ChatbotService } from './chatbot.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('Chatbot')
@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Public()
  @Post('message')
  @ApiOperation({
    summary: 'Gửi tin nhắn cho trợ lý ảo (tư vấn kỹ thuật cây lúa)',
  })
  async sendMessage(@Body() dto: ChatDto) {
    return this.chatbotService.chat(dto.messages, dto.comparedProductIds);
  }

  @Public()
  @Post('predict-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Gửi ảnh lá lúa cho trợ lý ảo để chẩn đoán bệnh',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  predictImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException(
        'Vui lòng tải lên 1 ảnh lá lúa (field "file")',
      );
    }
    return this.chatbotService.predictImage(file);
  }
}
