import mongoose from 'mongoose';
import {
  findUserById,
  updateUserById,
  createProfileUpdateRequest,
  sendEmailUpdateOtp,
  isSameImage,
} from '../../dal/user/index.js';
import { uploadPassengerImage as uploadToS3 } from '../../utils/s3Uploader.js';
import { v4 as uuidv4 } from 'uuid';
import { generateOtp } from '../../utils/auth.js';
import { sendOtp } from '../../utils/otpUtils.js';

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

// export const updateUserProfile = async (user, body, file, resp) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     console.log(file);
//     const update = { ...body };

//     // 1️⃣ Validate input
//     if (!user?.id) {
//       throw new Error('User ID is missing.');
//     }

//     const myUser = await findUserById(user.id);
//     console.log(myUser);
//     if (!myUser) {
//       throw new Error('User not found.');
//     }

//     if (['driver'].includes(myUser.roles)) {
//       if (update.name.trim() !== myUser.name.trim()) {
//         const requestPayload = {
//           userId: myUser._id,
//           request: {
//             field: 'name',
//             old: myUser.name.trim(),
//             new: update.name.trim(),
//           },
//           createdAt: new Date(),
//         };
//         const requestResult = await createProfileUpdateRequest(requestPayload, {
//           session,
//         });
//         if (!requestResult) {
//           throw new Error('Failed to send name update request to admin.');
//         }
//         delete update.name;
//       }

//       if (file?.path) {
//         const isSame = await isSameImage(myUser.profileImg, file.path);
//         if (!isSame) {
//           let url;
//           try {
//             url = await uploadToS3(myUser.profileImg, file);
//           } catch (uploadError) {
//             throw new Error(`S3 upload failed: ${uploadError.message}`);
//           }

//           const requestPayload = {
//             userId: myUser._id,
//             request: {
//               field: 'profileImg',
//               old: myUser.profileImg,
//               new: url,
//             },
//             createdAt: new Date(),
//           };

//           const requestResult = await createProfileUpdateRequest(
//             requestPayload,
//             {
//               session,
//             },
//           );
//           if (!requestResult) {
//             throw new Error('Failed to send image update request to admin.');
//           }
//         }
//       }

//       if (update.email.trim() !== myUser.email.trim()) {
//         const emailOtpMail = await sendEmailUpdateOtp(
//           myUser.email,
//           generateOtp(),
//           myUser.username,
//         );
//         if (!emailOtpMail)
//           throw new Error('Failed to send email verification otp');
//         delete update.email;
//       }

//       if (update.phoneNumber.trim() !== myUser.phoneNumber.trim()) {
//         const otpSent = await sendOtp(myUser.phoneNumber);
//         if (!otpSent) throw new Error('Failed to send Phone verification Otp');
//         delete update.phoneNumber;
//       }
//     }

//     if (['passenger'].includes(myUser.roles)) {
//       if (update.name.trim() !== myUser.name.trim()) {
//         const requestPayload = {
//           userId: myUser._id,
//           request: {
//             field: 'name',
//             old: myUser.name.trim(),
//             new: update.name.trim(),
//           },
//           createdAt: new Date(),
//         };
//         const requestResult = await createProfileUpdateRequest(requestPayload, {
//           session,
//         });
//         if (!requestResult) {
//           throw new Error('Failed to send name update request to admin.');
//         }
//         delete update.name;
//       }

//       if (update.email.trim() !== myUser.email.trim()) {
//         const emailOtpMail = await sendEmailUpdateOtp(
//           myUser.email,
//           generateOtp(),
//           myUser.username,
//         );
//         if (!emailOtpMail)
//           throw new Error('Failed to send email verification otp');
//         delete update.email;
//       }

//       if (update.phoneNumber.trim() !== myUser.phoneNumber.trim()) {
//         const otpSent = await sendOtp(phoneNumber);
//         if (!otpSent) throw new Error('Failed to send Phone verification Otp');
//         delete update.phoneNumber;
//       }

//       // 3️⃣ Handle file upload
//       if (file && file.buffer && file.mimetype) {
//         let url;
//         try {
//           url = await uploadToS3(myUser._id, file);
//         } catch (uploadError) {
//           throw new Error(`S3 upload failed: ${uploadError.message}`);
//         }

