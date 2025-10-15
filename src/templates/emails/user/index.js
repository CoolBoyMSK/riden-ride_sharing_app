import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import sendEmail from '../../../utils/email.js';

// Passenger Mails

export const sendEmailVerificationOtp = async (toEmail, code, username) => {
  const emailVerificationTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'emailVerification.html',
  );

  const emailVerificationTplSource = fs.readFileSync(
    emailVerificationTplPath,
    'utf-8',
  );
  const emailVerificationTpl = handlebars.compile(emailVerificationTplSource);

  const html = emailVerificationTpl({ code, username });
  await sendEmail({
    to: toEmail,
    subject: 'Email Verification OTP',
    html,
  });
};

export const sendEmailUpdateVerificationOtp = async (
  toEmail,
  code,
  username,
) => {
  const emailUpdateVerificationTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'emailUpdateVerification.html',
  );

  const emailUpdateVerificationTplSource = fs.readFileSync(
    emailUpdateVerificationTplPath,
    'utf-8',
  );
  const emailUpdateVerificationTpl = handlebars.compile(
    emailUpdateVerificationTplSource,
  );

  const html = emailUpdateVerificationTpl({ code, username });
  await sendEmail({
    to: toEmail,
    subject: 'Email Update Verification OTP',
    html,
  });
};

export const sendPhoneOtpEmail = async (toEmail, username, lastDigits) => {
  const phoneOtpTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'phoneOtp.html',
  );

  const phoneOtpTplSource = fs.readFileSync(phoneOtpTplPath, 'utf-8');
  const phoneOtpTpl = handlebars.compile(phoneOtpTplSource);
  const html = phoneOtpTpl({ username, lastDigits });
  await sendEmail({
    to: toEmail,
    subject: 'OTP Sent to Your Mobile – Complete RIDEN Signup',
    html,
  });
};

export const sendWelcomePassengerEmail = async (toEmail, username) => {
  const welcomePassengerTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'phoneOtp.html',
  );

  const welcomePassengerTplSource = fs.readFileSync(
    welcomePassengerTplPath,
    'utf-8',
  );
  const welcomePassengerTpl = handlebars.compile(welcomePassengerTplSource);
  const html = welcomePassengerTpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Welcome to RIDEN – Sign Up Successful!',
    html,
  });
};

export const sendPassengerResetPasswordEmail = async (
  toEmail,
  username,
  lastDigits,
) => {
  const resetPasswordTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'resetPasswordEmail.html',
  );

  const resetPasswordTplSource = fs.readFileSync(resetPasswordTplPath, 'utf-8');
  const resetPasswordTpl = handlebars.compile(resetPasswordTplSource);
  const html = resetPasswordTpl({ username, lastDigits });
  await sendEmail({
    to: toEmail,
    subject: 'Reset Your RIDEN Password – OTP Sent',
    html,
  });
};

export const sendPassengerProfileEditRequestEmail = async (
  toEmail,
  username,
) => {
  const profileEditRequestTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'profileEditRequestEmail.html',
  );

  const profileEditRequestTplSource = fs.readFileSync(
    profileEditRequestTplPath,
    'utf-8',
  );
  const profileEditRequestTpl = handlebars.compile(profileEditRequestTplSource);
  const html = profileEditRequestTpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Profile Edit Request Received',
    html,
  });
};

export const sendPassengerApprovedProfileEditRequestEmail = async (
  toEmail,
  username,
) => {
  const approvedProfileEditRequestTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'approvedProfileEditRequestEmail.html',
  );

  const approvedProfileEditRequestTplSource = fs.readFileSync(
    approvedProfileEditRequestTplPath,
    'utf-8',
  );
  const approvedProfileEditRequestTpl = handlebars.compile(
    approvedProfileEditRequestTplSource,
  );
  const html = approvedProfileEditRequestTpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Your Profile Edit Request Has Been Approved',
    html,
  });
};

export const sendPassengerSuspendedEmail = async (toEmail, username) => {
  const passengerSuspendedTplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'passengerSuspendedEmail.html',
  );

  const passengerSuspendedTplSource = fs.readFileSync(
    passengerSuspendedTplPath,
    'utf-8',
  );
  const passengerSuspendedTpl = handlebars.compile(passengerSuspendedTplSource);
  const html = passengerSuspendedTpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Your RIDEN Account Has Been Suspended',
    html,
  });
};

export const sendPassengerRideCancellationWarningEmail = async (
  toEmail,
  username,
) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'rideCancellationWarningEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Ride Cancellation Warning',
    html,
  });
};

// Driver Mails

export const sendDriverEmailVerificationEmail = async (toEmail, code) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'driverEmailVerificationEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ code });
  await sendEmail({
    to: toEmail,
    subject: 'Verify Your Riden Driver Account',
    html,
  });
};

export const sendWelcomeDriverEmail = async (toEmail, username) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'welcomeDriver.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Welcome to Riden Driver!',
    html,
  });
};

export const sendDriverDocumentsApprovalEmail = async (toEmail, username) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'driverDocumentsApprovalEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Your Documents Have Been Approved!',
    html,
  });
};

export const sendDriverDocumentsRejectedEmail = async (toEmail, username) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'driverDocumentsRejectedEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Action Needed: Document Rejected',
    html,
  });
};

export const sendDocumentEditRequestApprovalEmail = async (
  toEmail,
  username,
) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'documentEditRequestApprovalEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Document Edit Request Approved',
    html,
  });
};

export const sendDriverPasswordResetOtpEmail = async (
  toEmail,
  username,
  code,
) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'driverPasswordResetOtpEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username, code });
  await sendEmail({
    to: toEmail,
    subject: 'Document Edit Request Approved',
    html,
  });
};

export const sendDriverPaymentProcessedEmail = async (
  toEmail,
  username,
  amount,
  date,
  transactionId,
) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'driverPaymentProcessedEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username, amount, date, transactionId });
  await sendEmail({
    to: toEmail,
    subject: 'Your Payment Has Been Processed',
    html,
  });
};

export const sendDriverAccountSuspendedEmail = async (
  toEmail,
  username,
  reason,
) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'driverAccountSuspendedEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username, reason });
  await sendEmail({
    to: toEmail,
    subject: 'Important: Your Riden Driver Account Has Been Suspended',
    html,
  });
};

export const sendDriverRideCancellationEmail = async (toEmail, username) => {
  const TplPath = path.join(
    process.cwd(),
    'src',
    'templates',
    'emails',
    'user',
    'html',
    'driverRideCancellationEmail.html',
  );

  const TplSource = fs.readFileSync(TplPath, 'utf-8');
  const Tpl = handlebars.compile(TplSource);
  const html = Tpl({ username });
  await sendEmail({
    to: toEmail,
    subject: 'Warning: Multiple Ride Cancellations Detected',
    html,
  });
};
