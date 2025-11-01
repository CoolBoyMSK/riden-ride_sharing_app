// import nodemailer from 'nodemailer';
// import env from './envConfig.js';

// const emailTransporter = nodemailer.createTransport({
//   service: 'gmail',
//   // port: 587,
//   // secure: true,
//   auth: {
//     user: env.EMAIL_USER,
//     pass: env.EMAIL_PASS,
//   },
// });

// export default emailTransporter;

import nodemailer from 'nodemailer';
import env from './envConfig.js';

const emailTransporter = nodemailer.createTransport({
  host: 'email-smtp.us-east-2.amazonaws.com',
  port: 587,
  secure: false,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

export default emailTransporter;
