import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import sendEmail from '../../../utils/email.js';

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

export const sendEmailVerificationOtp = async (toEmail, code, username) => {
  const html = emailVerificationTpl({ code, username });
  await sendEmail({
    to: toEmail,
    subject: 'Email Verification OTP',
    html,
  });
};

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

export const sendEmailUpdateVerificationOtp = async (
  toEmail,
  code,
  username,
) => {
  const html = emailUpdateVerificationTpl({ code, username });
  await sendEmail({
    to: toEmail,
    subject: 'Email Update Verification OTP',
    html,
  });
};
