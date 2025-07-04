import {
  createPromoCode,
  getAllPromoCodes,
  updatePromoCode,
  removePromoCode,
} from '../../../services/Admin/PromoCodes/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import {
  validateCreatePromoCode,
  validateUpdatePromoCode,
} from '../../../validations/promo_codes.js';

export const createPromoCodeController = (req, res) =>
  handleResponse(
    {
      handler: createPromoCode,
      validationFn: validateCreatePromoCode,
      handlerParams: [req.body],
      successMessage: 'Promo code created',
    },
    req,
    res,
  );

export const listPromoCodesController = (req, res) =>
  handleResponse(
    {
      handler: getAllPromoCodes,
      handlerParams: [],
      successMessage: 'Promo codes fetched',
    },
    req,
    res,
  );

export const updatePromoCodeController = (req, res) =>
  handleResponse(
    {
      handler: updatePromoCode,
      validationFn: validateUpdatePromoCode,
      handlerParams: [req.params.id, req.body],
      successMessage: 'Promo code updated',
    },
    req,
    res,
  );

export const deletePromoCodeController = (req, res) =>
  handleResponse(
    {
      handler: removePromoCode,
      handlerParams: [req.params.id],
      successMessage: 'Promo code deleted',
    },
    req,
    res,
  );
