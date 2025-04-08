


// // src/routes/report.js
// import express from "express";
// import db from "../config/db.js";
// import { authenticate } from "../middleware/auth.js";
// import { generateAccessToken, generateRefreshToken, verifyRefreshToken, revokeRefreshToken } from "../config/jwt.js";
// import bcrypt from "bcrypt";

// const router = express.Router();

// // POST /login - Authenticate user and generate tokens
// router.post("/login", async (req, res) => {
//   const { email, password } = req.body;

//   if (!email || !password) {
//     return res.status(400).json({
//       success: false,
//       error: "Email and password are required",
//     });
//   }

//   try {
//     const { rows } = await db.query(
//       "SELECT id, name, email, role, password FROM users WHERE email = $1",
//       [email]
//     );

//     if (rows.length === 0) {
//       return res.status(401).json({
//         success: false,
//         error: "Unauthorized: Invalid email or password",
//       });
//     }

//     const user = rows[0];
//     // For testing, assuming passwords are not hashed
//     const isPasswordValid = password === user.password;
//     // In production, use bcrypt to compare hashed passwords:
//     // const isPasswordValid = await bcrypt.compare(password, user.password);

//     if (!isPasswordValid) {
//       return res.status(401).json({
//         success: false,
//         error: "Unauthorized: Invalid email or password",
//       });
//     }

//     const userForToken = { id: user.id, role: user.role };
//     const accessToken = generateAccessToken(userForToken);
//     const refreshToken = await generateRefreshToken(userForToken);

//     res.json({
//       success: true,
//       accessToken,
//       refreshToken,
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//       },
//     });
//   } catch (error) {
//     console.error("❌ Login error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // POST /refresh - Refresh access token
// router.post("/refresh", async (req, res) => {
//   const { refreshToken } = req.body;

//   if (!refreshToken) {
//     return res.status(401).json({
//       success: false,
//       error: "Refresh token required",
//     });
//   }

//   try {
//     const decoded = await verifyRefreshToken(refreshToken);
//     const user = { id: decoded.id, role: decoded.role };
//     const newAccessToken = generateAccessToken(user);

//     res.json({
//       success: true,
//       accessToken: newAccessToken,
//       refreshToken,
//     });
//   } catch (error) {
//     console.error("❌ Refresh token error:", error);
//     res.status(401).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // POST /logout - Revoke refresh token
// router.post("/logout", authenticate, async (req, res) => {
//   const { refreshToken } = req.body;

//   if (!refreshToken) {
//     return res.status(400).json({
//       success: false,
//       error: "Refresh token required",
//     });
//   }

//   try {
//     await revokeRefreshToken(refreshToken);
//     res.json({
//       success: true,
//       message: "Logged out successfully",
//     });
//   } catch (error) {
//     console.error("❌ Logout error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to revoke token",
//     });
//   }
// });

// // GET /report/:notificationId - Fetch detailed status report
// router.get("/report/:notificationId", authenticate, async (req, res) => {
//   const { notificationId } = req.params;

//   const parsedId = parseInt(notificationId);
//   if (isNaN(parsedId) || parsedId <= 0) {
//     return res.status(400).json({
//       success: false,
//       error: "Invalid notification ID. It must be a positive integer.",
//     });
//   }

//   try {
//     const notificationResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        WHERE n.id = $1`,
//       [parsedId]
//     );

//     if (notificationResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Notification with ID ${parsedId} not found`,
//       });
//     }

//     const notification = notificationResult.rows[0];

//     const { rows: statusLogs } = await db.query(
//       "SELECT type, recipient, message_sid, status, date_updated, error_message FROM status_logs WHERE notification_id = $1 ORDER BY date_updated DESC",
//       [parsedId]
//     );

//     if (statusLogs.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `No status records found for notification ID ${parsedId}`,
//       });
//     }

//     const recipients = [...new Set(statusLogs.map(log => log.recipient))];
//     const studentDetails = await db.query(
//       "SELECT email, name, phone FROM students WHERE email = ANY($1::text[]) OR phone = ANY($1::text[])",
//       [recipients]
//     );

//     const studentMap = studentDetails.rows.reduce((map, student) => {
//       map[student.email] = student;
//       map[student.phone] = student;
//       return map;
//     }, {});

//     const report = {
//       notificationId: parsedId,
//       type: notification.type_name,
//       template: notification.template,
//       sendingTime: notification.sending_time.toISOString(),
//       sent: notification.sent,
//       groups: notification.groups,
//       statuses: statusLogs.map(log => ({
//         type: log.type,
//         recipient: log.recipient,
//         recipientName: studentMap[log.recipient]?.name || "Unknown",
//         messageSid: log.message_sid,
//         status: log.status,
//         dateUpdated: log.date_updated.toISOString(),
//         errorMessage: log.error_message || null,
//       })),
//       total: statusLogs.length,
//       summary: {
//         delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
//         sent: statusLogs.filter(r => r.status === "sent").length,
//         failed: statusLogs.filter(r => r.status === "failed").length,
//         pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
//       },
//     };

