











//////////////////////-------------


import express from "express";
import db from "../config/db.js";
import { authenticate } from "../middleware/auth.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, revokeRefreshToken } from "../config/jwt.js";
import bcrypt from "bcrypt";

const router = express.Router();

// POST /login - Authenticate user and generate tokens
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Email and password are required",
    });
  }

  try {
    const { rows } = await db.query(
      "SELECT id, name, email, role, password FROM users WHERE email = $1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Invalid email or password",
      });
    }

    const user = rows[0];
    const isPasswordValid = password === user.password;

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized: Invalid email or password",
      });
    }

    const userForToken = { id: user.id, role: user.role };
    const accessToken = generateAccessToken(userForToken);
    const refreshToken = await generateRefreshToken(userForToken);

    res.json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// POST /refresh - Refresh access token
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: "Refresh token required",
    });
  }

  try {
    const decoded = await verifyRefreshToken(refreshToken);
    const user = { id: decoded.id, role: decoded.role };
    const newAccessToken = generateAccessToken(user);

    res.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken,
    });
  } catch (error) {
    console.error("❌ Refresh token error:", error);
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
});

// POST /logout - Revoke refresh token
router.post("/logout", authenticate, async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: "Refresh token required",
    });
  }

  try {
    await revokeRefreshToken(refreshToken);
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("❌ Logout error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to revoke token",
    });
  }
});

