import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  setDestinationRide,
  getDestinationRide,
  updateDestinationRide,
  removeDestinationRide,
} from '../../../../services/User/driver/destinationRide/index.js';

export const setDestinationRideController = (req, res) =>
  handleResponse(
    {
      handler: setDestinationRide,
      handlerParams: [req.user, req.body],
      successMessage: 'Destination ride set successfully',
    },
    req,
    res,
  );

export const getDestinationRideController = (req, res) =>
  handleResponse(
    {
      handler: getDestinationRide,
      handlerParams: [req.user],
      successMessage: 'Destination ride fetched successfully',
    },
    req,
    res,
  );

export const updateDestinationRideController = (req, res) =>
  handleResponse(
    {
      handler: updateDestinationRide,
      handlerParams: [req.user, req.body],
      successMessage: 'Destination ride updated successfully',
    },
    req,
    res,
  );

export const removeDestinationRideController = (req, res) =>
  handleResponse(
    {
      handler: removeDestinationRide,
      handlerParams: [req.user],
      successMessage: 'Destination ride removed successfully',
    },
    req,
    res,
  );






