import * as UAParser from 'ua-parser-js';
import geoip from 'geoip-lite';

/**
 * Extract device, browser, OS, IP, and geolocation info from request headers.
 * Works in production (behind proxy) and local environments.
 *
 * @param {object} req - Express request object
 * @returns {object} device info object
 */
export const extractDeviceInfo = (req) => {
  try {
    const userAgent = req.headers['user-agent'] || 'unknown';
    const parser = new UAParser.UAParser();
    const result = parser.setUA(userAgent).getResult();

    // Get the real IP address even if behind reverse proxy (NGINX, etc.)
    const ip =
      req.headers['x-forwarded-for']?.split(',').shift()?.trim() ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      '0.0.0.0';

    // Use geoip to get approximate location
    const geo = geoip.lookup(ip);

    return {
      os: result.os?.name || 'unknown',
      browser: result.browser?.name || 'unknown',
      browserVersion: result.browser?.version || 'unknown',
      deviceType: result.device?.type || 'desktop',
      deviceModel: result.device?.model || 'unknown',
      deviceVendor: result.device?.vendor || 'unknown',
      ipAddress: ip,
      userAgent,
      location: {
        country: geo?.country || 'unknown',
        city: geo?.city || 'unknown',
        region: geo?.region || 'unknown',
        timezone: geo?.timezone || 'unknown',
      },
    };
  } catch (error) {
    console.error('Error parsing device info:', error);
    return {
      os: 'unknown',
      browser: 'unknown',
      deviceType: 'unknown',
      ipAddress: '0.0.0.0',
      userAgent: req.headers['user-agent'] || 'unknown',
      location: {
        country: 'unknown',
        city: 'unknown',
      },
    };
  }
};
