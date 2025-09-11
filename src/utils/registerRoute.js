import { authenticate } from '../middlewares/passengerAuth.js';
import { driverAuthenticate } from '../middlewares/driverAuth.js';
import { anyUserAuth } from '../middlewares/anyUserAuth.js';
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

  const auth = [];
  if (passenger_auth_enable && driver_auth_enable) {
    auth.push(anyUserAuth);
  } else {
    if (passenger_auth_enable) auth.push(authenticate);
    if (driver_auth_enable) auth.push(driverAuthenticate);
  }
  if (admin_auth_enable) auth.push(adminAuthenticate);

  const wrap = (permission, superEnable, extra, handler) => {
    const chain = [...auth];
    if (permission) chain.push(permitModule(permission));
    if (superEnable) chain.push(onlySuperAdmin);
    if (extra.length) chain.push(...extra);
    chain.push(handler);
    return chain;
  };

  if (get_method) {
    router.get(
      route,
      ...wrap(get_permission, get_super_enable, get_middlewares, get_method),
    );
  }
  if (post_method) {
    router.post(
      route,
      ...wrap(
        post_permission,
        post_super_enable,
        post_middlewares,
        post_method,
      ),
    );
  }
  if (put_method) {
    router.put(
      route,
      ...wrap(put_permission, put_super_enable, put_middlewares, put_method),
    );
  }
  if (delete_method) {
    router.delete(
      route,
      ...wrap(
        delete_permission,
        delete_super_enable,
        delete_middlewares,
        delete_method,
      ),
    );
  }
  if (patch_method) {
    router.patch(
      route,
      ...wrap(
        patch_permission,
        patch_super_enable,
        patch_middlewares,
        patch_method,
      ),
    );
  }
  
  router.all(route, ...auth, WRONG_HTTP_METHOD);
};
