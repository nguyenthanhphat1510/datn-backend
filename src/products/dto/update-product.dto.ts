import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

// Kế thừa CreateProductDto nhưng tất cả các trường đều optional
export class UpdateProductDto extends PartialType(CreateProductDto) {}
