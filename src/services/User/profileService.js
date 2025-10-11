import mongoose from 'mongoose';
import {
  findUserById,
  updateUserById,
  createProfileUpdateRequest,
  isSameImage,
  findUserByPhone,
  findUserByEmail,
} from '../../dal/user/index.js';
import { uploadPassengerImage as uploadToS3 } from '../../utils/s3Uploader.js';
import { v4 as uuidv4 } from 'uuid';
import {
  requestEmailOtp,
  verifyEmailOtp,
  requestPhoneOtp,
  verifyPhoneOtp,
  emailOtpKey,
  emailCooldownKey,
  emailPendingKey,
  phoneOtpKey,
  phoneCooldownKey,
  phonePendingKey,
} from '../../utils/otpUtils.js';
import redisConfig from '../../config/redisConfig.js';

export const getUserProfile = async (user, resp) => {
  const profile = await findUserById(user.id);
  if (!profile) {
    resp.error = true;
    resp.error_message = 'User not found';
    return resp;
  }
  delete profile.userId.password;
  resp.data = profile;
  return resp;
};

export const updateUserProfile = async (user, body, file, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const update = { ...body };
    const messages = {};
    const otpRedirect = {};

    if (!user?.id) throw new Error('User ID is missing.');

    const myUser = await findUserById(user.id);
    if (!myUser) throw new Error('User not found.');

    // Normalize roles (handles string or array, case-insensitive)
    const roles = Array.isArray(user.roles)
      ? user.roles
      : [user.roles].filter(Boolean);
    const rolesNorm = roles.map((r) => String(r).toLowerCase().trim());
    const isDriver = rolesNorm.includes('driver');
    const isPassenger = rolesNorm.includes('passenger');

    // --- NAME ---
    if (
      update.name?.trim() &&
      update.name.trim() !== myUser.userId.name?.trim()
    ) {
      const requestPayload = {
        userId: myUser.userId._id,
        request: {
          field: 'name',
          old: myUser.userId.name?.trim(),
          new: update.name.trim(),
        },
        createdAt: new Date(),
      };
      const requestResult = await createProfileUpdateRequest(requestPayload, {
        session,
      });
      if (!requestResult)
        throw new Error('Failed to send name update request to admin.');

      messages.nameMessage = 'Name update request has been sent successfully';
      delete update.name;
    }

    // --- IMAGE ---
    if (file) {
      // Determine the new image source for comparison: prefer Buffer (memoryStorage), otherwise path
      const newImageSource = Buffer.isBuffer(file.buffer)
        ? file.buffer
        : file.path;

      if (!newImageSource) {
        // If neither buffer nor path is available, skip image logic
        console.warn(
          'No file.buffer or file.path available on multer file; skipping image comparison/upload.',
        );
      } else {
        // Compare existing (URL) with the new image (buffer or path)
        const same = await isSameImage(
          myUser.userId.profileImg,
          newImageSource,
        );

        if (!same) {
          // Try uploading directly (most uploadToS3 implementations accept buffer within file)
          let url;
          try {
            url = await uploadToS3(myUser.userId._id, file);
          } catch (uploadErr) {
            console.warn(
              'uploadToS3 failed with direct file. Attempting tmp-file fallback:',
              uploadErr?.message,
            );

            // Fallback: write buffer to temp file and call uploadToS3 with path-like object
            if (file?.buffer) {
              const tmpName = `${uuidv4()}-${file.originalname || 'upload'}`;
              const tmpPath = path.join(os.tmpdir(), tmpName);
              try {
                await fs.writeFile(tmpPath, file.buffer);
                // many upload helpers accept object with path; adjust if your uploadToS3 signature differs
                url = await uploadToS3(myUser.userId._id, {
                  path: tmpPath,
                  mimetype: file.mimetype,
                  originalname: file.originalname,
                });
              } finally {
                // best-effort cleanup
                try {
                  await fs.unlink(tmpPath);
                } catch (e) {
                  /* ignore */
                }
              }
            } else {
              throw uploadErr; // cannot fallback
            }
          }

          if (!url) throw new Error('S3 upload returned no URL.');

          if (isPassenger) {
            // Passengers can directly update
            update.profileImg = url;
            messages.profileImgMessage = 'Profile Image updated successfully';
          } else if (isDriver) {
            // Drivers require admin approval
            const requestPayload = {
              userId: myUser.userId._id,
              request: {
                field: 'profileImg',
                old: myUser.userId.profileImg,
                new: url,
              },
              createdAt: new Date(),
            };
            const requestResult = await createProfileUpdateRequest(
              requestPayload,
              { session },
            );
            if (!requestResult)
              throw new Error('Failed to send image update request.');

            messages.profileImgMessage =
              'Profile Image update request has been sent successfully';
          }
        } else {
          messages.profileImgMessage =
            'Uploaded image is same as existing; no action taken.';
          console.log('Uploaded image is same as existing; no action taken.');
        }
      }
    }

    // --- EMAIL ---
    if (
      update.email?.trim() &&
      update.email.trim() !== myUser.userId.email?.trim()
    ) {
      const newEmail = update.email.trim();
      const isRegistered = await findUserByEmail(newEmail);
      if (isRegistered) {
        messages.emailMessage = `Email ${newEmail} is already registered`;
      } else {
        otpRedirect.email = {
          success: true,
          currentEmail: myUser.userId.email?.trim(),
          newEmail,
          name: myUser.userId.name?.trim(),
          userId: myUser.userId._id,
        };
      }
    }

    // --- PHONE ---
    if (
      update.phoneNumber?.trim() &&
      update.phoneNumber.trim() !== myUser.userId.phoneNumber?.trim()
    ) {
      const newPhone = update.phoneNumber?.trim();
      const isRegistered = await findUserByPhone(newPhone);
      if (isRegistered) {
        messages.phoneNumberMessage = `Phone Number ${update.phoneNumber.trim()} is already registered`;
      } else {
        otpRedirect.phoneNumber = {
          success: true,
          currentPhone: myUser.userId.phoneNumber?.trim(),
          newPhone,
          name: myUser.userId.name?.trim(),
          userId: myUser.userId._id,
        };
      }
    }

    // --- ALLOWED FIELDS (role-based) ---
    const BASE_ALLOWED_FIELDS = ['gender'];
    const ALLOWED_FIELDS = isPassenger
      ? [...BASE_ALLOWED_FIELDS, 'profileImg']
      : BASE_ALLOWED_FIELDS;

    const safeUpdate = Object.keys(update)
      .filter((key) => ALLOWED_FIELDS.includes(key))
      .reduce((obj, key) => {
        obj[key] = update[key];
        return obj;
      }, {});

    // --- PERFORM UPDATE ---
    let updated = null;
    if (Object.keys(safeUpdate).length > 0) {
      updated = await updateUserById(user.id, safeUpdate, { session });
      if (!updated) throw new Error('Failed to update profile.');
      updated = updated.toObject ? updated.toObject() : updated;
      delete updated.password;
    }

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      messages,
      otpRedirect,
      updatedProfile: updated || null,
    };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const sendEmailUpdateOtp = async (
  { currentEmail, newEmail, name, userId },
  resp,
) => {
  try {
    // Context includes who requested and target new email
    const context = { userId, newEmail };

    const result = await requestEmailOtp(currentEmail, name, context, 'update');

    if (!result.ok) {
      resp.error = true;
      resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds}s`;
      return resp;
    }

    resp.data = {
      success: true,
      message: `OTP has been sent to ${currentEmail}`,
      email: currentEmail,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const verifyEmailUpdate = async ({ email, otp }, resp) => {
  try {
    if (!email || !otp) {
      resp.error = true;
      resp.error_message = 'Email and OTP are required';
      return resp;
    }

    const result = await verifyEmailOtp(email, otp);

    if (!result.ok) {
      resp.error = true;
      resp.error_message =
        result.reason === 'expired_or_not_requested'
          ? 'OTP expired or not requested'
          : 'Invalid OTP';
      return resp;
    }

    const pending = result.pending;
    if (!pending || !pending.userId || !pending.newEmail) {
      resp.error = true;
      resp.error_message = 'Invalid or missing verification context';
      return resp;
    }

    // Prevent email collision (someone else might’ve taken it in the meantime)
    const isTaken = await findUserByEmail(pending.newEmail);
    if (isTaken) {
      resp.error = true;
      resp.error_message = 'This email is already in use by another account';
      return resp;
    }

    // Update the user’s email and reset verification flag
    const updated = await updateUserById(pending.userId, {
      email: pending.newEmail,
      isEmailVerified: false,
    });

    if (!updated) {
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    // Final cleanup
    await redisConfig.del(
      emailOtpKey(email),
      emailCooldownKey(email),
      emailPendingKey(email),
    );

    resp.data = updated;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const sendPhoneUpdateOtp = async (
  { currentPhone, newPhone, name, userId },
  resp,
) => {
  try {
    const context = { userId, newPhone };

    const result = await requestPhoneOtp(currentPhone, name, context, 'update');

    if (!result.ok) {
      resp.error = true;
      resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
      return resp;
    }

    resp.data = {
      success: true,
      message: `OTP has been sent to ${currentPhone}`,
      phoneNumber: currentPhone,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const verifyPhoneUpdate = async ({ phoneNumber, otp }, resp) => {
  try {
    if (!phoneNumber || !otp) {
      resp.error = true;
      resp.error_message = 'Phone number and OTP are required';
      return resp;
    }

    const result = await verifyPhoneOtp(phoneNumber, otp);

    if (!result.ok) {
      resp.error = true;
      switch (result.reason) {
        case 'expired_or_not_requested':
          resp.error_message = 'OTP expired or not requested';
          break;
        case 'invalid_otp':
          resp.error_message = 'Invalid OTP';
          break;
        case 'too_many_attempts':
          resp.error_message = 'Too many failed attempts, try later';
          break;
        default:
          resp.error_message = 'Verification failed';
      }
      return resp;
    }

    const pending = result.pending;
    if (!pending || !pending.userId || !pending.newPhone) {
      resp.error = true;
      resp.error_message = 'Invalid verification context';
      return resp;
    }

    // Prevent duplicate phone
    const isTaken = await findUserByPhone(pending.newPhone);
    if (isTaken) {
      resp.error = true;
      resp.error_message = 'This phone number is already registered';
      return resp;
    }

    // Update user's phone
    const updated = await updateUserById(pending.userId, {
      phoneNumber: pending.newPhone,
      isPhoneVerified: false,
    });

    if (!updated) {
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    // Final cleanup
    await redisConfig.del(
      phoneOtpKey(phoneNumber),
      phoneCooldownKey(phoneNumber),
      phonePendingKey(phoneNumber),
    );

    resp.data = updated;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};
