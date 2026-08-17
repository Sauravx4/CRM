# Lead Verification & Outreach CRM System
## Production-Ready Full-Stack Implementation

---

## 📋 PROJECT STRUCTURE
```
lead-verification-crm/
├── backend/
│   ├── server.js                 # Express server entry point
│   ├── package.json              # Dependencies
│   ├── .env                      # Environment variables (example below)
│   ├── config/
│   │   └── database.js           # Database connection pool
│   ├── routes/
│   │   ├── leads.js              # Lead upload & ingestion routes
│   │   └── feedback.js           # Customer feedback routes
│   ├── controllers/
│   │   ├── leadController.js     # Lead upload logic
│   │   └── feedbackController.js # Feedback submission logic
│   ├── middleware/
│   │   └── errorHandler.js       # Global error handling
│   ├── services/
│   │   ├── tokenService.js       # UUID token generation
│   │   ├── emailService.js       # Email sending (optional)
│   │   └── telegramService.js    # Telegram notifications
│   ├── db/
│   │   └── schema.sql            # Database initialization script
│   └── uploads/                  # Temporary Excel upload folder
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── CustomerFeedback.jsx   # Customer review page
│   │   ├── pages/
│   │   │   └── ReviewPage.jsx         # Landing page wrapper
│   │   ├── styles/
│   │   │   └── index.css              # Tailwind + custom styles
│   │   └── App.jsx               # React app root
│   ├── package.json
│   └── .env.local                # Frontend config
└── README.md                      # Complete setup guide
```

---

## 🗄️ DATABASE SCHEMA (SQL)

```sql
-- Database creation
CREATE DATABASE IF NOT EXISTS lead_crm;
USE lead_crm;

-- Leads Table
CREATE TABLE leads (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    requirements_summary TEXT,
    budget_range VARCHAR(100),
    access_token VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('PENDING', 'INTERESTED', 'NOT_INTERESTED', 'EXPIRED') DEFAULT 'PENDING',
    customer_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    token_expires_at TIMESTAMP,
    INDEX idx_token (access_token),
    INDEX idx_status (status),
    INDEX idx_email (email),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notification Logs Table
CREATE TABLE notification_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    lead_id INT NOT NULL,
    notification_type ENUM('UPLOADED', 'LINK_SENT', 'INTERESTED', 'NOT_INTERESTED') NOT NULL,
    telegram_message_id INT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('SENT', 'FAILED') DEFAULT 'SENT',
    error_message TEXT,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    INDEX idx_lead (lead_id),
    INDEX idx_sent (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin Configuration Table
CREATE TABLE admin_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default admin telegram settings placeholder
INSERT INTO admin_config (setting_key, setting_value) VALUES 
('TELEGRAM_CHAT_ID', ''),
('TOKEN_EXPIRY_DAYS', '30'),
('COMPANY_NAME', 'Your Company');
```

---

## 🔧 BACKEND IMPLEMENTATION

### 1. `package.json`

```json
{
  "name": "lead-verification-crm-backend",
  "version": "1.0.0",
  "description": "Production-ready Lead Verification CRM with Telegram notifications",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "migrate": "node scripts/migrate.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.0",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0",
    "multer": "^1.4.5-lts.1",
    "xlsx": "^0.18.5",
    "axios": "^1.4.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.7.0",
    "joi": "^17.9.2",
    "nodemailer": "^6.9.4"
  },
  "devDependencies": {
    "nodemon": "^2.0.22"
  }
}
```

### 2. `config/database.js`

```javascript
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelayMs: 0,
  timezone: '+00:00'
});

// Test connection
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;
```

### 3. `services/tokenService.js`

```javascript
const { v4: uuidv4 } = require('uuid');

class TokenService {
  /**
   * Generate a secure UUID access token
   */
  static generateAccessToken() {
    return uuidv4();
  }

  /**
   * Generate expiry date (default 30 days from now)
   */
  static generateExpiryDate(days = 30) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    return expiryDate;
  }

  /**
   * Validate if token is still valid
   */
  static isTokenValid(expiryDate) {
    return new Date() <= new Date(expiryDate);
  }

  /**
   * Generate customer review link
   */
  static generateReviewLink(token, baseUrl = process.env.FRONTEND_URL) {
    return `${baseUrl}/review?token=${token}`;
  }
}

module.exports = TokenService;
```

