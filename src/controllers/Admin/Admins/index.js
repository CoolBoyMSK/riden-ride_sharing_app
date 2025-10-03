import {
  createAdmin,
  getAllAdmins,
  updateAdmin,
  getSearchAdmins,
  deleteAdminById,
  getAdminById,
} from '../../../services/Admin/Admins/adminService.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validateCreateAdmin,
  validateUpdateAdmin,
} from '../../../validations/admin/adminValidations.js';

export const fetchAdmins = (req, res) => {
  return handleResponse(
    {
      handler: getAllAdmins,
      handlerParams: [req.user, req.query],
      successMessage: 'Admins fetched successfully',
    },
    req,
    res,
  );
};

export const addAdmin = (req, res) => {
  return handleResponse(
    {
      handler: createAdmin,
      validationFn: validateCreateAdmin,
      handlerParams: [req.body, req.user],
      successMessage: 'Admin created successfully',
    },
    req,
    res,
  );
};

export const getSearchAdminsController = (req, res) => {
  return handleResponse(
    {
      handler: getSearchAdmins,
      // validationFn: validateUpdateAdmin,
      handlerParams: [req.query],
      successMessage: 'Admin searched successfully',
    },
    req,
    res,
  );
};

export const updateAdminController = (req, res) => {
  const payload = { ...req.body, id: req.params.id };
  return handleResponse(
    {
      handler: updateAdmin,
      validationFn: validateUpdateAdmin,
      handlerParams: [payload, req.user],
      successMessage: 'Admin updated successfully',
    },
    req,
    res,
  );
};

export const deleteAdminByIdController = (req, res) => {
  return handleResponse(
    {
      handler: deleteAdminById,
      // validationFn: validateUpdateAdmin,
      handlerParams: [req.params],
      successMessage: 'Admin deleted successfully',
    },
    req,
    res,
  );
};

export const getAdminByIdController = (req, res) => {
  return handleResponse(
    {
      handler: getAdminById,
      validationFn: null,
      handlerParams: [req.params],
      successMessage: 'Admin deleted successfully',
    },
    req,
    res,
  );
};
