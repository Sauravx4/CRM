# Lead Verification CRM - Quick Start Setup Guide

## ⚡ 5-Minute Quick Start

### Prerequisites
- Node.js v16+ installed
- MySQL/PostgreSQL database running
- Telegram Bot Token & Chat ID (get in 2 minutes below)

---

## 🤖 STEP 1: Create Telegram Bot (2 minutes)

### For Admin Notifications

1. **Open Telegram** and search for **@BotFather**
2. Send `/start` then `/newbot`
3. Follow prompts:
   - Bot name: "Lead CRM Bot"
   - Username: `your_lead_crm_bot`
4. **Copy the TOKEN** provided (format: `123456789:ABCdefGHIjklMNOpqrSTUvwxyzABCDEFGH`)

### Get Your Chat ID

1. Search for **@userinfobot** on Telegram
2. Send it any message
3. Reply shows your **Chat ID** (e.g., `987654321`)

---

## 🗄️ STEP 2: Database Setup (3 minutes)

### Run This SQL Script

```sql
-- Create database
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

-- Insert default settings
INSERT INTO admin_config (setting_key, setting_value) VALUES 
('TELEGRAM_CHAT_ID', ''),
('TOKEN_EXPIRY_DAYS', '30'),
('COMPANY_NAME', 'Your Company');

-- Verify tables created
SHOW TABLES;
```

---

## 📦 STEP 3: Backend Setup

### Create Project Structure

```bash
# Create project folder
mkdir lead-crm-backend
cd lead-crm-backend

# Initialize Node project
npm init -y

# Install dependencies
npm install express mysql2 dotenv uuid multer xlsx axios cors helmet express-rate-limit joi
npm install --save-dev nodemon
```

### Create `.env` File

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_db_password
DB_NAME=lead_crm
DB_PORT=3306

# Server Configuration
PORT=5000
NODE_ENV=development

# Frontend & Links
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000

# Telegram Bot Configuration (from Step 1)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxyzABCDEFGH
TELEGRAM_CHAT_ID=987654321

# Token Configuration
TOKEN_EXPIRY_DAYS=30
```

### Create `package.json` Scripts

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
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
    "joi": "^17.9.2"
  }
}
```

### Copy Backend Server File

Copy the content from `backend-server-complete.js` into your `server.js` file.

### Start Backend

```bash
npm run dev
# Output should show:
# ✅ Database connected successfully
# 🚀 Server running on http://localhost:5000
```

---

## ⚛️ STEP 4: Frontend Setup

### Create React App

```bash
cd ..
npx create-react-app lead-crm-frontend
cd lead-crm-frontend

# Install dependencies
npm install axios react-router-dom
```

### Create `.env.local` File

```env
REACT_APP_BACKEND_URL=http://localhost:5000
REACT_APP_COMPANY_NAME=Your Company
```

### Setup React Router

**Update `src/App.jsx`:**

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
        <Route path="*" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### Create Review Page Component

**Create `src/pages/ReviewPage.jsx`:**

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

### Add Tailwind CSS

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Update `tailwind.config.js`:**

```js
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Update `src/index.css`:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Copy Customer Feedback Component

Copy content from `CustomerFeedback-Production.jsx` into `src/components/CustomerFeedback.jsx`

### Start Frontend

```bash
npm start
# Opens at http://localhost:3000
```

---

## 🧪 STEP 5: Test the System

### 1. Upload Excel File

```bash
# Create a test Excel file (leads.xlsx) with columns:
# name, email, phone, requirements_summary, budget_range

# Open http://localhost:5000/api/leads/template to download template
# Fill it with test data
# Use the template endpoint to upload
```

### 2. Test API

```bash
# Get all leads
curl http://localhost:5000/api/leads

# Check health
curl http://localhost:5000/api/health

# Get dashboard stats
curl http://localhost:5000/api/stats
```

### 3. Test Customer Feedback

1. Upload leads via `/api/leads/upload` endpoint
2. Check database for generated access tokens
3. Navigate to: `http://localhost:3000/review?token=<YOUR_TOKEN>`
4. Fill out feedback form
5. Check Telegram for notification ✅

---

## 🚀 DEPLOYMENT GUIDE

### Option 1: Heroku (Backend)

```bash
# Install Heroku CLI
npm install -g heroku

# Login
heroku login

# Create app
cd lead-crm-backend
heroku create your-crm-backend

# Add database add-on (optional)
heroku addons:create cleardb:ignite

# Set environment variables
heroku config:set DB_HOST=your_db_host
heroku config:set DB_USER=your_db_user
heroku config:set DB_PASSWORD=your_db_password
heroku config:set DB_NAME=your_db_name
heroku config:set TELEGRAM_BOT_TOKEN=your_token
heroku config:set TELEGRAM_CHAT_ID=your_chat_id
heroku config:set FRONTEND_URL=https://your-frontend.com

# Deploy
git push heroku main

# Check logs
heroku logs --tail
```

### Option 2: Netlify (Frontend)

