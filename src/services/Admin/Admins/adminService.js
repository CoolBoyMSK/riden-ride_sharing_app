import {
  findAllAdmins,
  findAdminByEmail,
  createAdmin as dalCreateAdmin,
  findAdminById,
  updateAdminById,
  countAdmins,
  searchAdmins,
  deleteAdmin,
} from '../../../dal/admin/index.js';
import {
  createAdminAccess,
  findAdminAccesses,
  upsertAdminAccess,
} from '../../../dal/admin/adminAccess/index.js';
import { hashPassword } from '../../../utils/auth.js';
import { emailQueue } from '../../../queues/emailQueue.js';

export const getAllAdmins = async (currentAdmin, { page, limit }, resp) => {
  const admins = await findAllAdmins(page, limit);
  if (!admins) {
    resp.error = true;
    resp.error_message = 'Failed to fetch admins';
    return resp;
  }

  const ids = admins.map((a) => a._id);
  const accesses = await findAdminAccesses(ids);
  const accessMap = accesses.reduce((m, a) => {
    m[a.admin.toString()] = a.modules;
    return m;
  }, {});

  const result = admins.map((admin) => {
    if (admin.type !== 'super_admin') {
      admin.modules = accessMap[admin._id.toString()] || [];
    }
    return admin;
  });

  const totalAdmins = await countAdmins();

  resp.data = {
    data: result,
    total: totalAdmins ? parseInt(totalAdmins) : 0,
    page: page ? parseInt(page) : 0,
    limit: limit ? parseInt(limit) : 0,
    totalPages: Math.ceil(parseInt(totalAdmins) / limit),
  };
  return resp;
};

export const getSearchAdmins = async ({ search, page, limit }, resp) => {
  try {
    const admins = await searchAdmins(search, page, limit);
    if (!admins) {
      resp.error = true;
      resp.error_message = 'Failed to search admins';
      return resp;
    }

    resp.data = admins;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while searching admin';
    return resp;
  }
};

export const createAdmin = async (
  { name, email, password, profileImg, phoneNumber, modules },
  currentAdmin,
  resp,
) => {
  if (currentAdmin.type !== 'super_admin') {
    resp.auth = false;
    resp.error_message = 'Forbidden: only super_admin can add admins';
    return resp;
  }

  if (await findAdminByEmail(email)) {
    resp.error = true;
    resp.error_message = 'Email already in use';
    return resp;
  }

  const hashed = await hashPassword(password);

  try {
    const newAdmin = await dalCreateAdmin({
      name,
      email,
      password: hashed,
      profileImg,
      phoneNumber,
      type: 'admin',
    });

    await createAdminAccess({ adminId: newAdmin._id, modules });

    await emailQueue.add('adminInvitation', {
      email,
      password,
      adminName: newAdmin.name,
    });

    const adminObj = newAdmin.toObject();
    delete adminObj.password;
    adminObj.modules = modules;
    resp.data = adminObj;
    return resp;
  } catch (err) {
    if (err.code === 11000 && err.keyValue) {
      const field = Object.keys(err.keyValue)[0];
      resp.error = true;
      resp.error_message = `${field.charAt(0).toUpperCase() + field.slice(1)} already in use`;
      return resp;
    }
    throw err;
  }
};

export const updateAdmin = async (
  { id, name, email, password, profileImg, phoneNumber, modules },
  currentAdmin,
  resp,
) => {
  if (currentAdmin.type !== 'super_admin') {
    resp.auth = false;
    resp.error_message = 'Forbidden: only super_admin can update admins';
    return resp;
  }

  const admin = await findAdminById(id);
  if (!admin) {
    resp.error = true;
    resp.error_message = 'Admin not found';
    return resp;
  }

  const updateFields = {};
  if (name) updateFields.name = name;
  if (email) updateFields.email = email;
  if (profileImg) updateFields.profileImg = profileImg;
  if (phoneNumber) updateFields.phoneNumber = phoneNumber;
  if (password) updateFields.password = await hashPassword(password);

  const updatedAdmin = await updateAdminById(id, updateFields);

  if (modules) {
    await upsertAdminAccess(id, modules);
    updatedAdmin.modules = modules;
  }

  delete updatedAdmin.password;
  resp.data = updatedAdmin;
  return resp;
};

export const deleteAdminById = async ({ id }, resp) => {
  try {
    const deletedAdmin = await deleteAdmin(id);
    if (!deletedAdmin) {
      resp.error = true;
      resp.error_message = 'Admin not found or already deleted';
      return resp;
    }

    resp.data = {
      success: 'Admin deleted successfully',
    };
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while deleting admin';
    return resp;
  }
};
