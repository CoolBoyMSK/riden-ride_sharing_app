import { updateUserById } from '../../../dal/user/index.js';

export const addAddress = async ({ user, long, lat, title }, resp) => {
  try {
    const payload = {
      title,
      location: { type: 'Point', coordinates: [long, lat] },
    };
    const updatedUser = await updateUserById(
      { _id: user._id },
      {
        $push: { addresses: payload },
      },
    );

    resp.data = { user: updatedUser };
    return resp
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while adding address';
    return resp;
  }
};

export const updateAddress = async (
  { user, addressId, long, lat, title },
  resp,
) => {
  try {
    const payload = {
      $set: {
        'addresses.$.title': title,
        'addresses.$.location': { type: 'Point', coordinates: [long, lat] },
      },
    };
    const updatedUser = await updateUserById(
      { _id: user._id, 'addresses._id': addressId },
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
    resp.error_message = 'Something went wrong while updating address';
    return resp;
  }
};

export const deleteAddress = async ({ user, addressId }, resp) => {
  try {
    const payload = { $pull: { addresses: { _id: addressId } } };
    const updatedUser = await updateUserById({ _id: user._id }, payload);

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
    resp.error_message = 'Something went wrong while deleting address';
    return resp;
  }
};
