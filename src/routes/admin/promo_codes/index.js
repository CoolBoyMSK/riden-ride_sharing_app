import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  createPromoCodeController,
  deletePromoCodeController,
  getPromoCodesByIdController,
  listPromoCodesController,
  updatePromoCodeController,
} from '../../../controllers/Admin/PromoCode/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/promocodes',
  admin_auth_enable: true,
  get_permission: 'promo_code_management',
  get_method: listPromoCodesController,
  post_permission: 'promo_code_management',
  post_method: createPromoCodeController,
});

registerRoute({
  router,
  route: '/promocodes/:id',
  admin_auth_enable: true,
  get_permission: 'promo_code_management',
  get_method: getPromoCodesByIdController,
  put_permission: 'promo_code_management',
  put_method: updatePromoCodeController,
  delete_permission: 'promo_code_management',
  delete_method: deletePromoCodeController,
});

export default router;
