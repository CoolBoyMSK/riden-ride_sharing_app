import emailTransporter from '../config/emailTransporter.js';
import env from '../config/envConfig.js';

const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: `"Riden App" <${env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err.message);
  }
};

export default sendEmail;
