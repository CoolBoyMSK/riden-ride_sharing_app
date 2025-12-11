import { handleResponse } from '../../../utils/handleRespone.js';
import {
  addZone,
  fetchAllZones,
  fetchZoneById,
  editZone,
  removeZone,
  fetchZoneTypes,
  updateParkingQueueAirport,
  fetchAllParkingQueues,
} from '../../../services/Admin/Zones/index.js';

export const addZoneController = (req, res) =>
  handleResponse(
    {
      handler: addZone,
      handlerParams: [req.body],
      successMessage: 'Zone added successfully',
    },
    req,
    res,
  );

export const fetchAllZonesController = (req, res) =>
  handleResponse(
    {
      handler: fetchAllZones,
      handlerParams: [req.query],
      successMessage: 'All zones fetched successfully',
    },
    req,
    res,
  );

export const fetchZoneByIdController = (req, res) =>
  handleResponse(
    {
      handler: fetchZoneById,
      handlerParams: [req.query],
      successMessage: 'Zone fetched successfully',
    },
    req,
    res,
  );

export const editZoneController = (req, res) =>
  handleResponse(
    {
      handler: editZone,
      handlerParams: [req.query, req.body],
      successMessage: 'Zone updated successfully',
    },
    req,
    res,
  );

export const removeZoneController = (req, res) =>
  handleResponse(
    {
      handler: removeZone,
      handlerParams: [req.query],
      successMessage: 'Zone deleted successfully',
    },
    req,
    res,
  );

export const fetchZoneTypesController = (req, res) =>
  handleResponse(
    {
      handler: fetchZoneTypes,
      successMessage: 'Zone types fetched successfully',
    },
    req,
    res,
  );

export const updateParkingQueueAirportController = (req, res) =>
  handleResponse(
    {
      handler: updateParkingQueueAirport,
      handlerParams: [req.body],
      successMessage: 'Parking queue airport link updated successfully',
    },
    req,
    res,
  );

export const fetchAllParkingQueuesController = (req, res) =>
  handleResponse(
    {
      handler: fetchAllParkingQueues,
      handlerParams: [req.query],
      successMessage: 'All parking queues fetched successfully',
    },
    req,
    res,
  );
