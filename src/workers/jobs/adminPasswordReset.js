import { sendAdminPasswordResetEmail } from '../../templates/emails/admin/index.js';

export const name = 'adminPasswordReset';
export const handler = async ({ email, token, adminName }) => {
  await sendAdminPasswordResetEmail(email, token, adminName);
};
