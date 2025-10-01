import {
  findPages,
  createCMSPage,
  findCMSPageById,
  findCMSPageByIdAndUpdate,
  prepareBlocks,
} from '../../../dal/admin/index.js';

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
export const addCMSPage = async (user, { type }, req, files, resp) => {
  try {
    let cmsData = {};
    console.log(req);

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

export const editCMSPage = async (user, { id }, { type }, req, files, resp) => {
  try {
    let cmsData = {};

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

    // update page
    const page = await findCMSPageByIdAndUpdate(id, cmsData);
    if (!page) {
      resp.error = true;
      resp.error_message = 'Failed to update CMS page';
      return resp;
    }

    resp.data = page;
    return resp;
  } catch (error) {
    console.error('API ERROR:', error);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
