import {
  getDriverDocuments,
  uploadDriverDocument,
} from '../../../../services/User/driver/documents/index.js';
import { handleResponse } from '../../../../utils/handleRespone.js';
import { validateDocTypeParam } from '../../../../validations/driver.js';

export const fetchMyDriverDocuments = (req, res) =>
  handleResponse(
    {
      handler: getDriverDocuments,
      handlerParams: [req.user.id],
      successMessage: 'Your documents fetched successfully',
    },
    req,
    res,
  );

export const uploadDocumentController = (req, res) =>
  handleResponse(
    {
      handler: uploadDriverDocument,
      validationFn: () => validateDocTypeParam(req.params),
      handlerParams: [req.user, req.file, req.params.docType],
      successMessage: 'Document uploaded',
    },
    req,
    res,
  );
