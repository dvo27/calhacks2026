import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getBackendEnv } from '../config/env.js';

export type MediaType = 'image' | 'video';

const s3Client = createS3Client();

function createS3Client() {
  const region = getBackendEnv('S3_REGION', 'AWS_REGION');
  const accessKeyId = getBackendEnv('S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID');
  const secretAccessKey = getBackendEnv('S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY');
  const endpoint = getBackendEnv('S3_ENDPOINT');

  if (!region || !accessKeyId || !secretAccessKey) {
    return null;
  }

  const clientConfig = {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  };

  return new S3Client(clientConfig);
}

function getBucketName() {
  return getBackendEnv('S3_BUCKET');
}

function getPublicBaseUrl() {
  return getBackendEnv('S3_PUBLIC_BASE_URL');
}

function getMediaPrefix(tripId: number | string) {
  return `trips/${tripId}/media`;
}

function inferContentType(fileName: string, mediaType?: MediaType) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.gif')) return 'image/gif';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.mp4')) return 'video/mp4';
  if (lowerName.endsWith('.mov')) return 'video/quicktime';

  return mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
}

export function isStorageEnabled() {
  return Boolean(s3Client && getBucketName());
}

export async function createTripMediaUploadUrl(params: {
  tripId: number | string;
  fileName: string;
  mediaType?: MediaType;
  contentType?: string;
}) {
  if (!s3Client) {
    throw new Error('S3 client is not configured. Set S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.');
  }

  const bucket = getBucketName();
  if (!bucket) {
    throw new Error('S3 bucket is not configured. Set S3_BUCKET.');
  }

  const cleanFileName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `${getMediaPrefix(params.tripId)}/${randomUUID()}-${cleanFileName}`;
  const contentType = params.contentType ?? inferContentType(cleanFileName, params.mediaType);

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn: 900 }
  );

  const publicBaseUrl = getPublicBaseUrl();
  const publicUrl = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/${objectKey}` : null;

  return {
    bucket,
    objectKey,
    contentType,
    uploadUrl,
    publicUrl,
    expiresInSeconds: 900,
  };
}
