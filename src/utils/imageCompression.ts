import logger from '@/utils/logger';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-100
  format?: 'jpeg' | 'webp';
}

/**
 * Compress image buffer using sharp (if available) or return original
 */
export async function compressImage(
  imageBuffer: Buffer,
  options: CompressionOptions = {}
): Promise<Buffer> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 85,
    format = 'jpeg'
  } = options;

  try {
    // Try to use sharp for image compression
    const sharp = await import('sharp').catch(() => null);
    
    if (!sharp) {
      logger.debug('Sharp not available, skipping image compression');
      return imageBuffer; // Return original if sharp is not available
    }

    let pipeline = sharp.default(imageBuffer);

    // Get image metadata
    const metadata = await pipeline.metadata();
    
    // Only compress if image is larger than max dimensions
    if (metadata.width && metadata.height) {
      const needsResize = metadata.width > maxWidth || metadata.height > maxHeight;
      
      if (needsResize) {
        pipeline = pipeline.resize(maxWidth, maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }
    }

    // Apply compression based on format
    if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    }

    const compressedBuffer = await pipeline.toBuffer();
    const originalSize = imageBuffer.length;
    const compressedSize = compressedBuffer.length;
    const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    logger.debug('Image compressed', {
      originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
      compressedSize: `${(compressedSize / 1024).toFixed(2)}KB`,
      savings: `${savings}%`
    });

    return compressedBuffer;
  } catch (error) {
    logger.warn('Image compression failed, using original', {
      error: error instanceof Error ? error.message : String(error)
    });
    return imageBuffer; // Return original on error
  }
}

/**
 * Check if buffer is an image
 */
export function isImageBuffer(buffer: Buffer): boolean {
  // Check for image magic numbers
  const signatures: { [key: number]: string } = {
    0xff: 'jpeg',
    0x89: 'png',
    0x47: 'gif',
    0x52: 'webp'
  };

  const firstByte = buffer[0];
  return signatures[firstByte] !== undefined;
}

/**
 * Get image format from buffer
 */
export function getImageFormat(buffer: Buffer): 'jpeg' | 'png' | 'gif' | 'webp' | 'unknown' {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'gif';
  if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'webp';
  return 'unknown';
}

