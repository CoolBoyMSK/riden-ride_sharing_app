import { generateAgoraToken } from '../../../utils/agoraTokenGenerator.js';

export const getAgoraToken = (user, { channelName, uid }, resp) => {
  try {
    if (!channelName || !uid) {
      resp.error = true;
      resp.error_message = 'channelName and uid are required';
      return resp;
    }

    const token = generateAgoraToken(channelName, uid);
    if (!token) {
      resp.error = true;
      resp.error_message = 'Failed to generate token';
      return resp;
    }

    resp.data = token;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
