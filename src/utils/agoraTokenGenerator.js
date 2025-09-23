import pkg from 'agora-access-token';
import env from '../config/envConfig.js';

const { RtcTokenBuilder, RtcRole } = pkg;

export const generateAgoraToken = (channelName, uid) => {
  const appID = env.AGORA_APP_ID;
  const appCertificate = env.AGORA_APP_CERTIFICATE;
  const role = RtcRole.PUBLISHER;
  const expireTimeInSeconds = 3600;

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appID,
    appCertificate,
    channelName,
    uid,
    role,
    privilegeExpiredTs,
  );

  return token;
};
