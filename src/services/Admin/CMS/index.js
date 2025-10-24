import {
  findPages,
  createCMSPage,
  findCMSPageById,
  findCMSPageByIdAndUpdate,
  prepareBlocks,
} from '../../../dal/admin/index.js';
import { uploadAdminImage } from '../../../utils/s3Uploader.js';

// --- Get all pages ---
export const getCMSPages = async (user, resp) => {
  try {
    const pages = await findPages();
    resp.data = pages || [];
    return resp;
  } catch (error) {
    console.error(error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

// --- Add CMS page ---
export const addCMSPage = async (user, { type }, req, files, file, resp) => {
  try {
    let cmsData = {};

    if (!file) {
      resp.error = true;
      resp.error_message = 'No file provided';
      return resp;
    }

    const iconUrl = await uploadAdminImage(user._id, file);
    cmsData.icon = iconUrl;

    if (type === 'faqs') {
      let faqs = req.faqs || [];
      if (!faqs.length) {
        resp.error = true;
        resp.error_message = 'FAQs cannot be empty';
        return resp;
      }

      if (req.faqs) {
        try {
          if (typeof req.faqs === 'string') {
            faqs = JSON.parse(req.faqs); // convert string → array
          }
        } catch (err) {
          resp.error = true;
          resp.error_message = 'Invalid faqs format, must be JSON array';
          return resp;
        }
      }

      cmsData.faqs = faqs;
    } else {
      const content = req.content?.trim();
      if (!content) {
        resp.error = true;
        resp.error_message = 'Content cannot be empty';
        return resp;
      }
      cmsData.content = content;
    }

    const uploadFiles = files || [];
    const images = await prepareBlocks(uploadFiles, user._id);
    cmsData.images = images;

    // create page
    const success = await createCMSPage(req.page, cmsData);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to create CMS page';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error('API ERROR:', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

// --- Get CMS page by ID ---
export const getCMSPageById = async (user, { id }, resp) => {
  try {
    const page = await findCMSPageById(id);
    if (!page) {
      resp.error = true;
      resp.error_message = 'Page not found';
      return resp;
    }
    resp.data = page;
    return resp;
  } catch (error) {
    console.error(error);
    resp.error = true;
    resp.error_message = error.message || 'Failed to fetch page';
    return resp;
  }
};

export const editCMSPage = async (
  user,
  { id },
  { content, faqs, existingImages }, // added existingImages here
  files,
  file,
  resp,
) => {
  try {
    let cmsData = {};

    // --- 1️⃣ Get original page ---
    const originalPage = await findCMSPageById(id);
    if (!originalPage) {
      resp.error = true;
      resp.error_message = 'Page not found';
      return resp;
    }

    // --- 2️⃣ Handle icon upload ---
    if (file) {
      const iconUrl = await uploadAdminImage(user._id, file);
      cmsData.icon = iconUrl;
    }

    // --- 3️⃣ Handle FAQs or content ---
    if (originalPage.type === 'faqs') {
      let newFaqs = faqs || [];

      if (faqs) {
        try {
          if (typeof faqs === 'string') {
            newFaqs = JSON.parse(faqs); // convert string → array
          }
        } catch (err) {
          resp.error = true;
          resp.error_message = 'Invalid FAQs format, must be JSON array';
          return resp;
        }
      }

      if (!Array.isArray(newFaqs) || newFaqs.length === 0) {
        resp.error = true;
        resp.error_message = 'FAQs cannot be empty';
        return resp;
      }

      cmsData.faqs = newFaqs;
    } else {
      const newContent = content?.trim();
      if (!newContent) {
        resp.error = true;
        resp.error_message = 'Content cannot be empty';
        return resp;
      }
      cmsData.content = newContent;
    }

    // --- 4️⃣ Handle images (keep / add / remove) ---
    let finalImages = [];

    // Step 1: Start with existing images (if sent)
    if (existingImages) {
      try {
        const parsedExisting =
          typeof existingImages === 'string'
            ? JSON.parse(existingImages)
            : existingImages;

        if (Array.isArray(parsedExisting)) {
          finalImages = parsedExisting.filter(Boolean);
        } else {
          resp.error = true;
          resp.error_message = 'existingImages must be an array';
          return resp;
        }
      } catch (err) {
        resp.error = true;
        resp.error_message = 'Invalid existingImages format';
        return resp;
      }
    }

    // Step 2: Add newly uploaded images (if any)
    if (files && files.length > 0) {
      const uploadedImages = await prepareBlocks(files, user._id);
      finalImages = [...finalImages, ...uploadedImages];
    }

    cmsData.images = finalImages;

    // --- 5️⃣ Update CMS Page ---
    const updatedPage = await findCMSPageByIdAndUpdate(id, cmsData);
    if (!updatedPage) {
      resp.error = true;
      resp.error_message = 'Failed to update CMS page';
      return resp;
    }

    // --- ✅ Success ---
    resp.data = updatedPage;
    return resp;
  } catch (error) {
    console.error('API ERROR (editCMSPage):', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
