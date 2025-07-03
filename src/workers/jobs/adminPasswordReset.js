import { sendAdminPasswordResetEmail } from '../../templates/emails/admin/index.js';

export const name = 'adminPasswordReset';
export const handler = async ({ email, token }) => {
  await sendAdminPasswordResetEmail(email, token);
};
