import express from 'express';
import { createAdminNotification } from '../../dal/notification.js';

const router = express.Router();

// Test endpoint to create admin notification
router.post('/', async (req, res) => {
  try {
    const { title, message, module, metadata, actionLink } = req.body;

    // Default values for testing
    const notificationData = {
      title: title || 'Test Notification',
      message: message || 'This is a test notification for admin',
      module: module || 'notifications',
      metadata: metadata || { test: true, timestamp: new Date().toISOString() },
      type: 'ALERT',
      actionLink: actionLink || null,
    };

    const result = await createAdminNotification(notificationData);

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: 'Admin notification created successfully',
        data: result.data,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message || 'Failed to create notification',
      });
    }
  } catch (error) {
    console.error('Error creating admin notification:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

export default router;

