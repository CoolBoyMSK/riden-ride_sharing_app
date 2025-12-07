import { createResponseObject } from './responseFactory.js';
import { RENDER_BAD_REQUEST } from './errorCodes.js';

export const handleResponse = async (options, req, res) => {
  try {
    const {
      handler,
      validationFn,
      handlerParams = [],
      successMessage,
      validationParams,
    } = options;

    if (validationFn) {
      try {
        const paramsToValidate = validationParams !== undefined ? validationParams : req.body;
        await validationFn(paramsToValidate);
      } catch (e) {
        // Handle Joi validation errors
        if (e.details && Array.isArray(e.details) && e.details.length > 0) {
          return res.status(400).json({
            code: 400,
            message: e.details[0].message.replace(/\"/g, ''),
          });
        }
        // Handle other types of errors
        return res.status(400).json({
          code: 400,
          message: e.message || 'Validation failed',
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

    // Check if this is a file download (Buffer data with Content-Type header already set)
    if (Buffer.isBuffer(resp.data) && res.getHeader('Content-Type')) {
      // Headers are already set by the handler (e.g., downloadReceipt)
      // Send the Buffer directly
      return res.status(200).send(resp.data);
    }

    return res.status(200).json({
      code: 200,
      message: successMessage,
      ...(() => {
        const out = { data: resp.data };
        if (resp.token) out.token = resp.token;
        if (resp.header) out.header = resp.header;
        return out;
      })(),
    });
  } catch (e) {
    return RENDER_BAD_REQUEST(res, e);
  }
};