//         update.profileImg = url;
//       }
//     }

//     console.log(update);

//     // 4️⃣ Perform database update if there’s something to update
//     let updated = null;
//     if (Object.keys(update).length > 0) {
//       updated = await updateUserById(user.id, update, { session });
//       if (!updated) {
//         throw new Error('Failed to update profile.');
//       }
//       delete updated.password;
//     }

//     // 5️⃣ Commit transaction
//     await session.commitTransaction();
//     session.endSession();

//     resp.data = {
//       nameUpdateRequest:
//         !!body.name &&
//         'Your name change request has been sent to admin for approval.',
//       updatedProfile: updated || null,
//     };
//     return resp;
//   } catch (error) {
//     // Rollback changes on failure
//     await session.abortTransaction();
//     session.endSession();

//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message =
//       error.message || 'Something went wrong while updating the profile.';
//     return resp;
//   }
// };

export const updateUserProfile = async (user, body, file, resp) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const update = { ...body };

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

    console.log(
      'RolesNorm:',
      rolesNorm,
      'isPassenger:',
      isPassenger,
      'isDriver:',
      isDriver,
    );
    console.log(
      'Multer file object:',
      file?.originalname
        ? {
            originalname: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
          }
        : file,
    );

    // --- NAME ---
    if (update.name?.trim() && update.name.trim() !== myUser.name?.trim()) {
      const requestPayload = {
        userId: myUser._id,
        request: {
          field: 'name',
          old: myUser.name?.trim(),
          new: update.name.trim(),
        },
        createdAt: new Date(),
      };
      const requestResult = await createProfileUpdateRequest(requestPayload, {
        session,
      });
      if (!requestResult)
        throw new Error('Failed to send name update request to admin.');
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
        const same = await isSameImage(myUser.profileImg, newImageSource);
        console.log('isSameImage result:', same);

        if (!same) {
          // Try uploading directly (most uploadToS3 implementations accept buffer within file)
          let url;
          try {
            url = await uploadToS3(myUser._id, file);
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
                url = await uploadToS3(myUser._id, {
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
            console.log('Passenger profileImg set for update:', url);
          } else if (isDriver) {
            // Drivers require admin approval
            const requestPayload = {
              userId: myUser._id,
              request: {
                field: 'profileImg',
                old: myUser.profileImg,
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
            console.log('Driver image update request created, url:', url);
          }
        } else {
          console.log('Uploaded image is same as existing; no action taken.');
        }
      }
    }

    // --- EMAIL ---
    if (update.email?.trim() && update.email.trim() !== myUser.email?.trim()) {
      await sendEmailUpdateOtp(myUser.email, generateOtp(), myUser.name);
      delete update.email; // require verification; do not write directly
    }

    // --- PHONE ---
    if (
      update.phoneNumber?.trim() &&
      update.phoneNumber.trim() !== myUser.phoneNumber?.trim()
    ) {
      const otpSent = await sendOtp(update.phoneNumber);
      if (!otpSent) throw new Error('Failed to send phone verification Otp.');
      delete update.phoneNumber;
    }

    // --- ALLOWED FIELDS (role-based) ---
    const BASE_ALLOWED_FIELDS = ['gender', 'phoneNumber'];
    const ALLOWED_FIELDS = isPassenger
      ? [...BASE_ALLOWED_FIELDS, 'profileImg']
      : BASE_ALLOWED_FIELDS;

    const safeUpdate = Object.keys(update)
      .filter((key) => ALLOWED_FIELDS.includes(key))
      .reduce((obj, key) => {
        obj[key] = update[key];
        return obj;
      }, {});

    console.log('safeUpdate to apply:', safeUpdate);

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
      nameUpdateRequest: !!body.name
        ? 'Your name change request has been sent to admin for approval.'
        : null,
      updatedProfile: updated || null,
    };
    return resp;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error('API ERROR:', err);
    resp.error = true;
    resp.error_message =
      err.message || 'Something went wrong while updating the profile.';
    return resp;
  }
};

export const verifyEmailUpdate = async (body, resp) => {
  try {
  } catch (error) {
    console.error('API ERROR:', err);
    resp.error = true;
    resp.error_message =
      err.message || 'Something went wrong while verifying email update';
    return resp;
  }
};
