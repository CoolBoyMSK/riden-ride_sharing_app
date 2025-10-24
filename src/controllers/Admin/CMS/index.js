import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getCMSPages,
  addCMSPage,
  getCMSPageById,
  editCMSPage,
} from '../../../services/Admin/CMS/index.js';

export const getCMSPagesController = (req, res) =>
  handleResponse(
    {
      handler: getCMSPages,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'All Pages fetched successfully',
    },
    req,
    res,
  );

export const addCMSPageController = (req, res) =>
  handleResponse(
    {
      handler: addCMSPage,
      validationFn: null,
      handlerParams: [
        req.user,
        req.query,
        req.body,
        req.files?.gallery || [],
        req.files?.icon ? req.files.icon[0] : null,
      ],
      successMessage: 'CMS page added successfully',
    },
    req,
    res,
  );

export const getCMSPageByIdController = (req, res) =>
  handleResponse(
    {
      handler: getCMSPageById,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'CMS page fetched successfully',
    },
    req,
    res,
  );

export const editCMSPageController = (req, res) =>
  handleResponse(
    {
      handler: editCMSPage,
      validationFn: null,
      handlerParams: [
        req.user,
        req.params,
        // req.query,
        req.body,
        req.files?.gallery || [],
        req.files?.icon ? req.files.icon[0] : null,
      ],
      successMessage: 'CMS page updated successfully',
    },
    req,
    res,
  );
