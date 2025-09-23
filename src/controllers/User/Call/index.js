import { handleResponse } from '../../../utils/handleRespone.js';
import { getAgoraToken } from '../../../services/User/Call/index.js';

export const getAgoraTokenController = (req, res) =>
  handleResponse(
    {
      handler: getAgoraToken,
      validatorFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Agora token generated successfully',
    },
    req,
    res,
  );
