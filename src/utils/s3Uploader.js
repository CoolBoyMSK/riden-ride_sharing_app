import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3Client.js';
import env from '../config/envConfig.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import mime from 'mime-types';

async function uploadFileToS3(buffer, key, contentType) {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  } catch (error) {
    console.error(`S3 UPLOAD ERROR: ${error}`);
    throw new Error('Failed to upload file on S3');
  }
  return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}

function makeKey(folder, id, originalName) {
  const ext = path.extname(originalName) || '';
  return `${folder}/${id}/${uuidv4()}${ext}`;
}

export const uploadPassengerImage = (passengerId, file) =>
  uploadFileToS3(
    file.buffer,
    makeKey('passenger', passengerId, file.originalname),
    file.mimetype,
  );

export const uploadDriverImage = (driverId, file) =>
  uploadFileToS3(
    file.buffer,
    makeKey('driver', driverId, file.originalname),
    file.mimetype,
  );

export const uploadAdminImage = (adminId, file) =>
  uploadFileToS3(
    file.buffer,
    makeKey('admin', adminId, file.originalname),
    file.mimetype,
  );

export async function uploadDriverDocumentToS3(driverId, docType, file) {
  if (!file) throw new Error('No file provided');

  let ext = '';
  try {
    if (file.originalname && typeof file.originalname === 'string') {
      // Correctly extract file extension from original name
      ext = path.extname(file.originalname);
    }
  } catch (e) {
    ext = '';
  }

  if (!ext) {
    // Fallback: guess extension from mimetype
    const guessed = file.mimetype ? mime.extension(file.mimetype) : null;
    ext = guessed ? `.${guessed}` : '';
  }

  const key = `documents/${driverId}/${docType}/${uuidv4()}${ext}`;
  return uploadFileToS3(file.buffer, key, file.mimetype);
}
