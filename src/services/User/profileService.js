import { findUserById, updateUserById } from '../../dal/user/index.js';
import { uploadPassengerImage as uploadToS3 } from '../../utils/s3Uploader.js';
import { v4 as uuidv4 } from 'uuid';

export const getUserProfile = async (user, resp) => {
  const profile = await findUserById(user.id);
  if (!profile) {
    resp.error = true;
    resp.error_message = 'User not found';
    return resp;
  }
  delete profile.password;
  resp.data = profile;
  return resp;
};

export const updateUserProfile = async (user, body, file, resp) => {
  const update = { ...body };

  if (file) {
    const filename = `${uuidv4()}-${file.originalname}`;
    const folder = `user-profiles/${user.id}`;
    const url = await uploadToS3({
      buffer: file.buffer,
      mimetype: file.mimetype,
      folder,
      filename,
    });
    update.profileImg = url;
  }

  const updated = await updateUserById(user.id, update);
  if (!updated) {
    resp.error = true;
    resp.error_message = 'Failed to update profile';
    return resp;
  }
  delete updated.password;
  resp.data = updated;
  return resp;
};
