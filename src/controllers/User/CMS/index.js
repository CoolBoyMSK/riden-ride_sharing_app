import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getCMSPages,
  getCMSPageById,
} from '../../../services/User/CMS/index.js';

export const getCMSPagesController = (req, res) =>
  handleResponse(
    {
      handler: getCMSPages,
      validationFn: null,
      handlerParams: [],
      successMessage: 'CMS Pages fetched successfully',
    },
    req,
    res,
  );

export const getCMSPageByIdController = (req, res) =>
  handleResponse(
    {
      handler: getCMSPageById,
      validationFn: null,
      handlerParams: [req.params],
      successMessage: 'CMS Page fetched successfully',
    },
    req,
    res,
  );
