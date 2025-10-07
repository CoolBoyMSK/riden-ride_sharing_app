import CallLog from '../models/CallLog.js';

export const createCallLog = async (payload) => {
  return CallLog.create(payload);
};

export const findCallById = async (id) => {
  return CallLog.findById({ _id: id, endedAt: { $exists: true } });
};

export const updateCallLogById = async (id, payload) => {
  return CallLog.findByIdAndUpdate(id, payload, { new: true });
};
