import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import { authenticateUser } from '../../../middlewares/genericAuth.js';
import { uploadMany } from '../../../middlewares/upload.js';
import {
  getComplainTypesController,
  createComplainTicketController,
  getAllComplainTicketsController,
  getComplainTicketByIdController,
  replySupportChatController,
} from '../../../controllers/User/support/index.js';

const router = express.Router();

registerRoute({
  router,
  route: '/types',
  get_middlewares: [authenticateUser],
  get_method: getComplainTypesController,
});

registerRoute({
  router,
  route: '/',
  post_middlewares: [authenticateUser, uploadMany],
  post_method: createComplainTicketController,
  get_middlewares: [authenticateUser],
  get_method: getAllComplainTicketsController,
});

registerRoute({
  router,
  route: '/:id',
  get_middlewares: [authenticateUser],
  get_method: getComplainTicketByIdController,
  put_middlewares: [authenticateUser, uploadMany],
  put_method: replySupportChatController,
});

export default router;
