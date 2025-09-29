import { handleResponse } from '../../../utils/handleRespone.js';
import { getGenericAnalytics } from '../../../services/Admin/Analytics/index.js';

export const getGenericAnalyticsController = (req, res) =>
  handleResponse(
    {
      handler: getGenericAnalytics,
      validationFn: null,
      handlerParams: [req.user, req.query],
      successMessage: 'Generic status fetched successfully',
    },
    req,
    res,
  );
