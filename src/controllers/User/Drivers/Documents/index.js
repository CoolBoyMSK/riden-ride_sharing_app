import {
  getDriverDocuments,
  uploadDriverDocument,
  updateDriverDocument,
  updateLegalAgreement,
} from '../../../../services/User/driver/documents/index.js';
import { handleResponse } from '../../../../utils/handleRespone.js';
import {
  validateDocTypeParam,
  validateUpdateLegalAgreement,
} from '../../../../validations/driver.js';

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

export const updateDriverDocumentController = (req, res) =>
  handleResponse(
    {
      handler: updateDriverDocument,
      validationFn: () => validateDocTypeParam({ docType: req.query.docType }),
      handlerParams: [req.user, req.file, req.query.docType],
      successMessage: 'Document update request sent successfully',
    },
    req,
    res,
  );

export const updateLegalAgreementController = (req, res) =>
  handleResponse(
    {
      handler: updateLegalAgreement,
      validationFn: () => validateUpdateLegalAgreement(req.query),
      handlerParams: [req.user, req.query],
      successMessage: 'Legal Agreement upated successfully',
    },
    req,
    res,
  );
