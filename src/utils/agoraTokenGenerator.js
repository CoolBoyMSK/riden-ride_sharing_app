import pkg from 'agora-access-token';
import env from '../config/envConfig.js';

const { RtcTokenBuilder, RtcRole } = pkg;

export const generateAgoraToken = (
  channelName,
  uid = 0,
  role = 'publisher',
  expireSeconds = 60 * 60,
) => {
  const appID = env.AGORA_APP_ID;
  const appCertificate = env.AGORA_APP_CERTIFICATE;
  const roleConst =
    role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expireSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    appID,
    appCertificate,
    channelName,
    uid,
    roleConst,
    privilegeExpiredTs,
  );

  return { token, expiresAt: privilegeExpiredTs * 1000 };
};
