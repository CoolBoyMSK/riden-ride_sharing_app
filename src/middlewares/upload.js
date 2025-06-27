import multer from 'multer';
import { multerConfig } from '../config/multer.js';

const uploader = multer(multerConfig);

export const uploadSingle = uploader.single('image');
export const uploadMultiple = uploader.fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 },
]);
export const uploadMany = uploader.array('gallery', 5);