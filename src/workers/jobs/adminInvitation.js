import { sendAdminInvitationEmail } from '../../templates/emails/admin/index.js';

export const name = 'adminInvitation';
export const handler = async ({ email, password }) => {
  await sendAdminInvitationEmail(email, password);
};
