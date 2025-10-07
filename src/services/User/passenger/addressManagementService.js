import {
  updatePassenger,
  findPassengerByUserId,
} from '../../../dal/passenger.js';

export const getAddresses = async (user, resp) => {
  try {
    const passenger = await findPassengerByUserId(user._id);
    if (!passenger) {
      resp.error = true;
      resp.error_message = 'Passenger not found';
      return resp;
    }

    resp.data = { addresses: passenger.addresses };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const addAddress = async (user, { long, lat, title }, resp) => {
  try {
    const payload = {
      title,
      location: { type: 'Point', coordinates: [long, lat] },
    };
    const updatedUser = await updatePassenger(
      { userId: user._id },
      {
        $push: { addresses: payload },
      },
    );

    resp.data = { user: updatedUser };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const updateAddress = async (
  user,
  { addressId, long, lat, title },
  resp,
) => {
  try {
    const payload = {
      $set: {
        'addresses.$.title': title,
        'addresses.$.location': { type: 'Point', coordinates: [long, lat] },
      },
    };
    const updatedUser = await updatePassenger(
      { userId: user._id, 'addresses._id': addressId },
      payload,
    );

    if (!updatedUser) {
      resp.error = true;
      resp.error_message = 'Address not found';
      return resp;
    }

    resp.data = { user: updatedUser };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};

export const deleteAddress = async (user, { addressId }, resp) => {
  try {
    const payload = { $pull: { addresses: { _id: addressId } } };
    const updatedUser = await updatePassenger({ userId: user._id }, payload);

    const stillExists = updatedUser.addresses.some(
      (addr) => addr._id.toString() === addressId.toString(),
    );
    if (stillExists) {
      resp.error = true;
      resp.error_message = 'Address not found';
      return resp;
    }

    resp.data = {
      user: updatedUser,
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = error.message || 'something went wrong';
    return resp;
  }
};
