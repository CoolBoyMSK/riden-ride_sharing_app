import {
  findPromoById,
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

const extractDate = (dateStr) => {
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.toISOString().split('T')[0];
};

export const getAllPromoCodes = async (
  { page = 1, limit = 10, startsAt, endsAt },
  resp,
) => {
  try {
    const filter = {};

    if (startsAt && endsAt) {
      validateDates(new Date(startsAt), new Date(endsAt));
      const sDate = extractDate(startsAt);
      const eDate = extractDate(endsAt);
      if (!sDate || !eDate) {
        resp.error = true;
        resp.error_message = 'Invalid date format';
        return resp;
      }

      filter.$expr = {
        $and: [
          {
            $eq: [
              { $dateToString: { format: '%Y-%m-%d', date: '$startsAt' } },
              sDate,
            ],
          },
          {
            $eq: [
              { $dateToString: { format: '%Y-%m-%d', date: '$endsAt' } },
              eDate,
            ],
          },
        ],
      };
    } else if (startsAt) {
      const sDate = extractDate(startsAt);
      if (!sDate) {
        resp.error = true;
        resp.error_message = 'Invalid startsAt format';
        return resp;
      }

      filter.$expr = {
        $eq: [
          { $dateToString: { format: '%Y-%m-%d', date: '$startsAt' } },
          sDate,
        ],
      };
    } else if (endsAt) {
      const eDate = extractDate(endsAt);
      if (!eDate) {
        resp.error = true;
        resp.error_message = 'Invalid endsAt format';
        return resp;
      }

      filter.$expr = {
        $eq: [
          { $dateToString: { format: '%Y-%m-%d', date: '$endsAt' } },
          eDate,
        ],
      };
    }

    const promos = await dalListPromos({ page, limit }, filter);

    if (!promos) {
      resp.error = true;
      resp.error_message = 'Failed to fetch Promo codes';
      return resp;
    }

    resp.data = promos;
    return resp;
  } catch (err) {
    console.error(err);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching promo codes';
    return resp;
  }
};

export const getPromoCodesById = async (id, resp) => {
  try {
    const promoCode = await findPromoById(id);
    if (!promoCode) {
      resp.error = true;
      resp.error_message = 'PromoCode not found';
      return resp;
    }

    resp.data = promoCode;
    return resp;
  } catch (error) {
    console.error(`API ERROR: ${error}`);
    resp.error = true;
    resp.error_message = 'Something went wrong while fetching promocode by id';
    return resp;
  }
};

export const updatePromoCode = async (
  id,
  { code, discount, startsAt, endsAt, isActive },
  resp,
) => {
  if (startsAt && endsAt) {
    validateDates(new Date(startsAt), new Date(endsAt));
  }

  if (code) {
    if (await findPromoByCode(code)) {
      resp.error = true;
      resp.error_message = 'Promo code already exists';
      return resp;
    }
  }

  const updated = await updatePromoById(id, {
    ...(code !== undefined && { code }),
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
