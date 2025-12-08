import { handleResponse } from '../../utils/handleRespone.js';
import { getDriverEarningsByEmail } from '../../services/Test/driverEarnings.js';

export const getDriverEarningsByEmailController = (req, res) =>
  handleResponse(
    {
      handler: getDriverEarningsByEmail,
      handlerParams: [req.query],
      successMessage: 'Driver earnings fetched successfully',
    },
    req,
    res,
  );

