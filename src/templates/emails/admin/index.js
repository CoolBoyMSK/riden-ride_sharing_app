import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import sendEmail from '../../../utils/email.js';
import env from '../../../config/envConfig.js';

const tplPath = path.join(
  process.cwd(),
  'src',
  'templates',
  'emails',
  'admin',
  'html',
  'passwordReset.html',
);

const tplSource = fs.readFileSync(tplPath, 'utf8');
const passwordResetTpl = Handlebars.compile(tplSource);

export const sendAdminPasswordResetEmail = async (toEmail, token) => {
  const resetLink = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  const html = passwordResetTpl({ resetLink });
  await sendEmail({
    to: toEmail,
    subject: 'Riden App — Admin Password Reset',
    html,
  });
};

('./html/passwordReset.html');
