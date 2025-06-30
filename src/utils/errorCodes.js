export const RENDER_BAD_REQUEST = (res, error) => {
  console.error(error);
  return res.status(500).json({
    code: 500,
    message: error.message || 'Internal Server Error',
  });
};

export const WRONG_HTTP_METHOD = (req, res) =>
  res.status(405).json({ code: 405, message: 'Method Not Allowed' });