### 4. `services/telegramService.js`

```javascript
const axios = require('axios');
const pool = require('../config/database');
require('dotenv').config();

class TelegramService {
  /**
   * Send admin notification via Telegram
   */
  static async sendAdminNotification(notificationData) {
    try {
      // Fetch Telegram Chat ID from config
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
      
      // Log failed notification
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

  /**
   * Format message with emojis and structured data
   */
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

  /**
   * Log notification in database
   */
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

module.exports = TelegramService;
```

### 5. `controllers/leadController.js`

```javascript
const pool = require('../config/database');
const multer = require('multer');
const XLSX = require('xlsx');
const TokenService = require('../services/tokenService');
const TelegramService = require('../services/telegramService');
const fs = require('fs');
const path = require('path');

// Configure multer
const upload = multer({ dest: 'uploads/' });

class LeadController {
  /**
   * POST /api/leads/upload
   * Upload and ingest Excel file with lead data
   */
  static async uploadLeads(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        return res.status(400).json({ error: 'Excel file is empty' });
      }

      // Validate required columns
      const requiredColumns = ['name', 'email', 'phone', 'requirements_summary', 'budget_range'];
      const firstRow = jsonData[0];
      const missingColumns = requiredColumns.filter(col => !Object.keys(firstRow).map(k => k.toLowerCase()).includes(col.toLowerCase()));

      if (missingColumns.length > 0) {
        return res.status(400).json({
          error: `Missing required columns: ${missingColumns.join(', ')}`
        });
      }

      // Process each row
      const recordsToInsert = [];
      for (const row of jsonData) {
        try {
          const token = TokenService.generateAccessToken();
          const expiryDate = TokenService.generateExpiryDate(
            parseInt(process.env.TOKEN_EXPIRY_DAYS || 30)
          );

          recordsToInsert.push([
            row.name?.trim() || 'N/A',
            row.email?.trim()?.toLowerCase() || '',
            row.phone?.trim() || '',
            row.requirements_summary?.trim() || '',
            row.budget_range?.trim() || '',
            token,
            'PENDING',
            expiryDate,
          ]);
        } catch (rowError) {
          errorCount++;
          errors.push(`Row ${jsonData.indexOf(row) + 1}: ${rowError.message}`);
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

        // Send Telegram notification for bulk upload
        await TelegramService.sendAdminNotification({
          type: 'UPLOADED',
          lead_name: `Bulk Upload - ${successCount} Leads`,
          lead_email: 'system@crm.local',
          requirements_summary: `${successCount} new leads imported from Excel`
        });
      }

      // Clean up file
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
  }

  /**
   * GET /api/leads/export-template
   * Download Excel template
   */
  static async downloadTemplate(req, res) {
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

      res.setHeader('Content-Disposition', 'attachment; filename=leads-template.xlsx');
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      XLSX.write(wb, { bookType: 'xlsx', type: 'stream' });
      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      res.send(buffer);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/leads
   * Fetch all leads with filtering
   */
  static async getAllLeads(req, res) {
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

      // Get total count
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
  }
}

module.exports = { LeadController, upload };
```

### 6. `controllers/feedbackController.js`

```javascript
const pool = require('../config/database');
const TokenService = require('../services/tokenService');
const TelegramService = require('../services/telegramService');
const Joi = require('joi');

class FeedbackController {
  /**
   * GET /api/feedback/:token
   * Retrieve lead data using secure token
   */
  static async getLead(req, res) {
    try {
      const { token } = req.params;

      // Validate token format
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

      // Check token expiry
      if (!TokenService.isTokenValid(lead.token_expires_at)) {
        // Update status to EXPIRED
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
  }

  /**
   * POST /api/feedback/:token
   * Submit customer feedback
   */
  static async submitFeedback(req, res) {
    try {
      const { token } = req.params;
      const { decision, notes } = req.body;

      // Validate input
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

      // Validate token expiry
      if (!TokenService.isTokenValid(lead.token_expires_at)) {
        return res.status(410).json({ error: 'Review link has expired' });
      }

      // Prevent duplicate submissions
      if (['INTERESTED', 'NOT_INTERESTED'].includes(lead.status)) {
        return res.status(400).json({ error: 'You have already submitted your response' });
      }

      // Update lead status
      await pool.query(
        `UPDATE leads SET status = ?, customer_notes = ?, responded_at = NOW() WHERE id = ?`,
        [value.decision, value.notes || null, lead.id]
      );

      // Send Telegram notification
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

      res.status(200).json({
        message: 'Thank you for your feedback!',
        decision: value.decision
      });

    } catch (error) {
      console.error('Error submitting feedback:', error);
      res.status(500).json({ error: 'Server error while processing feedback' });
    }
  }

  /**
   * GET /api/stats
   * Dashboard statistics for admin
   */
  static async getStats(req, res) {
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
  }
}

module.exports = FeedbackController;
```

