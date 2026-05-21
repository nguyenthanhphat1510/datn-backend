import { Inject, Injectable, Logger } from '@nestjs/common';
import { v2 as Cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { CLOUDINARY } from './cloudinary.provider';

export interface UploadedImage {
  url: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(@Inject(CLOUDINARY) private readonly cloudinary: typeof Cloudinary) {}

  uploadImage(
    file: Express.Multer.File,
    folder = 'datn/products',
  ): Promise<UploadedImage> {
    return new Promise((resolve, reject) => {
      const stream = this.cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            return reject(error ?? new Error('Cloudinary upload failed'));
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );
      Readable.from(file.buffer).pipe(stream);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      const result = await this.cloudinary.uploader.destroy(publicId);
      if (result.result !== 'ok' && result.result !== 'not found') {
        this.logger.warn(`Cloudinary destroy returned: ${result.result} for ${publicId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${err}`);
    }
  }
}
