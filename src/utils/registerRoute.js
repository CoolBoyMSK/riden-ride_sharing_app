import { authenticate } from '../middlewares/passengerAuth.js';
import { driverAuthenticate } from '../middlewares/driverAuth.js';
import {
  adminAuthenticate,
  permitModule,
  onlySuperAdmin,
} from '../middlewares/adminAuth.js';
import { WRONG_HTTP_METHOD } from './errorCodes.js';

export const registerRoute = ({
  router,
  route,
  passenger_auth_enable = false,
  driver_auth_enable = false,
  admin_auth_enable = false,

  get_method,
  get_permission,
  get_super_enable = false,
  get_middlewares = [],

  post_method,
  post_permission,
  post_super_enable = false,
  post_middlewares = [],

  put_method,
  put_permission,
  put_super_enable = false,
  put_middlewares = [],

  delete_method,
  delete_permission,
  delete_super_enable = false,
  delete_middlewares = [],

  patch_method,
  patch_permission,
  patch_super_enable = false,
  patch_middlewares = [],
}) => {
  if (!router || !route) return;

  const authMiddlewares = [];
  if (passenger_auth_enable) authMiddlewares.push(authenticate);
  if (driver_auth_enable) authMiddlewares.push(driverAuthenticate);
  if (admin_auth_enable) authMiddlewares.push(adminAuthenticate);

  const withAuthPermSuper = (permission, superEnable, extras) => {
    const chain = [...authMiddlewares];
    if (permission) chain.push(permitModule(permission));
    if (superEnable) chain.push(onlySuperAdmin);
    chain.push(...extras);
    return chain;
  };

  if (get_method)
    router.get(
      route,
      ...withAuthPermSuper(get_permission, get_super_enable, get_middlewares),
      get_method,
    );

  if (post_method)
    router.post(
      route,
      ...withAuthPermSuper(
        post_permission,
        post_super_enable,
        post_middlewares,
      ),
      post_method,
    );

  if (put_method)
    router.put(
      route,
      ...withAuthPermSuper(put_permission, put_super_enable, put_middlewares),
      put_method,
    );

  if (delete_method)
    router.delete(
      route,
      ...withAuthPermSuper(
        delete_permission,
        delete_super_enable,
        delete_middlewares,
      ),
      delete_method,
    );

  if (patch_method)
    router.patch(
      route,
      ...withAuthPermSuper(
        patch_permission,
        patch_super_enable,
        patch_middlewares,
      ),
      patch_method,
    );

  router.all(route, ...authMiddlewares, WRONG_HTTP_METHOD);
};