// GET /notification/:notificationId - Fetch detailed status report
router.get("/notification/:notificationId", authenticate, async (req, res) => {
  const { notificationId } = req.params;

  const parsedId = parseInt(notificationId);
  if (isNaN(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid notification ID. It must be a positive integer.",
    });
  }

  try {
    console.log(`Fetching report for notification ID: ${parsedId}`); // ADDED: Logging
    const notificationResult = await db.query(
      `SELECT n.id, nt.type_name, COALESCE(ct.content, t.content) AS template_content, n.sending_time, n.sent, n.groups, n.webinar_id
       FROM notification n
       JOIN notification_types nt ON n.type_id = nt.id
       LEFT JOIN custom_templates ct ON n.custom_template_id = ct.id
       LEFT JOIN templates t ON n.template_id = t.id
       WHERE n.id = $1`, // MODIFIED: Replaced n.template with COALESCE, added joins
      [parsedId]
    );

    if (notificationResult.rows.length === 0) {
      console.log(`Notification ID ${parsedId} not found`); // ADDED: Logging
      return res.status(404).json({
        success: false,
        message: `Notification with ID ${parsedId} not found`,
      });
    }

    const notification = notificationResult.rows[0];
    console.log(`Fetched notification: ${JSON.stringify(notification)}`); // ADDED: Logging

    const { rows: statusLogs } = await db.query(
      "SELECT type, recipient, message_sid, status, date_updated, error_message FROM status_logs WHERE notification_id = $1 ORDER BY date_updated DESC",
      [parsedId]
    );

    if (statusLogs.length === 0) {
      console.log(`No status logs for notification ID ${parsedId}`); // ADDED: Logging
      return res.status(404).json({
        success: false,
        message: `No status records found for notification ID ${parsedId}`,
      });
    }

    const recipients = [...new Set(statusLogs.map(log => log.recipient))];
    const studentDetails = await db.query(
      "SELECT email, name, phone FROM students WHERE email = ANY($1::text[]) OR phone = ANY($1::text[])",
      [recipients]
    );

    const studentMap = studentDetails.rows.reduce((map, student) => {
      map[student.email] = student;
      map[student.phone] = student;
      return map;
    }, {});

    const report = {
      notificationId: parsedId,
      type: notification.type_name,
      template: notification.template_content, // MODIFIED: Use template_content
      sendingTime: notification.sending_time.toISOString(),
      sent: notification.sent,
      groups: notification.groups,
      webinarId: notification.webinar_id,
      statuses: statusLogs.map(log => ({
        type: log.type,
        recipient: log.recipient,
        recipientName: studentMap[log.recipient]?.name || "Unknown",
        messageSid: log.message_sid,
        status: log.status,
        dateUpdated: log.date_updated.toISOString(),
        errorMessage: log.error_message || null,
      })),
      total: statusLogs.length,
      summary: {
        delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
        sent: statusLogs.filter(r => r.status === "sent").length,
        failed: statusLogs.filter(r => r.status === "failed").length,
        pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
      },
    };

    res.json({
      success: true,
      data: report,
      user: { id: req.user.id, role: req.user.role },
    });
  } catch (error) {
    console.error(`❌ Error fetching report for notification ${parsedId}:`, error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// GET /summary - Fetch summary of all notifications
router.get("/summary", authenticate, async (req, res) => {
  try {
    console.log("Fetching notification summary"); // ADDED: Logging
    const notificationsResult = await db.query(
      `SELECT n.id, nt.type_name, COALESCE(ct.content, t.content) AS template_content, n.sending_time, n.sent, n.groups, n.webinar_id, w.title AS webinar_title
       FROM notification n
       JOIN notification_types nt ON n.type_id = nt.id
       JOIN webinar w ON n.webinar_id = w.id
       LEFT JOIN custom_templates ct ON n.custom_template_id = ct.id
       LEFT JOIN templates t ON n.template_id = t.id
       ORDER BY n.sending_time DESC` // MODIFIED: Replaced n.template with COALESCE, added joins
    );

    const notifications = notificationsResult.rows;
    console.log(`Fetched ${notifications.length} notifications`); // ADDED: Logging

    const statusLogsResult = await db.query(
      `SELECT sl.notification_id, sl.type, sl.recipient, sl.status, sl.date_updated, sl.error_message, 
              s.name AS recipient_name, s.email AS recipient_email, s.phone AS recipient_phone
       FROM status_logs sl
       LEFT JOIN students s ON sl.recipient = s.email OR sl.recipient = s.phone
       ORDER BY sl.date_updated DESC`
    );

    const statusLogs = statusLogsResult.rows;

    const statusLogsByNotification = statusLogs.reduce((acc, log) => {
      if (!acc[log.notification_id]) {
        acc[log.notification_id] = [];
      }
      acc[log.notification_id].push({
        type: log.type,
        recipient: log.recipient,
        recipientName: log.recipient_name || "Unknown",
        recipientEmail: log.recipient_email,
        recipientPhone: log.recipient_phone,
        status: log.status,
        dateUpdated: log.date_updated.toISOString(),
        errorMessage: log.error_message || null,
      });
      return acc;
    }, {});

    const summary = notifications.map(notification => {
      const logs = statusLogsByNotification[notification.id] || [];
      return {
        notificationId: notification.id,
        type: notification.type_name,
        template: notification.template_content, // MODIFIED: Use template_content
        sendingTime: notification.sending_time.toISOString(),
        sent: notification.sent,
        groups: notification.groups,
        webinarId: notification.webinar_id,
        webinarTitle: notification.webinar_title,
        totalRecipients: logs.length,
        recipients: logs, // Include detailed recipient info
        summary: {
          delivered: logs.filter(r => r.status === "delivered" || r.status === "read").length,
          sent: logs.filter(r => r.status === "sent").length,
          failed: logs.filter(r => r.status === "failed").length,
          pending: logs.filter(r => ["queued", "sending"].includes(r.status)).length,
        },
      };
    });

    res.json({
      success: true,
      data: {
        notifications: summary,
        totalNotifications: notifications.length,
        totalMessages: statusLogs.length,
        overallSummary: {
          delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
          sent: statusLogs.filter(r => r.status === "sent").length,
          failed: statusLogs.filter(r => r.status === "failed").length,
          pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
        },
      },
      user: { id: req.user.id, role: req.user.role },
    });
  } catch (error) {
    console.error("❌ Error fetching summary report:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// GET /message/:notificationId/:recipient - Fetch the resolved message for a recipient
router.get("/message/:notificationId/:recipient", authenticate, async (req, res) => {
  const { notificationId, recipient } = req.params;

  const parsedId = parseInt(notificationId);
  if (isNaN(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid notification ID. It must be a positive integer.",
    });
  }

  try {
    console.log(`Fetching message for notification ID: ${parsedId}, recipient: ${recipient}`); // ADDED: Logging
    const notificationResult = await db.query(
      `SELECT n.id, nt.type_name, COALESCE(ct.content, t.content) AS template_content
       FROM notification n
       JOIN notification_types nt ON n.type_id = nt.id
       LEFT JOIN custom_templates ct ON n.custom_template_id = ct.id
       LEFT JOIN templates t ON n.template_id = t.id
       WHERE n.id = $1`, // MODIFIED: Replaced n.template with COALESCE, added joins
      [parsedId]
    );

    if (notificationResult.rows.length === 0) {
      console.log(`Notification ID ${parsedId} not found`); // ADDED: Logging
      return res.status(404).json({
        success: false,
        message: `Notification with ID ${parsedId} not found`,
      });
    }

    const notification = notificationResult.rows[0];
    let message = notification.template_content; // MODIFIED: Use template_content
    console.log(`Template content: ${message}`); // ADDED: Logging

    const variablesResult = await db.query(
      `SELECT variable_name, table_name, column_name, master_id
       FROM notification_template_variable
       WHERE notification_id = $1`,
      [parsedId]
    );

    const variables = variablesResult.rows;
    console.log(`Variables: ${JSON.stringify(variables)}`); // ADDED: Logging

    const studentResult = await db.query(
      `SELECT id, name, email, phone
       FROM students
       WHERE email = $1 OR phone = $1`,
      [recipient]
    );

    if (studentResult.rows.length === 0) {
      console.log(`Recipient ${recipient} not found`); // ADDED: Logging
      return res.status(404).json({
        success: false,
        message: `Recipient ${recipient} not found`,
      });
    }

    const student = studentResult.rows[0];

    for (const variable of variables) {
      const placeholder = `{${variable.variable_name}}`; // MODIFIED: Use {variable_name} format
      let replacementValue = "";

      if (variable.table_name === "students" && variable.column_name === "name") {
        replacementValue = student.name;
      } else if (variable.table_name === "webinar") {
        const webinarResult = await db.query(
          `SELECT ${variable.column_name}
           FROM webinar
           WHERE id = $1`,
          [variable.master_id]
        );

        if (webinarResult.rows.length > 0) {
          replacementValue = webinarResult.rows[0][variable.column_name];
          if (variable.column_name === "date") {
            replacementValue = new Date(replacementValue).toLocaleDateString();
          } else if (variable.column_name === "time") {
            replacementValue = replacementValue.toString();
          }
        }
      }

      message = message.replace(placeholder, replacementValue);
    }

    console.log(`Resolved message: ${message}`); // ADDED: Logging

    res.json({
      success: true,
      data: {
        notificationId: parsedId,
        type: notification.type_name,
        recipient,
        message,
      },
    });
  } catch (error) {
    console.error(`❌ Error fetching message for notification ${parsedId} and recipient ${recipient}:`, error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});


router.get("/filter-notifications", authenticate, async (req, res) => {
  const { type_id, webinar_id, status, student_id, start_date, webinar_title } = req.query;

  try {
    console.log(`Filtering notifications with query: ${JSON.stringify(req.query)}`); // ADDED: Logging
    // Build the base query for notifications
    let query = `
      SELECT n.id, nt.type_name, COALESCE(ct.content, t.content) AS template_content, n.sending_time, n.sent, n.groups, n.webinar_id, w.title
      FROM notification n
      JOIN notification_types nt ON n.type_id = nt.id
      JOIN webinar w ON n.webinar_id = w.id
      LEFT JOIN custom_templates ct ON n.custom_template_id = ct.id
      LEFT JOIN templates t ON n.template_id = t.id
    `; 
    let conditions = [];
    let params = [];

   
    if (type_id) {
      const parsedTypeId = parseInt(type_id);
      if (isNaN(parsedTypeId) || parsedTypeId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid type_id. It must be a positive integer.",
        });
      }
      conditions.push(`n.type_id = $${params.length + 1}`);
      params.push(parsedTypeId);
    }

    if (webinar_id) {
      const parsedWebinarId = parseInt(webinar_id);
      if (isNaN(parsedWebinarId) || parsedWebinarId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid webinar_id. It must be a positive integer.",
        });
      }
      conditions.push(`n.webinar_id = $${params.length + 1}`);
      params.push(parsedWebinarId);
    }

    if (start_date) {
   
      const parsedStartDate = new Date(start_date);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid start_date. It must be a valid date.",
        });
      }
      conditions.push(`w.date >= $${params.length + 1}`);
      params.push(parsedStartDate.toISOString().split('T')[0]); 
    }

    if (webinar_title) {
  
      const title = webinar_title.toString().trim();
      if (!title) {
        return res.status(400).json({
          success: false,
          error: "Invalid webinar_title. It must be a non-empty string.",
        });
      }
      conditions.push(`w.title ILIKE $${params.length + 1}`);
      params.push(`%${title}%`); 
    }

    
    let statusQuery = "";
    if (status || student_id) {
      statusQuery = `
        JOIN status_logs sl ON sl.notification_id = n.id
      `;
      if (status) {
        conditions.push(`sl.status = $${params.length + 1}`);
        params.push(status);
      }
      if (student_id) {
        conditions.push(`sl.recipient = $${params.length + 1}`);
        params.push(student_id);
      }
    }

 
    if (conditions.length > 0) {
      query += statusQuery + " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY n.sending_time DESC";

   
    const notificationsResult = await db.query(query, params);
    const notifications = notificationsResult.rows;
    console.log(`Fetched ${notifications.length} filtered notifications`); 

    if (notifications.length === 0) {
      console.log("No notifications found matching criteria"); 
      return res.status(404).json({
        success: false,
        message: "No notifications found matching the criteria",
      });
    }

    const notificationIds = notifications.map(n => n.id);
    let statusLogsResult;
    if (student_id) {
      statusLogsResult = await db.query(
        `SELECT notification_id, type, recipient, message_sid, status, date_updated, error_message
         FROM status_logs
         WHERE notification_id = ANY($1::int[]) AND recipient = $2
         ORDER BY date_updated DESC`,
        [notificationIds, student_id]
      );
    } else {
      statusLogsResult = await db.query(
        `SELECT notification_id, type, recipient, message_sid, status, date_updated, error_message
         FROM status_logs
         WHERE notification_id = ANY($1::int[])
         ORDER BY date_updated DESC`,
        [notificationIds]
      );
    }

    const statusLogs = statusLogsResult.rows;

   
    const statusLogsByNotification = statusLogs.reduce((acc, log) => {
      if (!acc[log.notification_id]) {
        acc[log.notification_id] = [];
      }
      acc[log.notification_id].push(log);
      return acc;
    }, {});

    
    const recipients = [...new Set(statusLogs.map(log => log.recipient))];
    const studentDetails = await db.query(
      "SELECT email, name, phone FROM students WHERE email = ANY($1::text[]) OR phone = ANY($1::text[])",
      [recipients]
    );

    const studentMap = studentDetails.rows.reduce((map, student) => {
      map[student.email] = student;
      map[student.phone] = student;
      return map;
    }, {});


    const result = notifications.map(notification => {
      const logs = statusLogsByNotification[notification.id] || [];
      return {
        notificationId: notification.id,
        type: notification.type_name,
        template: notification.template_content,
        sendingTime: notification.sending_time.toISOString(),
        sent: notification.sent,
        groups: notification.groups,
        webinarId: notification.webinar_id,
        webinarTitle: notification.title,
        statuses: logs.map(log => ({
          type: log.type,
          recipient: log.recipient,
          recipientName: studentMap[log.recipient]?.name || "Unknown",
          messageSid: log.message_sid,
          status: log.status,
          dateUpdated: log.date_updated.toISOString(),
          errorMessage: log.error_message || null,
        })),
        total: logs.length,
        summary: {
          delivered: logs.filter(r => r.status === "delivered" || r.status === "read").length,
          sent: logs.filter(r => r.status === "sent").length,
          failed: logs.filter(r => r.status === "failed").length,
          pending: logs.filter(r => ["queued", "sending"].includes(r.status)).length,
        },
      };
    });

    res.json({
      success: true,
      data: result,
      user: { id: req.user.id, role: req.user.role },
    });
  } catch (error) {
    console.error("❌ Error fetching filtered notifications:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
