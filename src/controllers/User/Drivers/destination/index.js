import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  addDestination,
  fetchDestinations,
  fetchDestinationById,
  editDestination,
  deleteDestination,
  toggleDestination,
} from '../../../../services/User/driver/destination/index.js';

export const addDestinationController = (req, res) =>
  handleResponse(
    {
      handler: addDestination,
      handlerParams: [req.user, req.body],
      successMessage: 'Destination created successfully',
    },
    req,
    res,
  );

export const fetchDestinationsController = (req, res) =>
  handleResponse(
    {
      handler: fetchDestinations,
      handlerParams: [req.user],
      successMessage: 'Destinations fetched successfully',
    },
    req,
    res,
  );

export const fetchDestinationByIdController = (req, res) =>
  handleResponse(
    {
      handler: fetchDestinationById,
      handlerParams: [req.user, req.params],
      successMessage: 'Destination fetched successfully',
    },
    req,
    res,
  );

export const editDestinationController = (req, res) =>
  handleResponse(
    {
      handler: editDestination,
      handlerParams: [req.user, req.params, req.body],
      successMessage: 'Destination fetched successfully',
    },
    req,
    res,
  );

export const deleteDestinationController = (req, res) =>
  handleResponse(
    {
      handler: deleteDestination,
      handlerParams: [req.user, req.params],
      successMessage: 'Destination deleted successfully',
    },
    req,
    res,
  );

export const toggleDestinationController = (req, res) =>
  handleResponse(
    {
      handler: toggleDestination,
      handlerParams: [req.user],
      successMessage: 'Destination toggled successfully',
    },
    req,
    res,
  );