//     res.json({
//       success: true,
//       data: report,
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error(`❌ Error fetching report for notification ${parsedId}:`, error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /summary - Fetch summary of all notifications
// router.get("/summary", authenticate, async (req, res) => {
//   try {
//     const notificationsResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        ORDER BY n.sending_time DESC`
//     );

//     const notifications = notificationsResult.rows;

//     const statusLogsResult = await db.query(
//       "SELECT notification_id, type, recipient, status, date_updated, error_message FROM status_logs ORDER BY date_updated DESC"
//     );

//     const statusLogs = statusLogsResult.rows;

//     const statusLogsByNotification = statusLogs.reduce((acc, log) => {
//       if (!acc[log.notification_id]) {
//         acc[log.notification_id] = [];
//       }
//       acc[log.notification_id].push(log);
//       return acc;
//     }, {});

//     const summary = notifications.map(notification => {
//       const logs = statusLogsByNotification[notification.id] || [];
//       return {
//         notificationId: notification.id,
//         type: notification.type_name,
//         template: notification.template,
//         sendingTime: notification.sending_time.toISOString(),
//         sent: notification.sent,
//         groups: notification.groups,
//         totalRecipients: logs.length,
//         summary: {
//           delivered: logs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: logs.filter(r => r.status === "sent").length,
//           failed: logs.filter(r => r.status === "failed").length,
//           pending: logs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       };
//     });

//     res.json({
//       success: true,
//       data: {
//         notifications: summary,
//         totalNotifications: notifications.length,
//         totalMessages: statusLogs.length,
//         overallSummary: {
//           delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: statusLogs.filter(r => r.status === "sent").length,
//           failed: statusLogs.filter(r => r.status === "failed").length,
//           pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       },
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error("❌ Error fetching summary report:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /message/:notificationId/:recipient - Fetch the resolved message for a recipient
// router.get("/message/:notificationId/:recipient", authenticate, async (req, res) => {
//   const { notificationId, recipient } = req.params;

//   const parsedId = parseInt(notificationId);
//   if (isNaN(parsedId) || parsedId <= 0) {
//     return res.status(400).json({
//       success: false,
//       error: "Invalid notification ID. It must be a positive integer.",
//     });
//   }

//   try {
//     // Fetch notification details
//     const notificationResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        WHERE n.id = $1`,
//       [parsedId]
//     );

//     if (notificationResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Notification with ID ${parsedId} not found`,
//       });
//     }

//     const notification = notificationResult.rows[0];
//     let message = notification.template;

//     // Fetch template variables for this notification
//     const variablesResult = await db.query(
//       `SELECT variable_name, table_name, column_name, master_id
//        FROM notification_template_variable
//        WHERE notification_id = $1`,
//       [parsedId]
//     );

//     const variables = variablesResult.rows;

//     // Fetch recipient details
//     const studentResult = await db.query(
//       `SELECT id, name, email, phone
//        FROM students
//        WHERE email = $1 OR phone = $1`,
//       [recipient]
//     );

//     if (studentResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Recipient ${recipient} not found`,
//       });
//     }

//     const student = studentResult.rows[0];

//     // Replace placeholders in the template
//     for (const variable of variables) {
//       const placeholder = `<#${variable.variable_name}>`;
//       let replacementValue = "";

//       if (variable.table_name === "students" && variable.column_name === "name") {
//         replacementValue = student.name;
//       } else if (variable.table_name === "webinar") {
//         const webinarResult = await db.query(
//           `SELECT ${variable.column_name}
//            FROM webinar
//            WHERE id = $1`,
//           [variable.master_id]
//         );

//         if (webinarResult.rows.length > 0) {
//           replacementValue = webinarResult.rows[0][variable.column_name];
//           // Format date and time if necessary
//           if (variable.column_name === "date") {
//             replacementValue = new Date(replacementValue).toLocaleDateString();
//           } else if (variable.column_name === "time") {
//             replacementValue = replacementValue.toString(); // Ensure time is a string
//           }
//         }
//       }

//       message = message.replace(placeholder, replacementValue);
//     }

//     res.json({
//       success: true,
//       data: {
//         notificationId: parsedId,
//         type: notification.type_name,
//         recipient,
//         message,
//       },
//     });
//   } catch (error) {
//     console.error(`❌ Error fetching message for notification ${parsedId} and recipient ${recipient}:`, error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// export default router;




///////////////////old at down








// // src/routes/report.js
// import express from "express";
// import db from "../config/db.js";
// import { authenticate } from "../middleware/auth.js";
// import { generateAccessToken, generateRefreshToken, verifyRefreshToken, revokeRefreshToken } from "../config/jwt.js";
// import bcrypt from "bcrypt";

// const router = express.Router();

// // POST /login - Authenticate user and generate tokens
// router.post("/login", async (req, res) => {
//   const { email, password } = req.body;

//   if (!email || !password) {
//     return res.status(400).json({
//       success: false,
//       error: "Email and password are required",
//     });
//   }

//   try {
//     const { rows } = await db.query(
//       "SELECT id, name, email, role, password FROM users WHERE email = $1",
//       [email]
//     );

//     if (rows.length === 0) {
//       return res.status(401).json({
//         success: false,
//         error: "Unauthorized: Invalid email or password",
//       });
//     }

//     const user = rows[0];
//     const isPasswordValid = password === user.password;

//     if (!isPasswordValid) {
//       return res.status(401).json({
//         success: false,
//         error: "Unauthorized: Invalid email or password",
//       });
//     }

//     const userForToken = { id: user.id, role: user.role };
//     const accessToken = generateAccessToken(userForToken);
//     const refreshToken = await generateRefreshToken(userForToken);

//     res.json({
//       success: true,
//       accessToken,
//       refreshToken,
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//       },
//     });
//   } catch (error) {
//     console.error("❌ Login error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // POST /refresh - Refresh access token
// router.post("/refresh", async (req, res) => {
//   const { refreshToken } = req.body;

//   if (!refreshToken) {
//     return res.status(401).json({
//       success: false,
//       error: "Refresh token required",
//     });
//   }

//   try {
//     const decoded = await verifyRefreshToken(refreshToken);
//     const user = { id: decoded.id, role: decoded.role };
//     const newAccessToken = generateAccessToken(user);

//     res.json({
//       success: true,
//       accessToken: newAccessToken,
//       refreshToken,
//     });
//   } catch (error) {
//     console.error("❌ Refresh token error:", error);
//     res.status(401).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // POST /logout - Revoke refresh token
// router.post("/logout", authenticate, async (req, res) => {
//   const { refreshToken } = req.body;

//   if (!refreshToken) {
//     return res.status(400).json({
//       success: false,
//       error: "Refresh token required",
//     });
//   }

//   try {
//     await revokeRefreshToken(refreshToken);
//     res.json({
//       success: true,
//       message: "Logged out successfully",
//     });
//   } catch (error) {
//     console.error("❌ Logout error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to revoke token",
//     });
//   }
// });

// // GET /notification/:notificationId - Fetch detailed status report
// router.get("/notification/:notificationId", authenticate, async (req, res) => {
//   const { notificationId } = req.params;

//   const parsedId = parseInt(notificationId);
//   if (isNaN(parsedId) || parsedId <= 0) {
//     return res.status(400).json({
//       success: false,
//       error: "Invalid notification ID. It must be a positive integer.",
//     });
//   }

//   try {
//     const notificationResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        WHERE n.id = $1`,
//       [parsedId]
//     );

//     if (notificationResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Notification with ID ${parsedId} not found`,
//       });
//     }

//     const notification = notificationResult.rows[0];

//     const { rows: statusLogs } = await db.query(
//       "SELECT type, recipient, message_sid, status, date_updated, error_message FROM status_logs WHERE notification_id = $1 ORDER BY date_updated DESC",
//       [parsedId]
//     );

//     if (statusLogs.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `No status records found for notification ID ${parsedId}`,
//       });
//     }

//     const recipients = [...new Set(statusLogs.map(log => log.recipient))];
//     const studentDetails = await db.query(
//       "SELECT email, name, phone FROM students WHERE email = ANY($1::text[]) OR phone = ANY($1::text[])",
//       [recipients]
//     );

//     const studentMap = studentDetails.rows.reduce((map, student) => {
//       map[student.email] = student;
//       map[student.phone] = student;
//       return map;
//     }, {});

//     const report = {
//       notificationId: parsedId,
//       type: notification.type_name,
//       template: notification.template,
//       sendingTime: notification.sending_time.toISOString(),
//       sent: notification.sent,
//       groups: notification.groups,
//       webinarId: notification.webinar_id,
//       statuses: statusLogs.map(log => ({
//         type: log.type,
//         recipient: log.recipient,
//         recipientName: studentMap[log.recipient]?.name || "Unknown",
//         messageSid: log.message_sid,
//         status: log.status,
//         dateUpdated: log.date_updated.toISOString(),
//         errorMessage: log.error_message || null,
//       })),
//       total: statusLogs.length,
//       summary: {
//         delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
//         sent: statusLogs.filter(r => r.status === "sent").length,
//         failed: statusLogs.filter(r => r.status === "failed").length,
//         pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
//       },
//     };

//     res.json({
//       success: true,
//       data: report,
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error(`❌ Error fetching report for notification ${parsedId}:`, error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /summary - Fetch summary of all notifications
// router.get("/summary", authenticate, async (req, res) => {
//   try {
//     const notificationsResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        ORDER BY n.sending_time DESC`
//     );

//     const notifications = notificationsResult.rows;

//     const statusLogsResult = await db.query(
//       "SELECT notification_id, type, recipient, status, date_updated, error_message FROM status_logs ORDER BY date_updated DESC"
//     );

//     const statusLogs = statusLogsResult.rows;

//     const statusLogsByNotification = statusLogs.reduce((acc, log) => {
//       if (!acc[log.notification_id]) {
//         acc[log.notification_id] = [];
//       }
//       acc[log.notification_id].push(log);
//       return acc;
//     }, {});

//     const summary = notifications.map(notification => {
//       const logs = statusLogsByNotification[notification.id] || [];
//       return {
//         notificationId: notification.id,
//         type: notification.type_name,
//         template: notification.template,
//         sendingTime: notification.sending_time.toISOString(),
//         sent: notification.sent,
//         groups: notification.groups,
//         webinarId: notification.webinar_id,
//         totalRecipients: logs.length,
//         summary: {
//           delivered: logs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: logs.filter(r => r.status === "sent").length,
//           failed: logs.filter(r => r.status === "failed").length,
//           pending: logs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       };
//     });

//     res.json({
//       success: true,
//       data: {
//         notifications: summary,
//         totalNotifications: notifications.length,
//         totalMessages: statusLogs.length,
//         overallSummary: {
//           delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: statusLogs.filter(r => r.status === "sent").length,
//           failed: statusLogs.filter(r => r.status === "failed").length,
//           pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       },
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error("❌ Error fetching summary report:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });



// // GET /message/:notificationId/:recipient - Fetch the resolved message for a recipient
// router.get("/message/:notificationId/:recipient", authenticate, async (req, res) => {
//   const { notificationId, recipient } = req.params;

//   const parsedId = parseInt(notificationId);
//   if (isNaN(parsedId) || parsedId <= 0) {
//     return res.status(400).json({
//       success: false,
//       error: "Invalid notification ID. It must be a positive integer.",
//     });
//   }

//   try {
//     const notificationResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        WHERE n.id = $1`,
//       [parsedId]
//     );

//     if (notificationResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Notification with ID ${parsedId} not found`,
//       });
//     }

//     const notification = notificationResult.rows[0];
//     let message = notification.template;

//     const variablesResult = await db.query(
//       `SELECT variable_name, table_name, column_name, master_id
//        FROM notification_template_variable
//        WHERE notification_id = $1`,
//       [parsedId]
//     );

//     const variables = variablesResult.rows;

//     const studentResult = await db.query(
//       `SELECT id, name, email, phone
//        FROM students
//        WHERE email = $1 OR phone = $1`,
//       [recipient]
//     );

//     if (studentResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Recipient ${recipient} not found`,
//       });
//     }

//     const student = studentResult.rows[0];

//     for (const variable of variables) {
//       const placeholder = `<#${variable.variable_name}>`;
//       let replacementValue = "";

//       if (variable.table_name === "students" && variable.column_name === "name") {
//         replacementValue = student.name;
//       } else if (variable.table_name === "webinar") {
//         const webinarResult = await db.query(
//           `SELECT ${variable.column_name}
//            FROM webinar
//            WHERE id = $1`,
//           [variable.master_id]
//         );

//         if (webinarResult.rows.length > 0) {
//           replacementValue = webinarResult.rows[0][variable.column_name];
//           if (variable.column_name === "date") {
//             replacementValue = new Date(replacementValue).toLocaleDateString();
//           } else if (variable.column_name === "time") {
//             replacementValue = replacementValue.toString();
//           }
//         }
//       }

//       message = message.replace(placeholder, replacementValue);
//     }

//     res.json({
//       success: true,
//       data: {
//         notificationId: parsedId,
//         type: notification.type_name,
//         recipient,
//         message,
//       },
//     });
//   } catch (error) {
//     console.error(`❌ Error fetching message for notification ${parsedId} and recipient ${recipient}:`, error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /filter-notifications - Fetch notifications with filters (type_id, webinar_id, status, student_id, start_date, webinar_title)
// router.get("/filter-notifications", authenticate, async (req, res) => {
//   const { type_id, webinar_id, status, student_id, start_date, webinar_title } = req.query;

//   try {
//     // Build the base query for notifications
//     let query = `
//       SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id, w.title
//       FROM notification n
//       JOIN notification_types nt ON n.type_id = nt.id
//       JOIN webinar w ON n.webinar_id = w.id
//     `;
//     let conditions = [];
//     let params = [];

//     // Add filters to the query
//     if (type_id) {
//       const parsedTypeId = parseInt(type_id);
//       if (isNaN(parsedTypeId) || parsedTypeId <= 0) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid type_id. It must be a positive integer.",
//         });
//       }
//       conditions.push(`n.type_id = $${params.length + 1}`);
//       params.push(parsedTypeId);
//     }

//     if (webinar_id) {
//       const parsedWebinarId = parseInt(webinar_id);
//       if (isNaN(parsedWebinarId) || parsedWebinarId <= 0) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid webinar_id. It must be a positive integer.",
//         });
//       }
//       conditions.push(`n.webinar_id = $${params.length + 1}`);
//       params.push(parsedWebinarId);
//     }

//     if (start_date) {
//       // Validate and format the start_date
//       const parsedStartDate = new Date(start_date);
//       if (isNaN(parsedStartDate.getTime())) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid start_date. It must be a valid date.",
//         });
//       }
//       conditions.push(`w.date >= $${params.length + 1}`);
//       params.push(parsedStartDate.toISOString().split('T')[0]); // Use only the date part
//     }

//     if (webinar_title) {
//       // Validate and add webinar_title filter (case-insensitive match)
//       const title = webinar_title.toString().trim();
//       if (!title) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid webinar_title. It must be a non-empty string.",
//         });
//       }
//       conditions.push(`w.title ILIKE $${params.length + 1}`);
//       params.push(`%${title}%`); // Allow partial matches
//     }

//     // Join with status_logs if status or student_id is provided
//     let statusQuery = "";
//     if (status || student_id) {
//       statusQuery = `
//         JOIN status_logs sl ON sl.notification_id = n.id
//       `;
//       if (status) {
//         conditions.push(`sl.status = $${params.length + 1}`);
//         params.push(status);
//       }
//       if (student_id) {
//         conditions.push(`sl.recipient = $${params.length + 1}`);
//         params.push(student_id);
//       }
//     }

//     // Combine conditions into the query
//     if (conditions.length > 0) {
//       query += statusQuery + " WHERE " + conditions.join(" AND ");
//     }

//     query += " ORDER BY n.sending_time DESC";

//     // Execute the query to fetch notifications
//     const notificationsResult = await db.query(query, params);
//     const notifications = notificationsResult.rows;

//     if (notifications.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No notifications found matching the criteria",
//       });
//     }

//     // Fetch status logs for the filtered notifications, filtered by student_id if provided
//     const notificationIds = notifications.map(n => n.id);
//     let statusLogsResult;
//     if (student_id) {
//       statusLogsResult = await db.query(
//         `SELECT notification_id, type, recipient, message_sid, status, date_updated, error_message
//          FROM status_logs
//          WHERE notification_id = ANY($1::int[]) AND recipient = $2
//          ORDER BY date_updated DESC`,
//         [notificationIds, student_id]
//       );
//     } else {
//       statusLogsResult = await db.query(
//         `SELECT notification_id, type, recipient, message_sid, status, date_updated, error_message
//          FROM status_logs
//          WHERE notification_id = ANY($1::int[])
//          ORDER BY date_updated DESC`,
//         [notificationIds]
//       );
//     }

//     const statusLogs = statusLogsResult.rows;

//     // Group status logs by notification_id
//     const statusLogsByNotification = statusLogs.reduce((acc, log) => {
//       if (!acc[log.notification_id]) {
//         acc[log.notification_id] = [];
//       }
//       acc[log.notification_id].push(log);
//       return acc;
//     }, {});

//     // Fetch student details for recipients
//     const recipients = [...new Set(statusLogs.map(log => log.recipient))];
//     const studentDetails = await db.query(
//       "SELECT email, name, phone FROM students WHERE email = ANY($1::text[]) OR phone = ANY($1::text[])",
//       [recipients]
//     );

//     const studentMap = studentDetails.rows.reduce((map, student) => {
//       map[student.email] = student;
//       map[student.phone] = student;
//       return map;
//     }, {});

//     // Construct the response
//     const result = notifications.map(notification => {
//       const logs = statusLogsByNotification[notification.id] || [];
//       return {
//         notificationId: notification.id,
//         type: notification.type_name,
//         template: notification.template,
//         sendingTime: notification.sending_time.toISOString(),
//         sent: notification.sent,
//         groups: notification.groups,
//         webinarId: notification.webinar_id,
//         webinarTitle: notification.title, // Include webinar title in the response
//         statuses: logs.map(log => ({
//           type: log.type,
//           recipient: log.recipient,
//           recipientName: studentMap[log.recipient]?.name || "Unknown",
//           messageSid: log.message_sid,
//           status: log.status,
//           dateUpdated: log.date_updated.toISOString(),
//           errorMessage: log.error_message || null,
//         })),
//         total: logs.length,
//         summary: {
//           delivered: logs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: logs.filter(r => r.status === "sent").length,
//           failed: logs.filter(r => r.status === "failed").length,
//           pending: logs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       };
//     });

//     res.json({
//       success: true,
//       data: result,
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error("❌ Error fetching filtered notifications:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// export default router;



///////////////////-----------




// src/routes/report.js
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
    const notificationResult = await db.query(
      `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id
       FROM notification n
       JOIN notification_types nt ON n.type_id = nt.id
       WHERE n.id = $1`,
      [parsedId]
    );

    if (notificationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Notification with ID ${parsedId} not found`,
      });
    }

    const notification = notificationResult.rows[0];

    const { rows: statusLogs } = await db.query(
      "SELECT type, recipient, message_sid, status, date_updated, error_message FROM status_logs WHERE notification_id = $1 ORDER BY date_updated DESC",
      [parsedId]
    );

    if (statusLogs.length === 0) {
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
      template: notification.template,
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
    const notificationsResult = await db.query(
      `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id, w.title AS webinar_title
       FROM notification n
       JOIN notification_types nt ON n.type_id = nt.id
       JOIN webinar w ON n.webinar_id = w.id
       ORDER BY n.sending_time DESC`
    );

    const notifications = notificationsResult.rows;

    const statusLogsResult = await db.query(
      "SELECT notification_id, type, recipient, status, date_updated, error_message FROM status_logs ORDER BY date_updated DESC"
    );

    const statusLogs = statusLogsResult.rows;

    const statusLogsByNotification = statusLogs.reduce((acc, log) => {
      if (!acc[log.notification_id]) {
        acc[log.notification_id] = [];
      }
      acc[log.notification_id].push(log);
      return acc;
    }, {});

    const summary = notifications.map(notification => {
      const logs = statusLogsByNotification[notification.id] || [];
      return {
        notificationId: notification.id,
        type: notification.type_name,
        template: notification.template,
        sendingTime: notification.sending_time.toISOString(),
        sent: notification.sent,
        groups: notification.groups,
        webinarId: notification.webinar_id,
        webinarTitle: notification.webinar_title, // Add webinar title
        totalRecipients: logs.length,
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
    const notificationResult = await db.query(
      `SELECT n.id, nt.type_name, n.template
       FROM notification n
       JOIN notification_types nt ON n.type_id = nt.id
       WHERE n.id = $1`,
      [parsedId]
    );

    if (notificationResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Notification with ID ${parsedId} not found`,
      });
    }

    const notification = notificationResult.rows[0];
    let message = notification.template;

    const variablesResult = await db.query(
      `SELECT variable_name, table_name, column_name, master_id
       FROM notification_template_variable
       WHERE notification_id = $1`,
      [parsedId]
    );

    const variables = variablesResult.rows;

    const studentResult = await db.query(
      `SELECT id, name, email, phone
       FROM students
       WHERE email = $1 OR phone = $1`,
      [recipient]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Recipient ${recipient} not found`,
      });
    }

    const student = studentResult.rows[0];

    for (const variable of variables) {
      const placeholder = `<#${variable.variable_name}>`;
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

// GET /filter-notifications - Fetch notifications with filters (type_id, webinar_id, status, student_id, start_date, webinar_title)
router.get("/filter-notifications", authenticate, async (req, res) => {
  const { type_id, webinar_id, status, student_id, start_date, webinar_title } = req.query;

  try {
    // Build the base query for notifications
    let query = `
      SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id, w.title
      FROM notification n
      JOIN notification_types nt ON n.type_id = nt.id
      JOIN webinar w ON n.webinar_id = w.id
    `;
    let conditions = [];
    let params = [];

    // Add filters to the query
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
      // Validate and format the start_date
      const parsedStartDate = new Date(start_date);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid start_date. It must be a valid date.",
        });
      }
      conditions.push(`w.date >= $${params.length + 1}`);
      params.push(parsedStartDate.toISOString().split('T')[0]); // Use only the date part
    }

    if (webinar_title) {
      // Validate and add webinar_title filter (case-insensitive match)
      const title = webinar_title.toString().trim();
      if (!title) {
        return res.status(400).json({
          success: false,
          error: "Invalid webinar_title. It must be a non-empty string.",
        });
      }
      conditions.push(`w.title ILIKE $${params.length + 1}`);
      params.push(`%${title}%`); // Allow partial matches
    }

    // Join with status_logs if status or student_id is provided
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

    // Combine conditions into the query
    if (conditions.length > 0) {
      query += statusQuery + " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY n.sending_time DESC";

    // Execute the query to fetch notifications
    const notificationsResult = await db.query(query, params);
    const notifications = notificationsResult.rows;

    if (notifications.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No notifications found matching the criteria",
      });
    }

    // Fetch status logs for the filtered notifications, filtered by student_id if provided
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

    // Group status logs by notification_id
    const statusLogsByNotification = statusLogs.reduce((acc, log) => {
      if (!acc[log.notification_id]) {
        acc[log.notification_id] = [];
      }
      acc[log.notification_id].push(log);
      return acc;
    }, {});

    // Fetch student details for recipients
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

    // Construct the response
    const result = notifications.map(notification => {
      const logs = statusLogsByNotification[notification.id] || [];
      return {
        notificationId: notification.id,
        type: notification.type_name,
        template: notification.template,
        sendingTime: notification.sending_time.toISOString(),
        sent: notification.sent,
        groups: notification.groups,
        webinarId: notification.webinar_id,
        webinarTitle: notification.title, // Include webinar title in the response
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













//////////////////////-------------

// import express from "express";
// import db from "../config/db.js";
// import { authenticate } from "../middleware/auth.js";
// import { generateAccessToken, generateRefreshToken, verifyRefreshToken, revokeRefreshToken } from "../config/jwt.js";
// import bcrypt from "bcrypt";

// const router = express.Router();

// // POST /login - Authenticate user and generate tokens
// router.post("/login", async (req, res) => {
//   const { email, password } = req.body;

//   if (!email || !password) {
//     return res.status(400).json({
//       success: false,
//       error: "Email and password are required",
//     });
//   }

//   try {
//     const { rows } = await db.query(
//       "SELECT id, name, email, role, password FROM users WHERE email = $1",
//       [email]
//     );

//     if (rows.length === 0) {
//       return res.status(401).json({
//         success: false,
//         error: "Unauthorized: Invalid email or password",
//       });
//     }

//     const user = rows[0];
//     const isPasswordValid = password === user.password;

//     if (!isPasswordValid) {
//       return res.status(401).json({
//         success: false,
//         error: "Unauthorized: Invalid email or password",
//       });
//     }

//     const userForToken = { id: user.id, role: user.role };
//     const accessToken = generateAccessToken(userForToken);
//     const refreshToken = await generateRefreshToken(userForToken);

//     res.json({
//       success: true,
//       accessToken,
//       refreshToken,
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         role: user.role,
//       },
//     });
//   } catch (error) {
//     console.error("❌ Login error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // POST /refresh - Refresh access token
// router.post("/refresh", async (req, res) => {
//   const { refreshToken } = req.body;

//   if (!refreshToken) {
//     return res.status(401).json({
//       success: false,
//       error: "Refresh token required",
//     });
//   }

//   try {
//     const decoded = await verifyRefreshToken(refreshToken);
//     const user = { id: decoded.id, role: decoded.role };
//     const newAccessToken = generateAccessToken(user);

//     res.json({
//       success: true,
//       accessToken: newAccessToken,
//       refreshToken,
//     });
//   } catch (error) {
//     console.error("❌ Refresh token error:", error);
//     res.status(401).json({
//       success: false,
//       error: error.message,
//     });
//   }
// });

// // POST /logout - Revoke refresh token
// router.post("/logout", authenticate, async (req, res) => {
//   const { refreshToken } = req.body;

//   if (!refreshToken) {
//     return res.status(400).json({
//       success: false,
//       error: "Refresh token required",
//     });
//   }

//   try {
//     await revokeRefreshToken(refreshToken);
//     res.json({
//       success: true,
//       message: "Logged out successfully",
//     });
//   } catch (error) {
//     console.error("❌ Logout error:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to revoke token",
//     });
//   }
// });

// // GET /notification/:notificationId - Fetch detailed status report
// router.get("/notification/:notificationId", authenticate, async (req, res) => {
//   const { notificationId } = req.params;

//   const parsedId = parseInt(notificationId);
//   if (isNaN(parsedId) || parsedId <= 0) {
//     return res.status(400).json({
//       success: false,
//       error: "Invalid notification ID. It must be a positive integer.",
//     });
//   }

//   try {
//     const notificationResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        WHERE n.id = $1`,
//       [parsedId]
//     );

//     if (notificationResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Notification with ID ${parsedId} not found`,
//       });
//     }

//     const notification = notificationResult.rows[0];

//     const { rows: statusLogs } = await db.query(
//       "SELECT type, recipient, message_sid, status, date_updated, error_message FROM status_logs WHERE notification_id = $1 ORDER BY date_updated DESC",
//       [parsedId]
//     );

//     if (statusLogs.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `No status records found for notification ID ${parsedId}`,
//       });
//     }

//     const recipients = [...new Set(statusLogs.map(log => log.recipient))];
//     const studentDetails = await db.query(
//       "SELECT email, name, phone FROM students WHERE email = ANY($1::text[]) OR phone = ANY($1::text[])",
//       [recipients]
//     );

//     const studentMap = studentDetails.rows.reduce((map, student) => {
//       map[student.email] = student;
//       map[student.phone] = student;
//       return map;
//     }, {});

//     const report = {
//       notificationId: parsedId,
//       type: notification.type_name,
//       template: notification.template,
//       sendingTime: notification.sending_time.toISOString(),
//       sent: notification.sent,
//       groups: notification.groups,
//       webinarId: notification.webinar_id,
//       statuses: statusLogs.map(log => ({
//         type: log.type,
//         recipient: log.recipient,
//         recipientName: studentMap[log.recipient]?.name || "Unknown",
//         messageSid: log.message_sid,
//         status: log.status,
//         dateUpdated: log.date_updated.toISOString(),
//         errorMessage: log.error_message || null,
//       })),
//       total: statusLogs.length,
//       summary: {
//         delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
//         sent: statusLogs.filter(r => r.status === "sent").length,
//         failed: statusLogs.filter(r => r.status === "failed").length,
//         pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
//       },
//     };

//     res.json({
//       success: true,
//       data: report,
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error(`❌ Error fetching report for notification ${parsedId}:`, error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /summary - Fetch summary of all notifications
// router.get("/summary", authenticate, async (req, res) => {
//   try {
//     const notificationsResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id, w.title AS webinarTitle
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        LEFT JOIN webinar w ON n.webinar_id = w.id
//        ORDER BY n.sending_time DESC`
//     );

//     const notifications = notificationsResult.rows;

//     const statusLogsResult = await db.query(
//       "SELECT notification_id, type, recipient, status, date_updated, error_message FROM status_logs ORDER BY date_updated DESC"
//     );

//     const statusLogs = statusLogsResult.rows;

//     const statusLogsByNotification = statusLogs.reduce((acc, log) => {
//       if (!acc[log.notification_id]) {
//         acc[log.notification_id] = [];
//       }
//       acc[log.notification_id].push(log);
//       return acc;
//     }, {});

//     const summary = notifications.map(notification => {
//       const logs = statusLogsByNotification[notification.id] || [];
//       return {
//         notificationId: notification.id,
//         type: notification.type_name,
//         template: notification.template,
//         sendingTime: notification.sending_time.toISOString(),
//         sent: notification.sent,
//         groups: notification.groups,
//         webinarId: notification.webinar_id,
//         webinarTitle: notification.webinarTitle || "", // Include webinarTitle, default to empty string if null
//         totalRecipients: logs.length,
//         summary: {
//           delivered: logs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: logs.filter(r => r.status === "sent").length,
//           failed: logs.filter(r => r.status === "failed").length,
//           pending: logs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       };
//     });

//     res.json({
//       success: true,
//       data: {
//         notifications: summary,
//         totalNotifications: notifications.length,
//         totalMessages: statusLogs.length,
//         overallSummary: {
//           delivered: statusLogs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: statusLogs.filter(r => r.status === "sent").length,
//           failed: statusLogs.filter(r => r.status === "failed").length,
//           pending: statusLogs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       },
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error("❌ Error fetching summary report:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /message/:notificationId/:recipient - Fetch the resolved message for a recipient
// router.get("/message/:notificationId/:recipient", authenticate, async (req, res) => {
//   const { notificationId, recipient } = req.params;

//   const parsedId = parseInt(notificationId);
//   if (isNaN(parsedId) || parsedId <= 0) {
//     return res.status(400).json({
//       success: false,
//       error: "Invalid notification ID. It must be a positive integer.",
//     });
//   }

//   try {
//     const notificationResult = await db.query(
//       `SELECT n.id, nt.type_name, n.template
//        FROM notification n
//        JOIN notification_types nt ON n.type_id = nt.id
//        WHERE n.id = $1`,
//       [parsedId]
//     );

//     if (notificationResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Notification with ID ${parsedId} not found`,
//       });
//     }

//     const notification = notificationResult.rows[0];
//     let message = notification.template;

//     const variablesResult = await db.query(
//       `SELECT variable_name, table_name, column_name, master_id
//        FROM notification_template_variable
//        WHERE notification_id = $1`,
//       [parsedId]
//     );

//     const variables = variablesResult.rows;

//     const studentResult = await db.query(
//       `SELECT id, name, email, phone
//        FROM students
//        WHERE email = $1 OR phone = $1`,
//       [recipient]
//     );

//     if (studentResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: `Recipient ${recipient} not found`,
//       });
//     }

//     const student = studentResult.rows[0];

//     for (const variable of variables) {
//       const placeholder = `<#${variable.variable_name}>`;
//       let replacementValue = "";

//       if (variable.table_name === "students" && variable.column_name === "name") {
//         replacementValue = student.name;
//       } else if (variable.table_name === "webinar") {
//         const webinarResult = await db.query(
//           `SELECT ${variable.column_name}
//            FROM webinar
//            WHERE id = $1`,
//           [variable.master_id]
//         );

//         if (webinarResult.rows.length > 0) {
//           replacementValue = webinarResult.rows[0][variable.column_name];
//           if (variable.column_name === "date") {
//             replacementValue = new Date(replacementValue).toLocaleDateString();
//           } else if (variable.column_name === "time") {
//             replacementValue = replacementValue.toString();
//           }
//         }
//       }

//       message = message.replace(placeholder, replacementValue);
//     }

//     res.json({
//       success: true,
//       data: {
//         notificationId: parsedId,
//         type: notification.type_name,
//         recipient,
//         message,
//       },
//     });
//   } catch (error) {
//     console.error(`❌ Error fetching message for notification ${parsedId} and recipient ${recipient}:`, error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /filter-notifications - Fetch notifications with filters (type_id, webinar_id, status, student_id, start_date, webinar_title)
// router.get("/filter-notifications", authenticate, async (req, res) => {
//   const { type_id, webinar_id, status, student_id, start_date, webinar_title } = req.query;

//   try {
//     // Build the base query for notifications
//     let query = `
//       SELECT n.id, nt.type_name, n.template, n.sending_time, n.sent, n.groups, n.webinar_id, w.title AS webinarTitle
//       FROM notification n
//       JOIN notification_types nt ON n.type_id = nt.id
//       JOIN webinar w ON n.webinar_id = w.id
//     `;
//     let conditions = [];
//     let params = [];

//     // Add filters to the query
//     if (type_id) {
//       const parsedTypeId = parseInt(type_id);
//       if (isNaN(parsedTypeId) || parsedTypeId <= 0) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid type_id. It must be a positive integer.",
//         });
//       }
//       conditions.push(`n.type_id = $${params.length + 1}`);
//       params.push(parsedTypeId);
//     }

//     if (webinar_id) {
//       const parsedWebinarId = parseInt(webinar_id);
//       if (isNaN(parsedWebinarId) || parsedWebinarId <= 0) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid webinar_id. It must be a positive integer.",
//         });
//       }
//       conditions.push(`n.webinar_id = $${params.length + 1}`);
//       params.push(parsedWebinarId);
//     }

//     if (start_date) {
//       // Validate and format the start_date
//       const parsedStartDate = new Date(start_date);
//       if (isNaN(parsedStartDate.getTime())) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid start_date. It must be a valid date.",
//         });
//       }
//       conditions.push(`w.date >= $${params.length + 1}`);
//       params.push(parsedStartDate.toISOString().split('T')[0]); // Use only the date part
//     }

//     if (webinar_title) {
//       // Validate and add webinar_title filter (case-insensitive match)
//       const title = webinar_title.toString().trim();
//       if (!title) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid webinar_title. It must be a non-empty string.",
//         });
//       }
//       conditions.push(`w.title ILIKE $${params.length + 1}`);
//       params.push(`%${title}%`); // Allow partial matches
//     }

//     // Join with status_logs if status or student_id is provided
//     let statusQuery = "";
//     if (status || student_id) {
//       statusQuery = `
//         JOIN status_logs sl ON sl.notification_id = n.id
//       `;
//       if (status) {
//         conditions.push(`sl.status = $${params.length + 1}`);
//         params.push(status);
//       }
//       if (student_id) {
//         conditions.push(`sl.recipient = $${params.length + 1}`);
//         params.push(student_id);
//       }
//     }

//     // Combine conditions into the query
//     if (conditions.length > 0) {
//       query += statusQuery + " WHERE " + conditions.join(" AND ");
//     }

//     query += " ORDER BY n.sending_time DESC";

//     // Execute the query to fetch notifications
//     const notificationsResult = await db.query(query, params);
//     const notifications = notificationsResult.rows;

//     if (notifications.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No notifications found matching the criteria",
//       });
//     }

//     // Fetch status logs for the filtered notifications, filtered by student_id if provided
//     const notificationIds = notifications.map(n => n.id);
//     let statusLogsResult;
//     if (student_id) {
//       statusLogsResult = await db.query(
//         `SELECT notification_id, type, recipient, message_sid, status, date_updated, error_message
//          FROM status_logs
//          WHERE notification_id = ANY($1::int[]) AND recipient = $2
//          ORDER BY date_updated DESC`,
//         [notificationIds, student_id]
//       );
//     } else {
//       statusLogsResult = await db.query(
//         `SELECT notification_id, type, recipient, message_sid, status, date_updated, error_message
//          FROM status_logs
//          WHERE notification_id = ANY($1::int[])
//          ORDER BY date_updated DESC`,
//         [notificationIds]
//       );
//     }

//     const statusLogs = statusLogsResult.rows;

//     // Group status logs by notification_id
//     const statusLogsByNotification = statusLogs.reduce((acc, log) => {
//       if (!acc[log.notification_id]) {
//         acc[log.notification_id] = [];
//       }
//       acc[log.notification_id].push(log);
//       return acc;
//     }, {});

//     // Fetch student details for recipients
//     const recipients = [...new Set(statusLogs.map(log => log.recipient))];
//     const studentDetails = await db.query(
//       "SELECT email, name, phone FROM students WHERE email = ANY($1::text[]) OR phone = ANY($1::text[])",
//       [recipients]
//     );

//     const studentMap = studentDetails.rows.reduce((map, student) => {
//       map[student.email] = student;
//       map[student.phone] = student;
//       return map;
//     }, {});

//     // Construct the response
//     const result = notifications.map(notification => {
//       const logs = statusLogsByNotification[notification.id] || [];
//       return {
//         notificationId: notification.id,
//         type: notification.type_name,
//         template: notification.template,
//         sendingTime: notification.sending_time.toISOString(),
//         sent: notification.sent,
//         groups: notification.groups,
//         webinarId: notification.webinar_id,
//         webinarTitle: notification.webinarTitle, // Include webinar title in the response
//         statuses: logs.map(log => ({
//           type: log.type,
//           recipient: log.recipient,
//           recipientName: studentMap[log.recipient]?.name || "Unknown",
//           messageSid: log.message_sid,
//           status: log.status,
//           dateUpdated: log.date_updated.toISOString(),
//           errorMessage: log.error_message || null,
//         })),
//         total: logs.length,
//         summary: {
//           delivered: logs.filter(r => r.status === "delivered" || r.status === "read").length,
//           sent: logs.filter(r => r.status === "sent").length,
//           failed: logs.filter(r => r.status === "failed").length,
//           pending: logs.filter(r => ["queued", "sending"].includes(r.status)).length,
//         },
//       };
//     });

//     res.json({
//       success: true,
//       data: result,
//       user: { id: req.user.id, role: req.user.role },
//     });
//   } catch (error) {
//     console.error("❌ Error fetching filtered notifications:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// // GET /webinar-titles - Fetch list of webinar titles for autocomplete
// router.get("/webinar-titles", authenticate, async (req, res) => {
//   const { q } = req.query; // Query parameter for search term

//   try {
//     let query = `
//       SELECT DISTINCT title
//       FROM webinar
//     `;
//     let params = [];

//     if (q) {
//       const searchTerm = q.toString().trim();
//       if (searchTerm.length > 0) {
//         query += ` WHERE title ILIKE $${params.length + 1}`;
//         params.push(`%${searchTerm}%`); // Case-insensitive partial match
//       }
//     }

//     query += " ORDER BY title ASC";

//     const result = await db.query(query, params);
//     const titles = result.rows.map(row => row.title);

//     res.json({
//       success: true,
//       data: titles,
//     });
//   } catch (error) {
//     console.error("❌ Error fetching webinar titles:", error);
//     res.status(500).json({
//       success: false,
//       error: "Internal server error",
//     });
//   }
// });

// export default router;