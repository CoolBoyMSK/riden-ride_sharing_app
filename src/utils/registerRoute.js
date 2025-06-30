import { authenticate } from '../middlewares/passengerAuth.js';
import { driverAuthenticate } from '../middlewares/driverAuth.js';
import { adminAuthenticate } from '../middlewares/adminAuth.js';
import { permitModule } from '../middlewares/adminAuth.js';
import { WRONG_HTTP_METHOD } from './errorCodes.js';

export const registerRoute = ({
  router,
  route,
  passenger_auth_enable = false,
  driver_auth_enable = false,
  admin_auth_enable = false,
  get_method,
  get_permission,
  post_method,
  post_permission,
  put_method,
  put_permission,
  delete_method,
  delete_permission,
  patch_method,
  patch_permission,
}) => {
  if (!router || !route) return;

  const authMiddlewares = [];
  if (passenger_auth_enable) authMiddlewares.push(authenticate);
  if (driver_auth_enable) authMiddlewares.push(driverAuthenticate);
  if (admin_auth_enable) authMiddlewares.push(adminAuthenticate);

  const withAuthAndPerm = (permission, handler) => {
    const chain = [...authMiddlewares];
    if (permission) chain.push(permitModule(permission));
    chain.push(handler);
    return chain;
  };

  if (get_method)
    router.get(route, ...withAuthAndPerm(get_permission, get_method));
  if (post_method)
    router.post(route, ...withAuthAndPerm(post_permission, post_method));
  if (put_method)
    router.put(route, ...withAuthAndPerm(put_permission, put_method));
  if (delete_method)
    router.delete(route, ...withAuthAndPerm(delete_permission, delete_method));
  if (patch_method)
    router.patch(route, ...withAuthAndPerm(patch_permission, patch_method));

  router.all(route, ...authMiddlewares, WRONG_HTTP_METHOD);
};
