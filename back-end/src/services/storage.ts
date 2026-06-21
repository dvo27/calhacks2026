import { randomUUID } from 'node:crypto';
import { supabase } from './supabase.js';

const MEDIA_BUCKET = 'trip-media';

let bucketReady: Promise<void> | null = null;

// Supabase Storage is S3-compatible; we use it to back trip_media.s3_url.
async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (error) throw error;
      if (!buckets?.some((bucket) => bucket.name === MEDIA_BUCKET)) {
        const { error: createError } = await supabase.storage.createBucket(MEDIA_BUCKET, {
          public: true,
        });
        // Ignore "already exists" races between concurrent requests.
        if (createError && !/exist/i.test(createError.message)) {
          throw createError;
        }
      }
    })().catch((err) => {
      // Reset so a later call can retry rather than caching the failure forever.
      bucketReady = null;
      throw err;
    });
  }

  return bucketReady;
}

function extensionForMediaType(mediaType: string) {
  if (/png/i.test(mediaType)) return 'png';
  if (/webp/i.test(mediaType)) return 'webp';
  if (/heic|heif/i.test(mediaType)) return 'heic';
  if (/gif/i.test(mediaType)) return 'gif';
  return 'jpg';
}

export type UploadedMedia = {
  publicUrl: string;
  path: string;
  contentType: string;
};

/**
 * Decode a base64 image payload and upload it to Supabase Storage, returning a
 * public URL suitable for trip_media.s3_url.
 */
export async function uploadActivityImage(
  tripId: number | string,
  activityId: number | string,
  base64Data: string,
  mediaType = 'image/jpeg'
): Promise<UploadedMedia> {
  await ensureBucket();

  // Accept both raw base64 and data-URI strings.
  const commaIndex = base64Data.indexOf(',');
  const cleanBase64 = base64Data.startsWith('data:') && commaIndex !== -1
    ? base64Data.slice(commaIndex + 1)
    : base64Data;

  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer.length) {
    throw new Error('Image payload was empty or not valid base64.');
  }

  const contentType = mediaType || 'image/jpeg';
  const ext = extensionForMediaType(contentType);
  const path = `${tripId}/${activityId}/${Date.now()}-${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, path, contentType };
}
