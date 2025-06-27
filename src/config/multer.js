import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('❌ Only image files and PDFs are allowed'), false);
  }

  cb(null, true);
};

const limits = {
  fileSize: 5 * 1024 * 1024, // 5MB
};

export const multerConfig = {
  storage,
  fileFilter,
  limits,
};
