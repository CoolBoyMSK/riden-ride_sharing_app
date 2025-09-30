import { handleResponse } from '../../../utils/handleRespone.js';
import { sendAlert } from '../../../services/Admin/Alert/index.js';

export const sendAlertController = (req, res) =>
  handleResponse(
    {
      handler: sendAlert,
      validationFn: null,
      handlerParams: [req.user, req.body],
      successMessage: 'Alert sent successfully',
    },
    req,
    res,
  );
