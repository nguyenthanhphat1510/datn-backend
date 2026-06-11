import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { AddressSuggestService } from './address-suggest.service';

@Controller('address-suggest')
export class AddressSuggestController {
  constructor(private readonly service: AddressSuggestService) {}

  /**
   * GET /api/address-suggest?input=...
   * Gợi ý địa chỉ (proxy gogoduk). Public — chỉ là dữ liệu gợi ý, không nhạy cảm.
   */
  @Public()
  @Get()
  suggest(@Query('input') input: string) {
    return this.service.suggest(input);
  }
}
