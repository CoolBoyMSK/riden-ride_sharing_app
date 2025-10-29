import {
  createFareManagement,
  getAllFareManagements,
  getFareByCar,
  updateFareManagement,
  updateDailyFare,
  deleteFareManagement,
} from '../../../services/Admin/fareManagement/index.js';
import {
  createFareManagementValidation,
  updateFareManagementValidation,
  updateDailyFareValidation,
} from '../../../validations/admin/fareManagement.js';
import { handleResponse } from '../../../utils/handleRespone.js';

export function createFare(req, res) {
  return handleResponse(
    {
      handler: createFareManagement,
      // validationFn: () => createFareManagementValidation(req.body),
      handlerParams: [
        { carType: req.body.carType, dailyFares: req.body.dailyFares },
      ],
      successMessage: 'Fare management created',
    },
    req,
    res,
  );
}

export function listFares(req, res) {
  return handleResponse(
    {
      handler: getAllFareManagements,
      handlerParams: [{}],
      successMessage: 'Fare management list fetched',
    },
    req,
    res,
  );
}

export function getFare(req, res) {
  return handleResponse(
    {
      handler: getFareByCar,
      handlerParams: [{ carType: req.params.carType }],
      successMessage: 'Fare fetched',
    },
    req,
    res,
  );
}

export function replaceFare(req, res) {
  return handleResponse(
    {
      handler: updateFareManagement,
      // validationFn: () =>
      //   updateFareManagementValidation({
      //     carType: req.params.carType,
      //     dailyFares: req.body.dailyFares,
      //   }),
      handlerParams: [
        { carType: req.params.carType, dailyFares: req.body.dailyFares },
      ],
      successMessage: 'Fare management replaced',
    },
    req,
    res,
  );
}

export function modifyDailyFare(req, res) {
  return handleResponse(
    {
      handler: updateDailyFare,
      validationFn: () =>
        updateDailyFareValidation({
          carType: req.params.carType,
          day: req.params.day,
          partialDailyFare: req.body,
        }),
      handlerParams: [
        {
          carType: req.params.carType,
          day: req.params.day,
          partialDailyFare: req.body,
        },
      ],
      successMessage: 'Daily fare updated',
    },
    req,
    res,
  );
}

export function removeFare(req, res) {
  return handleResponse(
    {
      handler: deleteFareManagement,
      handlerParams: [{ carType: req.params.carType }],
      successMessage: 'Fare management deleted',
    },
    req,
    res,
  );
}
