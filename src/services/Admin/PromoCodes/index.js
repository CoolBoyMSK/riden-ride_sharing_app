import {
  createPromoCode as dalCreatePromo,
  listPromos as dalListPromos,
  findPromoByCode,
  updatePromoById,
  deletePromoById,
} from '../../../dal/promo_code.js';
import {
  generatePromoCodeString,
  validateDates,
} from '../../../utils/promoCode.js';

export const createPromoCode = async (
  { code, discount, startsAt, endsAt, isActive },
  resp,
) => {
  const finalCode = code || generatePromoCodeString();

  if (await findPromoByCode(finalCode)) {
    resp.error = true;
    resp.error_message = 'Promo code already exists';
    return resp;
  }

  validateDates(new Date(startsAt), new Date(endsAt));

  const promo = await dalCreatePromo({
    code: finalCode,
    discount,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    isActive: isActive ?? true,
  });

  resp.data = promo;
  return resp;
};

export const getAllPromoCodes = async (resp) => {
  const promos = await dalListPromos();
  resp.data = promos;
  return resp;
};

export const updatePromoCode = async (
  id,
  { discount, startsAt, endsAt, isActive },
  resp,
) => {
  if (startsAt && endsAt) {
    validateDates(new Date(startsAt), new Date(endsAt));
  }

  const updated = await updatePromoById(id, {
    ...(discount !== undefined && { discount }),
    ...(startsAt && { startsAt: new Date(startsAt) }),
    ...(endsAt && { endsAt: new Date(endsAt) }),
    ...(isActive !== undefined && { isActive }),
  });

  resp.data = updated;
  return resp;
};

export const removePromoCode = async (id, resp) => {
  await deletePromoById(id);
  resp.data = { id };
  return resp;
};
