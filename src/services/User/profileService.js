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
  generateOtpToken,
  verifyOtpToken,
  revokeToken,
} from '../../utils/otpUtils.js';
import redisConfig from '../../config/redisConfig.js';
import bcrypt from 'bcrypt';

export const getUserProfile = async (user, resp) => {
  const profile = await findUserById(user.id);
  console.log(profile);
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
    const passwordRedirect = {}; // Changed from otpRedirect to passwordRedirect

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

    // --- PASSWORD VERIFICATION FOR EMAIL/PHONE CHANGES ---
    const emailChangeRequested =
      update.email?.trim() &&
      update.email.trim() !== myUser.userId.email?.trim();
    const phoneChangeRequested =
      update.phoneNumber?.trim() &&
      update.phoneNumber.trim() !== myUser.userId.phoneNumber?.trim();

    if (emailChangeRequested || phoneChangeRequested) {
      // Check if password is provided for verification
      if (!update.password) {
        resp.error = true;
        resp.error_message =
          'Password is required to change email or phone number';
        return resp;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(
        update.password,
        myUser.userId.password,
      );
      if (!isPasswordValid) {
        resp.error = true;
        resp.error_message = 'Invalid password';
        return resp;
      }

      // Remove password from update object after verification
      delete update.password;

      // Handle email change
      if (emailChangeRequested) {
        const newEmail = update.email.trim();
        const isRegistered = await findUserByEmail(newEmail);
        if (isRegistered) {
          messages.emailMessage = `Email ${newEmail} is already registered`;
          delete update.email;
        } else {
          passwordRedirect.email = {
            success: true,
            currentEmail: myUser.userId.email?.trim(),
            newEmail,
            name: myUser.userId.name?.trim(),
            userId: myUser.userId._id,
            requiresPassword: false, // Password already verified
          };
          // Don't delete email yet - we'll handle it after OTP verification
        }
      }

      // Handle phone change
      if (phoneChangeRequested) {
        const newPhone = update.phoneNumber.trim();
        const isRegistered = await findUserByPhone(newPhone);
        if (isRegistered) {
          messages.phoneNumberMessage = `Phone Number ${newPhone} is already registered`;
          delete update.phoneNumber;
        } else {
          passwordRedirect.phoneNumber = {
            success: true,
            currentPhone: myUser.userId.phoneNumber?.trim(),
            newPhone,
            name: myUser.userId.name?.trim(),
            userId: myUser.userId._id,
            requiresPassword: false, // Password already verified
          };
          // Don't delete phone yet - we'll handle it after OTP verification
        }
      }

      // If both email and phone are being changed, store the context for coordinated update
      if (emailChangeRequested && phoneChangeRequested) {
        passwordRedirect.bothChanging = true;
      }
    } else {
      // Handle email without password (if no change requested but email exists in update)
      if (
        update.email?.trim() &&
        update.email.trim() !== myUser.userId.email?.trim()
      ) {
        const newEmail = update.email.trim();
        const isRegistered = await findUserByEmail(newEmail);
        if (isRegistered) {
          messages.emailMessage = `Email ${newEmail} is already registered`;
        } else {
          messages.emailMessage = 'Password is required to change email';
        }
        delete update.email;
      }

      // Handle phone without password (if no change requested but phone exists in update)
      if (
        update.phoneNumber?.trim() &&
        update.phoneNumber.trim() !== myUser.userId.phoneNumber?.trim()
      ) {
        const newPhone = update.phoneNumber.trim();
        const isRegistered = await findUserByPhone(newPhone);
        if (isRegistered) {
          messages.phoneNumberMessage = `Phone Number ${newPhone} is already registered`;
        } else {
          messages.phoneNumberMessage =
            'Password is required to change phone number';
        }
        delete update.phoneNumber;
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
      passwordRedirect, // Changed from otpRedirect to passwordRedirect
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
  user,
  { newEmail, requiresPassword = true, password },
  resp,
) => {
  try {
    const myUser = await findUserById(user.id);
    if (!myUser) {
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    if (requiresPassword) {
      const isPasswordValid = await bcrypt.compare(
        password,
        myUser.userId.password,
      );
      if (!isPasswordValid) {
        resp.error = true;
        resp.error_message = 'Invalid password';
        return resp;
      }
    }

    // Context includes who requested and target new email
    const context = { userId: user.id, newEmail };

    const result = await requestEmailOtp(
      newEmail,
      myUser.name,
      context,
      'update',
    ); // Send to NEW email

    if (!result.ok) {
      resp.error = true;
      resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds}s`;
      return resp;
    }

    resp.data = {
      success: true,
      message: `OTP has been sent to ${newEmail}`,
      email: newEmail, // Confirm OTP sent to new email
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const verifyEmailUpdate = async (user, { email, otp }, resp) => {
  try {
    if (!email || !otp || !user) {
      resp.error = true;
      resp.error_message = 'Email, OTP, and user ID are required';
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

    // Verify the user ID matches
    if (pending.userId.toString() !== user.id.toString()) {
      resp.error = true;
      resp.error_message = 'User ID mismatch';
      return resp;
    }

    // Prevent email collision (someone else might've taken it in the meantime)
    const isTaken = await findUserByEmail(pending.newEmail);
    if (isTaken) {
      resp.error = true;
      resp.error_message = 'This email is already in use by another account';
      return resp;
    }

    // Update the user's email and reset verification flag
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

    resp.data = {
      success: true,
      message: 'Email updated successfully',
      user: updated,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const sendPhoneUpdateOtp = async (
  user,
  { newPhone, requiresPassword = true, password },
  resp,
) => {
  try {
    const myUser = await findUserById(user.id);
    if (!myUser) {
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    if (requiresPassword) {
      const isPasswordValid = await bcrypt.compare(
        password,
        myUser.userId.password,
      );
      if (!isPasswordValid) {
        resp.error = true;
        resp.error_message = 'Invalid password';
        return resp;
      }
    }

    const context = { userId: user.id, newPhone };

    const result = await requestPhoneOtp(
      newPhone,
      myUser.name,
      context,
      'update',
    ); // Send to NEW phone

    if (!result.ok) {
      resp.error = true;
      resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
      return resp;
    }

    resp.data = {
      success: true,
      message: `OTP has been sent to ${newPhone}`,
      phoneNumber: newPhone, // Confirm OTP sent to new phone
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const verifyPhoneUpdate = async (user, { phoneNumber, otp }, resp) => {
  try {
    if (!phoneNumber || !otp || !user) {
      resp.error = true;
      resp.error_message = 'Phone number, OTP, and user ID are required';
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

    // Verify the user ID matches
    if (pending.userId.toString() !== user.id.toString()) {
      resp.error = true;
      resp.error_message = 'User ID mismatch';
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

    resp.data = {
      success: true,
      message: 'Phone number updated successfully',
      user: updated,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

export const verifyBothEmailAndPhoneUpdate = async (
  user,
  { email, emailOtp, phoneNumber, phoneOtp },
  resp,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!email || !emailOtp || !phoneNumber || !phoneOtp || !user) {
      resp.error = true;
      resp.error_message = 'All fields are required for simultaneous update';
      return resp;
    }

    // Verify both OTPs
    const [emailResult, phoneResult] = await Promise.all([
      verifyEmailOtp(email, emailOtp),
      verifyPhoneOtp(phoneNumber, phoneOtp),
    ]);

    if (!emailResult.ok || !phoneResult.ok) {
      resp.error = true;
      resp.error_message = 'One or both OTPs are invalid or expired';
      return resp;
    }

    const emailPending = emailResult.pending;
    const phonePending = phoneResult.pending;

    // Validate both contexts
    if (
      !emailPending ||
      !phonePending ||
      emailPending.userId.toString() !== user.id.toString() ||
      phonePending.userId.toString() !== user.id.toString()
    ) {
      resp.error = true;
      resp.error_message = 'Invalid verification context';
      return resp;
    }

    // Check for duplicates
    const [emailTaken, phoneTaken] = await Promise.all([
      findUserByEmail(emailPending.newEmail),
      findUserByPhone(phonePending.newPhone),
    ]);

    if (emailTaken || phoneTaken) {
      resp.error = true;
      resp.error_message = 'Email or phone number is already in use';
      return resp;
    }

    // Update both email and phone in a single transaction
    const updated = await updateUserById(
      user.id,
      {
        email: emailPending.newEmail,
        phoneNumber: phonePending.newPhone,
        isEmailVerified: false,
        isPhoneVerified: false,
      },
      { session },
    );

    if (!updated) {
      resp.error = true;
      resp.error_message = 'User not found';
      return resp;
    }

    // Cleanup both OTP sessions
    await Promise.all([
      redisConfig.del(
        emailOtpKey(email),
        emailCooldownKey(email),
        emailPendingKey(email),
      ),
      redisConfig.del(
        phoneOtpKey(phoneNumber),
        phoneCooldownKey(phoneNumber),
        phonePendingKey(phoneNumber),
      ),
    ]);

    await session.commitTransaction();
    session.endSession();

    resp.data = {
      success: true,
      message: 'Email and phone number updated successfully',
      user: updated,
    };
    return resp;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'Something went wrong';
    return resp;
  }
};

// export const updateUserProfile = async (user, body, file, resp) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     const update = { ...body };
//     const messages = {};
//     const tokenRedirect = {};

//     if (!user?.id) throw new Error('User ID is missing.');

//     const myUser = await findUserById(user.id);
//     if (!myUser) throw new Error('User not found.');

//     // Normalize roles (handles string or array, case-insensitive)
//     const roles = Array.isArray(user.roles)
//       ? user.roles
//       : [user.roles].filter(Boolean);
//     const rolesNorm = roles.map((r) => String(r).toLowerCase().trim());
//     const isDriver = rolesNorm.includes('driver');
//     const isPassenger = rolesNorm.includes('passenger');

//     // --- NAME ---
//     if (
//       update.name?.trim() &&
//       update.name.trim() !== myUser.userId.name?.trim()
//     ) {
//       const requestPayload = {
//         userId: myUser.userId._id,
//         request: {
//           field: 'name',
//           old: myUser.userId.name?.trim(),
//           new: update.name.trim(),
//         },
//         createdAt: new Date(),
//       };
//       const requestResult = await createProfileUpdateRequest(requestPayload, {
//         session,
//       });
//       if (!requestResult)
//         throw new Error('Failed to send name update request to admin.');

//       messages.nameMessage = 'Name update request has been sent successfully';
//       delete update.name;
//     }

//     // --- IMAGE ---
//     if (file) {
//       // Determine the new image source for comparison: prefer Buffer (memoryStorage), otherwise path
//       const newImageSource = Buffer.isBuffer(file.buffer)
//         ? file.buffer
//         : file.path;

//       if (!newImageSource) {
//         // If neither buffer nor path is available, skip image logic
//         console.warn(
//           'No file.buffer or file.path available on multer file; skipping image comparison/upload.',
//         );
//       } else {
//         // Compare existing (URL) with the new image (buffer or path)
//         const same = await isSameImage(
//           myUser.userId.profileImg,
//           newImageSource,
//         );

//         if (!same) {
//           // Try uploading directly (most uploadToS3 implementations accept buffer within file)
//           let url;
//           try {
//             url = await uploadToS3(myUser.userId._id, file);
//           } catch (uploadErr) {
//             console.warn(
//               'uploadToS3 failed with direct file. Attempting tmp-file fallback:',
//               uploadErr?.message,
//             );

//             // Fallback: write buffer to temp file and call uploadToS3 with path-like object
//             if (file?.buffer) {
//               const tmpName = `${uuidv4()}-${file.originalname || 'upload'}`;
//               const tmpPath = path.join(os.tmpdir(), tmpName);
//               try {
//                 await fs.writeFile(tmpPath, file.buffer);
//                 // many upload helpers accept object with path; adjust if your uploadToS3 signature differs
//                 url = await uploadToS3(myUser.userId._id, {
//                   path: tmpPath,
//                   mimetype: file.mimetype,
//                   originalname: file.originalname,
//                 });
//               } finally {
//                 // best-effort cleanup
//                 try {
//                   await fs.unlink(tmpPath);
//                 } catch (e) {
//                   /* ignore */
//                 }
//               }
//             } else {
//               throw uploadErr; // cannot fallback
//             }
//           }

//           if (!url) throw new Error('S3 upload returned no URL.');

//           if (isPassenger) {
//             // Passengers can directly update
//             update.profileImg = url;
//             messages.profileImgMessage = 'Profile Image updated successfully';
//           } else if (isDriver) {
//             // Drivers require admin approval
//             const requestPayload = {
//               userId: myUser.userId._id,
//               request: {
//                 field: 'profileImg',
//                 old: myUser.userId.profileImg,
//                 new: url,
//               },
//               createdAt: new Date(),
//             };
//             const requestResult = await createProfileUpdateRequest(
//               requestPayload,
//               { session },
//             );
//             if (!requestResult)
//               throw new Error('Failed to send image update request.');

//             messages.profileImgMessage =
//               'Profile Image update request has been sent successfully';
//           }
//         } else {
//           messages.profileImgMessage =
//             'Uploaded image is same as existing; no action taken.';
//           console.log('Uploaded image is same as existing; no action taken.');
//         }
//       }
//     }

//     // --- PASSWORD VERIFICATION FOR EMAIL/PHONE CHANGES ---
//     const emailChangeRequested =
//       update.email?.trim() &&
//       update.email.trim() !== myUser.userId.email?.trim();
//     const phoneChangeRequested =
//       update.phoneNumber?.trim() &&
//       update.phoneNumber.trim() !== myUser.userId.phoneNumber?.trim();

//     if (emailChangeRequested || phoneChangeRequested) {
//       // Check if password is provided for verification
//       if (!update.password) {
//         resp.error = true;
//         resp.error_message =
//           'Password is required to change email or phone number';
//         return resp;
//       }

//       // Verify password
//       const isPasswordValid = await bcrypt.compare(
//         update.password,
//         myUser.userId.password,
//       );
//       if (!isPasswordValid) {
//         resp.error = true;
//         resp.error_message = 'Invalid password';
//         return resp;
//       }

//       // Remove password from update object after verification
//       delete update.password;

//       let tokenPurpose;
//       let metadata = {};

//       // Determine token purpose and prepare metadata
//       if (emailChangeRequested && phoneChangeRequested) {
//         tokenPurpose = 'both-update';
//         metadata = {
//           newEmail: update.email.trim(),
//           newPhone: update.phoneNumber.trim(),
//           currentEmail: myUser.userId.email?.trim(),
//           currentPhone: myUser.userId.phoneNumber?.trim(),
//           passwordVerified: true, // Mark that password was verified
//         };
//       } else if (emailChangeRequested) {
//         tokenPurpose = 'email-update';
//         metadata = {
//           newEmail: update.email.trim(),
//           currentEmail: myUser.userId.email?.trim(),
//           passwordVerified: true, // Mark that password was verified
//         };
//       } else if (phoneChangeRequested) {
//         tokenPurpose = 'phone-update';
//         metadata = {
//           newPhone: update.phoneNumber.trim(),
//           currentPhone: myUser.userId.phoneNumber?.trim(),
//           passwordVerified: true, // Mark that password was verified
//         };
//       }

//       // Generate token for OTP sending
//       const otpToken = await generateOtpToken(user.id, tokenPurpose, metadata);

//       // Handle email change
//       if (emailChangeRequested) {
//         const newEmail = update.email.trim();
//         const isRegistered = await findUserByEmail(newEmail);
//         if (isRegistered) {
//           messages.emailMessage = `Email ${newEmail} is already registered`;
//           delete update.email;
//         } else {
//           tokenRedirect.email = {
//             success: true,
//             currentEmail: myUser.userId.email?.trim(),
//             newEmail,
//             name: myUser.userId.name?.trim(),
//             userId: myUser.userId._id,
//             token: otpToken,
//             purpose: tokenPurpose,
//             passwordVerified: true, // Indicate password was already verified
//           };
//           // Don't delete email yet - we'll handle it after OTP verification
//         }
//       }

//       // Handle phone change
//       if (phoneChangeRequested) {
//         const newPhone = update.phoneNumber.trim();
//         const isRegistered = await findUserByPhone(newPhone);
//         if (isRegistered) {
//           messages.phoneNumberMessage = `Phone Number ${newPhone} is already registered`;
//           delete update.phoneNumber;
//         } else {
//           tokenRedirect.phoneNumber = {
//             success: true,
//             currentPhone: myUser.userId.phoneNumber?.trim(),
//             newPhone,
//             name: myUser.userId.name?.trim(),
//             userId: myUser.userId._id,
//             token: otpToken,
//             purpose: tokenPurpose,
//             passwordVerified: true, // Indicate password was already verified
//           };
//           // Don't delete phone yet - we'll handle it after OTP verification
//         }
//       }

//       // If both email and phone are being changed, store the context
//       if (emailChangeRequested && phoneChangeRequested) {
//         tokenRedirect.bothChanging = true;
//         tokenRedirect.token = otpToken;
//         tokenRedirect.purpose = tokenPurpose;
//         tokenRedirect.passwordVerified = true;
//       }
//     } else {
//       // Handle email without password (if no change requested but email exists in update)
//       if (
//         update.email?.trim() &&
//         update.email.trim() !== myUser.userId.email?.trim()
//       ) {
//         const newEmail = update.email.trim();
//         const isRegistered = await findUserByEmail(newEmail);
//         if (isRegistered) {
//           messages.emailMessage = `Email ${newEmail} is already registered`;
//         } else {
//           messages.emailMessage = 'Password is required to change email';
//         }
//         delete update.email;
//       }

//       // Handle phone without password (if no change requested but phone exists in update)
//       if (
//         update.phoneNumber?.trim() &&
//         update.phoneNumber.trim() !== myUser.userId.phoneNumber?.trim()
//       ) {
//         const newPhone = update.phoneNumber.trim();
//         const isRegistered = await findUserByPhone(newPhone);
//         if (isRegistered) {
//           messages.phoneNumberMessage = `Phone Number ${newPhone} is already registered`;
//         } else {
//           messages.phoneNumberMessage =
//             'Password is required to change phone number';
//         }
//         delete update.phoneNumber;
//       }
//     }

//     // --- ALLOWED FIELDS (role-based) ---
//     const BASE_ALLOWED_FIELDS = ['gender'];
//     const ALLOWED_FIELDS = isPassenger
//       ? [...BASE_ALLOWED_FIELDS, 'profileImg']
//       : BASE_ALLOWED_FIELDS;

//     const safeUpdate = Object.keys(update)
//       .filter((key) => ALLOWED_FIELDS.includes(key))
//       .reduce((obj, key) => {
//         obj[key] = update[key];
//         return obj;
//       }, {});

//     // --- PERFORM UPDATE ---
//     let updated = null;
//     if (Object.keys(safeUpdate).length > 0) {
//       updated = await updateUserById(user.id, safeUpdate, { session });
//       if (!updated) throw new Error('Failed to update profile.');
//       updated = updated.toObject ? updated.toObject() : updated;
//       delete updated.password;
//     }

//     await session.commitTransaction();
//     session.endSession();

//     resp.data = {
//       messages,
//       tokenRedirect,
//       updatedProfile: updated || null,
//     };
//     return resp;
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'something went wrong';
//     return resp;
//   }
// };

// export const sendEmailUpdateOtp = async (user, { newEmail, token }, resp) => {
//   try {
//     if (!token) {
//       resp.error = true;
//       resp.error_message = 'Token is required to send OTP';
//       return resp;
//     }

//     // Verify token for email update
//     const tokenVerification = await verifyOtpToken(
//       token,
//       user.id,
//       'email-update',
//     );
//     if (!tokenVerification.valid) {
//       resp.error = true;
//       resp.error_message = `Invalid token: ${tokenVerification.reason}`;
//       return resp;
//     }

//     const myUser = await findUserById(user.id);
//     if (!myUser) {
//       resp.error = true;
//       resp.error_message = 'User not found';
//       return resp;
//     }

//     // Use the email from token metadata or parameter
//     const targetEmail = tokenVerification.data.newEmail || newEmail;

//     // Context includes who requested and target new email
//     const context = {
//       userId: user.id,
//       newEmail: targetEmail,
//       token: token, // Include token in context for verification
//     };

//     const result = await requestEmailOtp(
//       targetEmail,
//       myUser.name,
//       context,
//       'update',
//     ); // Send to NEW email

//     if (!result.ok) {
//       resp.error = true;
//       resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds}s`;
//       return resp;
//     }

//     // Remove token after successful OTP sending
//     await revokeToken(token);

//     resp.data = {
//       success: true,
//       message: `OTP has been sent to ${targetEmail}`,
//       email: targetEmail, // Confirm OTP sent to new email
//     };
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'Something went wrong';
//     return resp;
//   }
// };

// export const sendPhoneUpdateOtp = async (user, { newPhone, token }, resp) => {
//   try {
//     if (!token) {
//       resp.error = true;
//       resp.error_message = 'Token is required to send OTP';
//       return resp;
//     }

//     // Verify token for phone update
//     const tokenVerification = await verifyOtpToken(
//       token,
//       user.id,
//       'phone-update',
//     );
//     if (!tokenVerification.valid) {
//       resp.error = true;
//       resp.error_message = `Invalid token: ${tokenVerification.reason}`;
//       return resp;
//     }

//     const myUser = await findUserById(user.id);
//     if (!myUser) {
//       resp.error = true;
//       resp.error_message = 'User not found';
//       return resp;
//     }

//     // Use the phone from token metadata or parameter
//     const targetPhone = tokenVerification.data.newPhone || newPhone;

//     const context = {
//       userId: user.id,
//       newPhone: targetPhone,
//       token: token, // Include token in context for verification
//     };

//     const result = await requestPhoneOtp(
//       targetPhone,
//       myUser.name,
//       context,
//       'update',
//     ); // Send to NEW phone

//     if (!result.ok) {
//       resp.error = true;
//       resp.error_message = `Failed to send OTP. Please wait ${result.waitSeconds || 60}s`;
//       return resp;
//     }

//     // Remove token after successful OTP sending
//     await revokeToken(token);

//     resp.data = {
//       success: true,
//       message: `OTP has been sent to ${targetPhone}`,
//       phoneNumber: targetPhone, // Confirm OTP sent to new phone
//     };
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'Something went wrong';
//     return resp;
//   }
// };

// export const sendBothUpdateOtp = async (user, { token }, resp) => {
//   try {
//     if (!token) {
//       resp.error = true;
//       resp.error_message = 'Token is required to send OTP';
//       return resp;
//     }

//     // Verify token for both-update purpose
//     const tokenVerification = await verifyOtpToken(
//       token,
//       user.id,
//       'both-update',
//     );
//     if (!tokenVerification.valid) {
//       resp.error = true;
//       resp.error_message = `Invalid token: ${tokenVerification.reason}`;
//       return resp;
//     }

//     const myUser = await findUserById(user.id);
//     if (!myUser) {
//       resp.error = true;
//       resp.error_message = 'User not found';
//       return resp;
//     }

//     // Extract email and phone from token metadata
//     const { newEmail, newPhone } = tokenVerification.data;

//     if (!newEmail || !newPhone) {
//       resp.error = true;
//       resp.error_message = 'Token metadata missing email or phone information';
//       return resp;
//     }

//     // Send both OTPs in parallel
//     const [emailResult, phoneResult] = await Promise.all([
//       requestEmailOtp(
//         newEmail,
//         myUser.name,
//         { userId: user.id, newEmail, token },
//         'update',
//       ),
//       requestPhoneOtp(
//         newPhone,
//         myUser.name,
//         { userId: user.id, newPhone, token },
//         'update',
//       ),
//     ]);

//     if (!emailResult.ok || !phoneResult.ok) {
//       resp.error = true;
//       resp.error_message = `Failed to send one or both OTPs. Please try again`;
//       return resp;
//     }

//     // Remove token after successful OTP sending
//     await revokeToken(token);

//     resp.data = {
//       success: true,
//       message: `OTPs have been sent to ${newEmail} and ${newPhone}`,
//       email: newEmail,
//       phoneNumber: newPhone,
//     };
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'Something went wrong';
//     return resp;
//   }
// };

// export const verifyEmailUpdate = async (user, { newEmail, otp }, resp) => {
//   try {
//     if (!newEmail || !otp || !user) {
//       resp.error = true;
//       resp.error_message = 'Email, OTP, and user ID are required';
//       return resp;
//     }

//     const result = await verifyEmailOtp(newEmail, otp);

//     if (!result.ok) {
//       resp.error = true;
//       resp.error_message =
//         result.reason === 'expired_or_not_requested'
//           ? 'OTP expired or not requested'
//           : 'Invalid OTP';
//       return resp;
//     }

//     const pending = result.pending;
//     if (!pending || !pending.userId || !pending.newEmail) {
//       resp.error = true;
//       resp.error_message = 'Invalid or missing verification context';
//       return resp;
//     }

//     // Verify the user ID matches
//     if (pending.userId.toString() !== user.id.toString()) {
//       resp.error = true;
//       resp.error_message = 'User ID mismatch';
//       return resp;
//     }

//     // Prevent email collision (someone else might've taken it in the meantime)
//     const isTaken = await findUserByEmail(pending.newEmail);
//     if (isTaken) {
//       resp.error = true;
//       resp.error_message = 'This email is already in use by another account';
//       return resp;
//     }

//     // Update the user's email and reset verification flag
//     const updated = await updateUserById(pending.userId, {
//       email: pending.newEmail,
//       isEmailVerified: false,
//     });

//     if (!updated) {
//       resp.error = true;
//       resp.error_message = 'User not found';
//       return resp;
//     }

//     // Final cleanup
//     await redisConfig.del(
//       emailOtpKey(newEmail),
//       emailCooldownKey(newEmail),
//       emailPendingKey(newEmail),
//     );

//     resp.data = {
//       success: true,
//       message: 'Email updated successfully',
//       user: updated,
//     };
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'Something went wrong';
//     return resp;
//   }
// };

// export const verifyPhoneUpdate = async (user, { newPhone, otp }, resp) => {
//   try {
//     if (!newPhone || !otp || !user) {
//       resp.error = true;
//       resp.error_message = 'Phone number, OTP, and user ID are required';
//       return resp;
//     }

//     const result = await verifyPhoneOtp(newPhone, otp);

//     if (!result.ok) {
//       resp.error = true;
//       switch (result.reason) {
//         case 'expired_or_not_requested':
//           resp.error_message = 'OTP expired or not requested';
//           break;
//         case 'invalid_otp':
//           resp.error_message = 'Invalid OTP';
//           break;
//         case 'too_many_attempts':
//           resp.error_message = 'Too many failed attempts, try later';
//           break;
//         default:
//           resp.error_message = 'Verification failed';
//       }
//       return resp;
//     }

//     const pending = result.pending;
//     if (!pending || !pending.userId || !pending.newPhone) {
//       resp.error = true;
//       resp.error_message = 'Invalid verification context';
//       return resp;
//     }

//     // Verify the user ID matches
//     if (pending.userId.toString() !== user.id.toString()) {
//       resp.error = true;
//       resp.error_message = 'User ID mismatch';
//       return resp;
//     }

//     // Prevent duplicate phone
//     const isTaken = await findUserByPhone(pending.newPhone);
//     if (isTaken) {
//       resp.error = true;
//       resp.error_message = 'This phone number is already registered';
//       return resp;
//     }

//     // Update user's phone
//     const updated = await updateUserById(pending.userId, {
//       phoneNumber: pending.newPhone,
//       isPhoneVerified: false,
//     });

//     if (!updated) {
//       resp.error = true;
//       resp.error_message = 'User not found';
//       return resp;
//     }

//     // Final cleanup
//     await redisConfig.del(
//       phoneOtpKey(newPhone),
//       phoneCooldownKey(newPhone),
//       phonePendingKey(newPhone),
//     );

//     resp.data = {
//       success: true,
//       message: 'Phone number updated successfully',
//       user: updated,
//     };
//     return resp;
//   } catch (error) {
//     console.error(`API ERROR: ${error}`);
//     resp.error = true;
//     resp.error_message = error.message || 'Something went wrong';
//     return resp;
//   }
// };
