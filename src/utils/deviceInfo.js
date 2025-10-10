import axios from 'axios';

export const getClientIp = (req) => {
  let ip =
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    '';

  // Normalize IPv6 localhost (::1) and IPv4 localhost (127.0.0.1)
  if (ip.includes('::1') || ip.includes('127.0.0.1')) {
    ip = '8.8.8.8'; // fallback to public IP for testing
  }

  // Remove IPv6 prefix if exists (e.g., "::ffff:192.168.0.1")
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }

  return ip;
};

export const getGeoLocation = async (ip) => {
  try {
    const { data } = await axios.get(`https://ipapi.co/${ip}/json/`);
    return {
      country: data.country_name || 'Unknown',
      city: data.city || 'Unknown',
      region: data.region || 'Unknown',
      timezone: data.timezone || 'Unknown',
    };
  } catch (err) {
    console.error('Geo lookup failed:', err.message);
    return {
      country: 'Unknown',
      city: 'Unknown',
      region: 'Unknown',
      timezone: 'Unknown',
    };
  }
};

export const extractDeviceInfo = async (req) => {
  const ipAddress = getClientIp(req);
  const location = await getGeoLocation(ipAddress);

  return {
    ipAddress,
    location,
  };
};
