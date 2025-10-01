import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import {
  getCMSPagesController,
  getCMSPageByIdController,
} from '../../../controllers/User/CMS/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/',
  get_method: getCMSPagesController,
});

registerRoute({
  router,
  route: '/:id',
  get_method: getCMSPageByIdController,
});

export default router;
