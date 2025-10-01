import { findCMSPages, findCMSPageById } from '../../../dal/user/index.js';

export const getCMSPages = async (resp) => {
  try {
    const success = await findCMSPages();
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to find CMS Pages';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const getCMSPageById = async ({ id }, resp) => {
  try {
    const success = await findCMSPageById(id);
    if (!success) {
      resp.error = true;
      resp.error_message = 'Failed to find CMS Page';
      return resp;
    }

    resp.data = success;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
