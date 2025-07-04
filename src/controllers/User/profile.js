import {
  getUserProfile,
  updateUserProfile,
} from '../../services/User/profileService.js';
import { handleResponse } from '../../utils/handleRespone.js';
import { validateProfileUpdate } from '../../validations/user/profileValidations.js';

export const fetchProfile = (req, res) =>
  handleResponse(
    {
      handler: getUserProfile,
      handlerParams: [req.user],
      successMessage: 'Profile fetched successfully',
    },
    req,
    res,
  );

export const editProfile = (req, res) =>
  handleResponse(
    {
      handler: updateUserProfile,
      validationFn: validateProfileUpdate,
      handlerParams: [req.user, req.body, req.file],
      successMessage: 'Profile updated successfully',
    },
    req,
    res,
  );
