/**
 * LEAD VERIFICATION CRM - EXPRESS BACKEND SERVER
 * Production-Ready Implementation
 * All routes, services, and controllers integrated
 * 
 * Setup:
 * 1. npm install express mysql2 dotenv uuid multer xlsx axios cors helmet express-rate-limit joi
 * 2. Create .env file with database and Telegram credentials
 * 3. Initialize database with schema.sql
 * 4. node server.js
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mysql = require('mysql2/promise');
const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const fs = require('fs');
require('dotenv').config();

const app = express();

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lead_crm',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0,
  timezone: '+00:00'
});

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});

app.use('/api/', limiter);

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });

// ============================================================================
// SERVICES
// ============================================================================

// Token Service
class TokenService {
  static generateAccessToken() {
    return uuidv4();
  }

  static generateExpiryDate(days = 30) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    return expiryDate;
  }

  static isTokenValid(expiryDate) {
    return new Date() <= new Date(expiryDate);
  }

  static generateReviewLink(token, baseUrl = process.env.FRONTEND_URL) {
    return `${baseUrl}/review?token=${token}`;
  }
}

// Telegram Service
class TelegramService {
  static async sendAdminNotification(notificationData) {
    try {
      const [configRows] = await pool.query(
        'SELECT setting_value FROM admin_config WHERE setting_key = ?',
        ['TELEGRAM_CHAT_ID']
      );

      if (!configRows[0]?.setting_value) {
        console.warn('⚠️ Telegram Chat ID not configured');
        return null;
      }

      const chatId = configRows[0].setting_value;
      const bot_token = process.env.TELEGRAM_BOT_TOKEN;

      if (!bot_token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set');
      }

      const message = this.formatMessage(notificationData);
      const url = `https://api.telegram.org/bot${bot_token}/sendMessage`;

      const response = await axios.post(url, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      });

      // Log notification
      await this.logNotification(
        notificationData.lead_id,
        notificationData.type,
        response.data.result?.message_id,
        'SENT'
      );

      return response.data;
    } catch (error) {
      console.error('❌ Telegram notification error:', error.message);
      
      if (notificationData.lead_id) {
        await this.logNotification(
          notificationData.lead_id,
          notificationData.type,
          null,
          'FAILED',
          error.message
        );
      }
      
      throw error;
    }
  }

  static formatMessage(data) {
    const { type, lead_name, lead_email, customer_notes, requirements_summary } = data;

    let emoji = '📝';
    let title = 'New Lead Submission';

    if (type === 'INTERESTED') {
      emoji = '✅';
      title = 'Customer Interested!';
    } else if (type === 'NOT_INTERESTED') {
      emoji = '❌';
      title = 'Customer Not Interested';
    } else if (type === 'LINK_SENT') {
      emoji = '🔗';
      title = 'Review Link Sent';
    }

    let message = `<b>${emoji} ${title}</b>\n\n`;
    message += `<b>Name:</b> ${lead_name}\n`;
    message += `<b>Email:</b> <code>${lead_email}</code>\n`;
    
    if (data.lead_phone) {
      message += `<b>Phone:</b> ${data.lead_phone}\n`;
    }

    if (requirements_summary) {
      message += `<b>Requirements:</b> ${requirements_summary}\n`;
    }

    if (data.budget) {
      message += `<b>Budget:</b> ${data.budget}\n`;
    }

    if (customer_notes) {
      message += `\n<b>Customer Notes:</b>\n<i>${customer_notes}</i>\n`;
    }

    message += `\n<b>Timestamp:</b> <code>${new Date().toLocaleString()}</code>`;

    return message;
  }

  static async logNotification(lead_id, type, message_id, status, error_message = null) {
    try {
      await pool.query(
        `INSERT INTO notification_logs 
        (lead_id, notification_type, telegram_message_id, status, error_message) 
        VALUES (?, ?, ?, ?, ?)`,
        [lead_id, type, message_id, status, error_message]
      );
    } catch (err) {
      console.error('Failed to log notification:', err.message);
    }
  }
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

// POST: Upload Excel with leads
app.post('/api/leads/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    // Read Excel
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    // Validate headers
    const requiredColumns = ['name', 'email', 'phone', 'requirements_summary', 'budget_range'];
    const firstRow = jsonData[0];
    const headerKeys = Object.keys(firstRow).map(k => k.toLowerCase());
    const missingColumns = requiredColumns.filter(col => !headerKeys.includes(col));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        error: `Missing required columns: ${missingColumns.join(', ')}`
      });
    }

    // Prepare records
    const recordsToInsert = [];
    for (const row of jsonData) {
      try {
        const token = TokenService.generateAccessToken();
        const expiryDate = TokenService.generateExpiryDate(
          parseInt(process.env.TOKEN_EXPIRY_DAYS || 30)
        );

        recordsToInsert.push([
          row.name?.toString().trim() || 'N/A',
          row.email?.toString().trim().toLowerCase() || '',
          row.phone?.toString().trim() || '',
          row.requirements_summary?.toString().trim() || '',
          row.budget_range?.toString().trim() || '',
          token,
          'PENDING',
          expiryDate,
        ]);
      } catch (rowError) {
        errorCount++;
        errors.push(`Row error: ${rowError.message}`);
      }
    }

    // Bulk insert
    if (recordsToInsert.length > 0) {
      const query = `
        INSERT INTO leads 
        (name, email, phone, requirements_summary, budget_range, access_token, status, token_expires_at) 
        VALUES ?
      `;

      const [result] = await pool.query(query, [recordsToInsert]);
      successCount = result.affectedRows;

      // Send Telegram notification
      try {
        await TelegramService.sendAdminNotification({
          type: 'UPLOADED',
          lead_name: `📊 Bulk Upload`,
          lead_email: 'system@crm',
          requirements_summary: `${successCount} new leads imported from Excel`
        });
      } catch (telegramError) {
        console.error('Telegram error (non-blocking):', telegramError.message);
      }
    }

    // Cleanup
    fs.unlinkSync(filePath);

    res.status(200).json({
      message: 'Leads uploaded successfully',
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined,
      totalProcessed: successCount + errorCount
    });

  } catch (error) {
    console.error('Upload error:', error);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: error.message });
  }
});

// GET: Download Excel template
app.get('/api/leads/template', (req, res) => {
  try {
    const ws = XLSX.utils.aoa_to_sheet([
      ['name', 'email', 'phone', 'requirements_summary', 'budget_range'],
      ['John Doe', 'john@example.com', '+91-9876543210', 'ERP Implementation', '10-20 lakhs'],
      ['Jane Smith', 'jane@example.com', '+91-9876543211', 'CRM Customization', '5-10 lakhs'],
    ]);

    ws['!cols'] = [
      { wch: 20 },
      { wch: 25 },
      { wch: 20 },
      { wch: 40 },
      { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');

    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', 'attachment; filename=leads-template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: All leads
app.get('/api/leads', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM leads';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, params);

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM leads ${status ? 'WHERE status = ?' : ''}`,
      status ? [status] : []
    );

    res.status(200).json({
      data: rows,
      pagination: {
        total: countResult[0].total,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Lead by token (for customer view)
app.get('/api/feedback/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || token.length < 30) {
      return res.status(400).json({ error: 'Invalid token format' });
    }

    const [rows] = await pool.query(
      `SELECT id, name, email, phone, requirements_summary, budget_range, status, token_expires_at 
       FROM leads WHERE access_token = ? LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = rows[0];

    // Check expiry
    if (!TokenService.isTokenValid(lead.token_expires_at)) {
      await pool.query('UPDATE leads SET status = ? WHERE id = ?', ['EXPIRED', lead.id]);
      return res.status(410).json({ error: 'Review link has expired' });
    }

    // Check if already responded
    if (['INTERESTED', 'NOT_INTERESTED'].includes(lead.status)) {
      return res.status(400).json({
        error: 'You have already submitted your response',
        status: lead.status
      });
    }

    res.status(200).json({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      requirementsSummary: lead.requirements_summary,
      budgetRange: lead.budget_range
    });

  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST: Submit customer feedback
app.post('/api/feedback/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { decision, notes } = req.body;

    // Validate
    const schema = Joi.object({
      decision: Joi.string().valid('INTERESTED', 'NOT_INTERESTED').required(),
      notes: Joi.string().max(1000).optional()
    });

    const { error, value } = schema.validate({ decision, notes });

    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Fetch lead
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, requirements_summary, budget_range, status, token_expires_at 
       FROM leads WHERE access_token = ? LIMIT 1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = rows[0];

    // Check expiry
    if (!TokenService.isTokenValid(lead.token_expires_at)) {
      return res.status(410).json({ error: 'Review link has expired' });
    }

    // Prevent duplicates
    if (['INTERESTED', 'NOT_INTERESTED'].includes(lead.status)) {
      return res.status(400).json({ error: 'You have already submitted your response' });
    }

    // Update status
    await pool.query(
      `UPDATE leads SET status = ?, customer_notes = ?, responded_at = NOW() WHERE id = ?`,
      [value.decision, value.notes || null, lead.id]
    );

    // Send Telegram notification
    try {
      await TelegramService.sendAdminNotification({
        type: value.decision,
        lead_id: lead.id,
        lead_name: lead.name,
        lead_email: lead.email,
        lead_phone: lead.phone,
        requirements_summary: lead.requirements_summary,
        budget: lead.budget_range,
        customer_notes: value.notes || 'No additional notes'
      });
    } catch (telegramError) {
      console.error('Telegram error (non-blocking):', telegramError.message);
    }

    res.status(200).json({
      message: 'Thank you for your feedback!',
      decision: value.decision
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Server error while processing feedback' });
  }
});

// GET: Dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'INTERESTED' THEN 1 ELSE 0 END) as interested,
        SUM(CASE WHEN status = 'NOT_INTERESTED' THEN 1 ELSE 0 END) as not_interested,
        SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) as expired,
        ROUND((SUM(CASE WHEN status IN ('INTERESTED', 'NOT_INTERESTED') THEN 1 ELSE 0 END) / COUNT(*) * 100), 2) as response_rate
      FROM leads
    `);

    res.status(200).json(stats[0]);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Email already exists' });
  }

  if (err.code === 'PROTOCOL_ERROR') {
    return res.status(500).json({ error: 'Database connection error' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ============================================================================
// SERVER START
// ============================================================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║    🚀 LEAD VERIFICATION CRM - PRODUCTION SERVER RUNNING     ║
╠══════════════════════════════════════════════════════════════╣
║ Server URL:     http://localhost:${PORT}                     
║ Frontend URL:   ${process.env.FRONTEND_URL || 'Not configured'}
║ Database:       ${process.env.DB_NAME || 'lead_crm'}                           
║ Telegram Bot:   ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'}
║ Node Env:       ${process.env.NODE_ENV || 'development'}                 
╚══════════════════════════════════════════════════════════════╝
  `);

  console.log('📚 Available endpoints:');
  console.log('   POST   /api/leads/upload       - Upload Excel with leads');
  console.log('   GET    /api/leads              - Fetch all leads');
  console.log('   GET    /api/leads/template     - Download Excel template');
  console.log('   GET    /api/feedback/:token    - Get lead details');
  console.log('   POST   /api/feedback/:token    - Submit customer feedback');
  console.log('   GET    /api/stats              - Dashboard statistics');
  console.log('   GET    /api/health             - Health check\n');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📌 Shutting down server...');
  await pool.end();
  process.exit(0);
});
