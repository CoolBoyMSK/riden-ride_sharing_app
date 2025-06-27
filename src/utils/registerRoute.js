import { authenticate } from '../middlewares/authenticate.js';
import { adminAuthenticate } from '../middlewares/adminAuthenticate.js';
import { providerAuthenticate } from '../middlewares/providerAuthenticate.js';
import { WRONG_HTTP_METHOD } from './errorCodes.js';

export const registerRoute = ({
  router,
  route,
  passenger_auth_enable = false,
  driver_auth_enable = false,
  admin_auth_enable = false,
  get_method,
  post_method,
  put_method,
  delete_method,
  patch_method,
}) => {
  if (!router || !route) return;

  const baseMiddlewares = [route];

  if (passenger_auth_enable) baseMiddlewares.push(authenticate);
  if (driver_auth_enable) baseMiddlewares.push(providerAuthenticate);
  if (admin_auth_enable) baseMiddlewares.push(adminAuthenticate);

  if (get_method) router.get(...baseMiddlewares, get_method);
  if (post_method) router.post(...baseMiddlewares, post_method);
  if (put_method) router.put(...baseMiddlewares, put_method);
  if (delete_method) router.delete(...baseMiddlewares, delete_method);
  if (patch_method) router.patch(...baseMiddlewares, patch_method);

  router.use(...baseMiddlewares, WRONG_HTTP_METHOD);
};
