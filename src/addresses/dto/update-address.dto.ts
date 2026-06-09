import { PartialType } from '@nestjs/mapped-types';
import { CreateAddressDto } from './create-address.dto';

// Tất cả field của CreateAddressDto trở thành optional
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
