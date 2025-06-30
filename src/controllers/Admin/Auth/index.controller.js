import { loginService } from '../../../services/Admin/Auth/index.js';
import { handleResponse } from '../../../utils/handleRespone.js';
import { validateAdminLogin } from '../../../validations/admin/authValidations.js';

const loginAdmin = (req, res) => {
  return handleResponse(
    {
      handler: loginService,
      validationFn: validateAdminLogin,
      handlerParams: [req.body],
      successMessage: 'Admin logged in successfully',
    },
    req,
    res,
  );
};

export { loginAdmin };
