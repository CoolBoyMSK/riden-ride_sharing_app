import mongoose from 'mongoose';
import {
  findUserById,
  updateUserById,
  createProfileUpdateRequest,
} from '../../dal/user/index.js';
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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const update = { ...body };

    // 1️⃣ Validate input
    if (!user?.id) {
      throw new Error('User ID is missing.');
    }

    const myUser = await findUserById(user.id);
    if (!myUser) {
      throw new Error('User not found.');
    }

    // 2️⃣ Handle name change (pending admin request)
    if (update.name) {
      const requestPayload = {
        userId: myUser._id,
        request: {
          field: 'name',
          old: myUser.name,
          new: update.name,
        },
        createdAt: new Date(),
      };

      const requestResult = await createProfileUpdateRequest(requestPayload, {
        session,
      });
      if (!requestResult) {
        throw new Error('Failed to send name update request to admin.');
      }

      // Prevent direct name update
      delete update.name;
    }

    // 3️⃣ Handle file upload
    if (file && file.buffer && file.mimetype) {
      const filename = `${uuidv4()}-${file.originalname}`;
      const folder = `user-profiles/${user.id}`;

      let url;
      try {
        url = await uploadToS3({
          buffer: file.buffer,
          mimetype: file.mimetype,
          folder,
          filename,
        });
      } catch (uploadError) {
        throw new Error(`S3 upload failed: ${uploadError.message}`);
      }

      update.profileImg = url;
    }

    // 4️⃣ Perform database update if there’s something to update
    let updated = null;
    if (Object.keys(update).length > 0) {
      updated = await updateUserById(user.id, update, { session });
      if (!updated) {
        throw new Error('Failed to update profile.');
      }
      delete updated.password;
    }

    // 5️⃣ Commit transaction
    await session.commitTransaction();
    session.endSession();

    resp.data = {
      nameUpdateRequest:
        !!body.name &&
        'Your name change request has been sent to admin for approval.',
      updatedProfile: updated || null,
    };
    return resp;
  } catch (error) {
    // Rollback changes on failure
    await session.abortTransaction();
    session.endSession();

    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message =
      error.message || 'Something went wrong while updating the profile.';
    return resp;
  }
};
