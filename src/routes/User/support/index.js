import express from 'express';
import { registerRoute } from '../../../utils/registerRoute.js';
import { authenticateUser } from '../../../middlewares/genericAuth.js';
import { uploadMany } from '../../../middlewares/upload.js';
import {
  createComplainTicketController,
  getAllComplainTicketsController,
  getComplainTicketByIdController,
} from '../../../controllers/User/support/index.js';

const router = express.Router();

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
});

export default router;