```bash
# Build React app
cd lead-crm-frontend
npm run build

# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=build

# Configure environment variable
# In Netlify dashboard:
# Settings > Build & Deploy > Environment
# Add: REACT_APP_BACKEND_URL=https://your-heroku-app.herokuapp.com
```

### Option 3: Docker (Complete Stack)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: lead_crm
    ports:
      - "3306:3306"
    volumes:
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql

  backend:
    build: ./backend
    ports:
      - "5000:5000"
    environment:
      DB_HOST: mysql
      DB_USER: root
      DB_PASSWORD: root
      DB_NAME: lead_crm
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}
      FRONTEND_URL: http://localhost:3000
    depends_on:
      - mysql

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      REACT_APP_BACKEND_URL: http://localhost:5000
    depends_on:
      - backend
```

Run: `docker-compose up`

---

## 📊 ADMIN DASHBOARD (Optional Enhancement)

### Simple Dashboard Endpoint

Add to backend:

```javascript
app.get('/api/admin/dashboard', async (req, res) => {
  try {
    // Validate admin token (implement your auth)
    
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'INTERESTED' THEN 1 ELSE 0 END) as interested,
        SUM(CASE WHEN status = 'NOT_INTERESTED' THEN 1 ELSE 0 END) as not_interested,
        ROUND((SUM(CASE WHEN status IN ('INTERESTED', 'NOT_INTERESTED') THEN 1 ELSE 0 END) / COUNT(*) * 100), 2) as response_rate
      FROM leads
    `);

    const [recentResponses] = await pool.query(`
      SELECT name, email, status, responded_at, customer_notes
      FROM leads
      WHERE status IN ('INTERESTED', 'NOT_INTERESTED')
      ORDER BY responded_at DESC
      LIMIT 10
    `);

    res.json({
      stats: stats[0],
      recent: recentResponses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 🔒 SECURITY CHECKLIST

- [ ] Changed default database password
- [ ] Set `NODE_ENV=production`
- [ ] Enabled HTTPS on production
- [ ] Configured CORS with specific domain
- [ ] Set rate limiting appropriately
- [ ] Stored Telegram token in environment variable
- [ ] Implemented input validation (Joi)
- [ ] Added error logging
- [ ] Setup database backups
- [ ] Enabled database connection pooling

---

## 📈 MONITORING & MAINTENANCE

### Monitor Active Leads

```sql
SELECT status, COUNT(*) as count
FROM leads
GROUP BY status;
```

### Check Notification Logs

```sql
SELECT * FROM notification_logs
WHERE sent_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
ORDER BY sent_at DESC;
```

### Database Size

```sql
SELECT 
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.tables
WHERE table_schema = 'lead_crm';
```

### Backup Database

```bash
mysqldump -u root -p lead_crm > backup-$(date +%Y%m%d).sql
```

---

## 🐛 TROUBLESHOOTING

### Issue: "Database connection refused"
- Check MySQL is running: `sudo systemctl status mysql`
- Verify credentials in `.env`
- Test connection: `mysql -h DB_HOST -u DB_USER -p DB_NAME`

### Issue: "Telegram notifications not sending"
1. Verify bot token: `curl https://api.telegram.org/bot{TOKEN}/getMe`
2. Confirm Chat ID is numeric
3. Check bot has message permissions

### Issue: "CORS error in browser"
- Update `FRONTEND_URL` in backend `.env`
- Restart backend server
- Clear browser cache

### Issue: "Token generation fails"
- Check `uuid` package is installed
- Verify database connection
- Review server logs for errors

---

## 📞 SUPPORT RESOURCES

- **Express.js Docs**: https://expressjs.com
- **React Docs**: https://react.dev
- **MySQL Docs**: https://dev.mysql.com/doc
- **Telegram Bot API**: https://core.telegram.org/bots/api
- **Tailwind CSS**: https://tailwindcss.com

---

## 📝 SAMPLE EXCEL FORMAT

Your upload Excel should have these columns:

| name | email | phone | requirements_summary | budget_range |
|------|-------|-------|----------------------|--------------|
| Rahul Kumar | rahul@company.com | +91-9876543210 | ERP system implementation with GST module | 15-25 lakhs |
| Priya Sharma | priya@startup.io | +91-9123456789 | CRM customization and integration | 5-10 lakhs |
| Amit Patel | amit@enterprise.in | +91-9555555555 | AI chatbot development | 20-50 lakhs |

---

## ✅ PRODUCTION CHECKLIST

Before going live:

- [ ] Database backups automated
- [ ] Error logging configured
- [ ] HTTPS enabled
- [ ] Environment variables secured
- [ ] Rate limiting tested
- [ ] Input validation working
- [ ] Telegram notifications verified
- [ ] Performance tested with 1000+ leads
- [ ] Security headers configured
- [ ] CORS properly restricted
- [ ] Database indexes optimized
- [ ] Monitoring alerts setup

---

**Version:** 1.0.0
**Last Updated:** 2024
**Ready for Production:** ✅
