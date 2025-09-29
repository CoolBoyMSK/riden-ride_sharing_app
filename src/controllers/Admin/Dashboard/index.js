import { handleResponse } from '../../../utils/handleRespone.js';
import {
  getActiveDriversCount,
  getOngoingRideInfo,
} from '../../../services/Admin/Dashboard/index.js';

export const getActiveDriversCountController = (req, res) =>
  handleResponse(
    {
      handler: getActiveDriversCount,
      validationFn: null,
      handlerParams: [req.user],
      successMessage: 'Total active drivers fetched successfully',
    },
    req,
    res,
  );

export const getOngoingRideInfoController = (req, res) =>
  handleResponse(
    {
      handler: getOngoingRideInfo,
      validationFn: null,
      handlerParams: [req.user, req.params],
      successMessage: 'Ongoing ride details fetched successfully',
    },
    req,
    res,
  );
