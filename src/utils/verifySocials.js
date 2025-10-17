import env from '../config/envConfig.js';
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export const verifyGoogleToken = async (token, expectedEmail = null) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // Additional validation for expected email
    if (
      expectedEmail &&
      payload.email.toLowerCase() !== expectedEmail.toLowerCase()
    ) {
      console.error(`Email mismatch: ${payload.email} vs ${expectedEmail}`);
      return null;
    }

    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
      sub: payload.sub,
    };
  } catch (err) {
    console.error('Invalid Google token:', err.message);
    return null;
  }
};
