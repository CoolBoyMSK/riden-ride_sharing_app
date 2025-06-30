import {
  createAdmin,
  getAllAdmins,
} from '../../../services/Admin/Admins/adminService.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import { validateCreateAdmin } from '../../../validations/admin/adminValidations.js';

export const fetchAdmins = (req, res) => {
  return handleResponse(
    {
      handler: getAllAdmins,
      handlerParams: [],
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
