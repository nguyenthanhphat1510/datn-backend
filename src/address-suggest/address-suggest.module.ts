import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AddressSuggestController } from './address-suggest.controller';
import { AddressSuggestService } from './address-suggest.service';

@Module({
  imports: [HttpModule],
  controllers: [AddressSuggestController],
  providers: [AddressSuggestService],
})
export class AddressSuggestModule {}
