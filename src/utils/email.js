import emailTransporter from '../config/emailTransporter.js';
import env from '../config/envConfig.js';

const sendEmail = async ({ to, subject, html }) => {
  const mailOptions = {
    from: `"Riden" <${env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  };

  try {
    console.log(`\n📧 ========================================`);
    console.log(`📧 SENDING EMAIL`);
    console.log(`📧 ========================================`);
    console.log(`📧 To: ${to}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 From: ${env.EMAIL_FROM}`);
    console.log(`📧 HTML Length: ${html.length} characters`);
    console.log(`📧 ========================================\n`);

    await emailTransporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent successfully to ${to}`);
    console.log(`📧 Subject: ${subject}\n`);
  } catch (err) {
    console.error(`\n❌ ========================================`);
    console.error(`❌ EMAIL SEND FAILED`);
    console.error(`❌ ========================================`);
    console.error(`❌ To: ${to}`);
    console.error(`❌ Subject: ${subject}`);
    console.error(`❌ Error: ${err.message}`);
    console.error(`❌ ========================================\n`);
    // Rethrow so workers / callers can mark job as failed instead of "successful"
    throw err;
  }
};

export default sendEmail;
