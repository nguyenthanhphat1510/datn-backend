import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
    return this.chatbotService.chat(dto.messages);
  }
}
