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
export const addCMSPage = async (user, req, files, resp) => {
  try {
    // --- Parse textBlocks safely ---
    let textBlocks = req.textBlocks || [];
    if (typeof textBlocks === 'string') {
      try {
        textBlocks = JSON.parse(textBlocks); // expecting JSON array string
      } catch (err) {
        textBlocks = [textBlocks]; // fallback as single block
      }
    }

    const uploadFiles = files || [];

    // --- Prepare content blocks ---
    const blocks = await prepareBlocks(textBlocks, uploadFiles, user._id);

    if (!blocks.length) {
      resp.error = true;
      resp.error_message = 'Content cannot be empty';
      return resp;
    }

    // --- Create CMS page ---
    const success = await createCMSPage(req.page, blocks);

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

export const editCMSPage = async (user, { id }, req, files, resp) => {
  try {
    // --- Parse textBlocks safely ---
    let textBlocks = req.textBlocks || [];
    if (typeof textBlocks === 'string') {
      try {
        textBlocks = JSON.parse(textBlocks); // expecting JSON array string
      } catch (err) {
        textBlocks = [textBlocks]; // fallback as single block
      }
    }

    const uploadFiles = files || [];

    // --- Prepare updated content blocks ---
    const blocks = await prepareBlocks(textBlocks, uploadFiles, user._id);

    if (!blocks.length) {
      resp.error = true;
      resp.error_message = 'Content cannot be empty';
      return resp;
    }

    // --- Update page ---
    const page = await findCMSPageByIdAndUpdate(id, blocks);
    if (!page) {
      resp.error = true;
      resp.error_message = 'Failed to update page';
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
