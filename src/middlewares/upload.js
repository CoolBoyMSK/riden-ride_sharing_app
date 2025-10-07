import multer from 'multer';
import { multerConfig } from '../config/multer.js';

const uploader = multer(multerConfig);

export const uploadSingle = uploader.single('image');
export const uploadMultiple = uploader.fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 },
]);

// Combined upload handler for CMS
export const uploadCMSFiles = uploader.fields([
  { name: 'icon', maxCount: 1 }, // for icon
  { name: 'gallery', maxCount: 10 }, // for multiple content images
]);

export const uploadMany = uploader.array('gallery', 5);