### 7. `routes/leads.js`

```javascript
const express = require('express');
const { LeadController, upload } = require('../controllers/leadController');

const router = express.Router();

// POST: Upload Excel file with leads
router.post('/upload', upload.single('file'), LeadController.uploadLeads);

// GET: Download Excel template
router.get('/template', LeadController.downloadTemplate);

// GET: Fetch all leads with pagination and filtering
router.get('/', LeadController.getAllLeads);

module.exports = router;
```

### 8. `routes/feedback.js`

```javascript
const express = require('express');
const FeedbackController = require('../controllers/feedbackController');

const router = express.Router();

// GET: Retrieve lead details using token
router.get('/:token', FeedbackController.getLead);

// POST: Submit customer feedback
router.post('/:token', FeedbackController.submitFeedback);

// GET: Admin dashboard statistics
router.get('/stats/dashboard', FeedbackController.getStats);

module.exports = router;
```

### 9. `middleware/errorHandler.js`

```javascript
const errorHandler = (err, req, res, next) => {
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
};

module.exports = errorHandler;
```

### 10. `server.js`

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const pool = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const leadsRoutes = require('./routes/leads');
const feedbackRoutes = require('./routes/feedback');

const app = express();

// Middleware
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

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Routes
app.use('/api/leads', leadsRoutes);
app.use('/api/feedback', feedbackRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`🤖 Telegram Bot Token configured: ${process.env.TELEGRAM_BOT_TOKEN ? '✅' : '❌'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📌 Shutting down server...');
  await pool.end();
  process.exit(0);
});
```

### 11. `.env` (Backend Configuration)

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_db_password
DB_NAME=lead_crm
DB_PORT=3306

# Server Configuration
PORT=5000
NODE_ENV=production

# Frontend & Links
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_CHAT_ID=your_telegram_chat_id_here

# Token Configuration
TOKEN_EXPIRY_DAYS=30

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Logging
LOG_LEVEL=info
```

---

## ⚛️ FRONTEND IMPLEMENTATION (React + Tailwind)

### 1. `CustomerFeedback.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const CustomerFeedback = ({ token }) => {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState(null);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

  useEffect(() => {
    fetchLead();
  }, [token]);

  const fetchLead = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${BACKEND_URL}/api/feedback/${token}`);
      setLead(response.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 410) {
        setError('⏰ This review link has expired. Please contact support.');
      } else if (err.response?.status === 404) {
        setError('❌ Lead not found. Invalid review link.');
      } else if (err.response?.status === 400 && err.response?.data?.status) {
        setError(`✅ You have already submitted: ${err.response.data.status}`);
        setSubmitted(true);
      } else {
        setError(err.response?.data?.error || 'Failed to load review data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (selectedDecision) => {
    try {
      setSubmitting(true);
      await axios.post(`${BACKEND_URL}/api/feedback/${token}`, {
        decision: selectedDecision,
        notes: notes || undefined
      });

      setDecision(selectedDecision);
      setSubmitted(true);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading your review...</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">
            {decision === 'INTERESTED' ? '✅' : '❌'}
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {decision === 'INTERESTED' ? 'Thank You!' : 'Feedback Received'}
          </h2>
          <p className="text-gray-600 mb-6">
            {decision === 'INTERESTED'
              ? "We're excited about the opportunity to work together!"
              : 'We appreciate your feedback and will reach out if needed.'}
          </p>
          <p className="text-sm text-gray-500">
            Response submitted at {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            📋 Project Review
          </h1>
          <p className="text-gray-600">
            Please review your project requirements and let us know your interest
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {/* Lead Card */}
        {lead && !error && (
          <div className="space-y-6">
            {/* Contact Info Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                👤 Contact Information
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Name</p>
                  <p className="text-gray-800 font-medium">{lead.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Email</p>
                  <p className="text-gray-800 font-medium break-all">{lead.email}</p>
                </div>
                {lead.phone && (
                  <div>
                    <p className="text-sm text-gray-500 uppercase tracking-wide">Phone</p>
                    <p className="text-gray-800 font-medium">{lead.phone}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Requirements Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                🎯 Project Requirements
              </h3>
              <div className="bg-indigo-50 rounded-lg p-4 mb-4">
                <p className="text-gray-800 leading-relaxed">
                  {lead.requirementsSummary || 'No specific requirements provided'}
                </p>
              </div>
              {lead.budgetRange && (
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">
                    Budget Range
                  </p>
                  <p className="text-gray-800 font-semibold">{lead.budgetRange}</p>
                </div>
              )}
            </div>

            {/* Feedback Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                💬 Your Feedback
              </h3>

              {/* Optional Notes */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Comments (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Share any additional thoughts or questions..."
                  maxLength={1000}
                  disabled={submitting}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none disabled:bg-gray-50"
                  rows="4"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {notes.length}/1000 characters
                </p>
              </div>

              {/* Decision Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleSubmit('NOT_INTERESTED')}
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-red-50 border-2 border-red-300 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ❌ Not Interested
                </button>
                <button
                  onClick={() => handleSubmit('INTERESTED')}
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-green-50 border-2 border-green-300 text-green-600 font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✅ Interested
                </button>
              </div>

              {submitting && (
                <div className="mt-4 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 mr-2"></div>
                  <p className="text-gray-600 text-sm">Submitting your response...</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-sm text-gray-500">
              <p>This review link is valid for 30 days from creation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerFeedback;
```

### 2. `ReviewPage.jsx`

```jsx
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CustomerFeedback from '../components/CustomerFeedback';

const ReviewPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [invalidToken, setInvalidToken] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalidToken(true);
    }
  }, [token]);

  if (invalidToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
          <p className="text-6xl mb-4">⚠️</p>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Invalid Link</h2>
          <p className="text-gray-600">
            The review link is missing or invalid. Please check your email for the correct link.
          </p>
        </div>
      </div>
    );
  }

  return <CustomerFeedback token={token} />;
};

export default ReviewPage;
```

### 3. `App.jsx`

```jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ReviewPage from './pages/ReviewPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### 4. `Frontend package.json`

```json
{
  "name": "lead-verification-crm-frontend",
  "version": "1.0.0",
  "proxy": "http://localhost:5000",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.14.0",
    "axios": "^1.4.0",
    "tailwindcss": "^3.3.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build"
  },
  "eslintConfig": {
    "extends": ["react-app"]
  }
}
```

### 5. `.env.local` (Frontend Configuration)

```env
REACT_APP_BACKEND_URL=http://localhost:5000
```

---

## 🔐 TELEGRAM BOT SETUP GUIDE

### Step 1: Create Telegram Bot
1. Open Telegram and search for **@BotFather**
2. Send `/start` and then `/newbot`
3. Follow the prompts to create a new bot
4. BotFather will give you a **TOKEN** - save this!

Example token: `123456789:ABCdefGHIjklMNOpqrSTUvwxyzABCDEFGH`

### Step 2: Get Your Chat ID
1. Search for **@userinfobot** in Telegram
2. Send it any message
3. It will reply with your Chat ID (e.g., `123456789`)
4. Save this ID

### Step 3: Update `.env`
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxyzABCDEFGH
TELEGRAM_CHAT_ID=123456789
```

### Step 4: Test the Bot
Send a test message to verify:
```bash
curl "https://api.telegram.org/bot{YOUR_BOT_TOKEN}/sendMessage?chat_id={YOUR_CHAT_ID}&text=Hello%20from%20Lead%20CRM!"
```

---

## 🚀 DEPLOYMENT & SETUP

### Prerequisites
- Node.js >= 16
- MySQL/PostgreSQL >= 5.7
- Telegram Bot Token & Chat ID

### Local Development Setup

#### 1. Clone & Install
```bash
# Backend setup
cd backend
npm install
mkdir uploads

# Frontend setup
cd ../frontend
npm install
```

#### 2. Database Setup
```bash
# Connect to MySQL
mysql -u root -p

# Run schema
SOURCE /path/to/schema.sql;

# Verify
USE lead_crm;
SHOW TABLES;
```

#### 3. Environment Configuration
```bash
# Backend
cp .env.example .env
# Edit .env with your database & Telegram credentials

# Frontend
cp .env.local.example .env.local
```

#### 4. Start Services
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm start

# Access at http://localhost:3000
```

### Production Deployment (Heroku Example)

#### Backend Deployment
```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
heroku create your-crm-backend

# Set environment variables
heroku config:set DB_HOST=your_db_host
heroku config:set TELEGRAM_BOT_TOKEN=your_token
heroku config:set FRONTEND_URL=https://your-frontend.netlify.app

# Deploy
git push heroku main
```

#### Frontend Deployment (Netlify)
```bash
npm run build
# Upload build/ folder to Netlify
# Set REACT_APP_BACKEND_URL to your Heroku backend URL
```

---

## 📊 API ENDPOINTS REFERENCE

### Leads Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leads/upload` | Upload Excel file with leads |
| GET | `/api/leads` | Fetch all leads (paginated) |
| GET | `/api/leads/template` | Download Excel template |

### Feedback
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/feedback/:token` | Get lead details (requires valid token) |
| POST | `/api/feedback/:token` | Submit customer feedback |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats/dashboard` | Get dashboard statistics |

---

## 🔒 Security Features Implemented

✅ **Token-based access** - UUID tokens prevent unauthorized access
✅ **Expiring links** - Tokens expire after 30 days (configurable)
✅ **CORS protection** - Whitelist frontend domain
✅ **Rate limiting** - Prevent abuse with express-rate-limit
✅ **Input validation** - Joi schema validation
✅ **SQL injection prevention** - Parameterized queries
✅ **Secure headers** - Helmet.js security middleware
✅ **Duplicate submission prevention** - Status tracking
✅ **Telegram token security** - Environment-based configuration

---

## 🐛 TROUBLESHOOTING

### Database Connection Error
```bash
# Check MySQL is running
sudo service mysql status

# Verify credentials in .env
mysql -h DB_HOST -u DB_USER -p DB_NAME
```

### Telegram Notifications Not Sending
1. Verify bot token: `curl https://api.telegram.org/bot{TOKEN}/getMe`
2. Check Chat ID is correct
3. Ensure bot is admin in the target chat

### CORS Errors
- Update `FRONTEND_URL` in backend `.env`
- Ensure CORS origin matches exactly

### File Upload Issues
- Check `uploads/` directory exists and is writable
- Verify file size is < 50MB
- Ensure Excel columns match required headers

---

## 📈 MONITORING & LOGGING

Add to `server.js` for advanced monitoring:

```javascript
// Morgan logging
const morgan = require('morgan');
app.use(morgan('combined'));

// Error tracking (Sentry example)
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });
app.use(Sentry.Handlers.errorHandler());
```

---

## 📝 SAMPLE EXCEL FORMAT

| name | email | phone | requirements_summary | budget_range |
|------|-------|-------|----------------------|--------------|
| Rahul Kumar | rahul@company.com | +91-9876543210 | ERP system implementation with GST module | 15-25 lakhs |
| Priya Sharma | priya@startup.io | +91-9123456789 | CRM customization and integration | 5-10 lakhs |
| Amit Patel | amit@enterprise.in | +91-9555555555 | AI chatbot development | 20-50 lakhs |

---

## 🎯 NEXT STEPS & ENHANCEMENTS

1. **Email Notifications** - Send review links via email
2. **SMS Integration** - Add Twilio for SMS alerts
3. **Analytics Dashboard** - Real-time response tracking
4. **Custom Branding** - White-label review page
5. **Multi-admin Support** - Role-based access control
6. **Bulk Email Sending** - SMTP integration for outreach
7. **Advanced Filters** - Filter leads by status, date range, budget
8. **Export Reports** - Generate Excel reports of responses
9. **A/B Testing** - Test different response prompts
10. **Integration with CRM** - Sync with Salesforce/HubSpot

---

## 📞 SUPPORT & MAINTENANCE

- Monitor database size: `SELECT table_name, ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb FROM information_schema.tables WHERE table_schema = 'lead_crm';`
- Backup database regularly: `mysqldump -u root -p lead_crm > backup.sql`
- Review notification logs: `SELECT * FROM notification_logs ORDER BY sent_at DESC LIMIT 50;`

---

**Version:** 1.0.0
**Last Updated:** 2024
**License:** MIT
