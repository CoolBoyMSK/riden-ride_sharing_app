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

const inviteTplPath = path.join(
  process.cwd(),
  'src',
  'templates',
  'emails',
  'admin',
  'html',
  'invitation.html',
);
const inviteSource = fs.readFileSync(inviteTplPath, 'utf8');
const invitationTpl = Handlebars.compile(inviteSource);

export const sendAdminInvitationEmail = async (toEmail, password) => {
  const loginLink = `${env.FRONTEND_URL}/admin/login`;
  const html = invitationTpl({ email: toEmail, password, loginLink });
  await sendEmail({
    to: toEmail,
    subject: 'You’re Invited as a Riden App Admin',
    html,
  });
};
