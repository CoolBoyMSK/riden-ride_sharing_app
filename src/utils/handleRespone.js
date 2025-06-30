import { createResponseObject } from './responseFactory.js';
import { RENDER_BAD_REQUEST } from './errorCodes.js';

export const handleResponse = async (options, req, res) => {
  try {
    const {
      handler,
      validationFn,
      handlerParams = [],
      successMessage,
    } = options;

    if (validationFn) {
      try {
        await validationFn(req.body);
      } catch (e) {
        return res.status(400).json({
          code: 400,
          message: e.details[0].message.replace(/\"/g, ''),
        });
      }
    }

    const RESP = createResponseObject();
    const resp = await handler(...handlerParams, RESP);

    if (resp.error) {
      return res.status(400).json({ code: 400, message: resp.error_message });
    }
    if (!resp.auth) {
      return res.status(403).json({ code: 403, message: resp.error_message });
    }

    return res.status(200).json({
      code: 200,
      message: successMessage,
      data: resp.data,
      token: resp.token,
      header: resp.header,
    });
  } catch (e) {
    return RENDER_BAD_REQUEST(res, e);
  }
};
