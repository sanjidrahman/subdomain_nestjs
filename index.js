const express = require('express');
const { router } = require('./routes');
const { validateSubdomain } = require('./utils');
const { stores } = require('./store'); // Import from separate module
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(express.json());

// Configuration
const MAIN_DOMAIN = process.env.MAIN_DOMAIN || 'myoutlet.app';
const SERVER_IP = process.env.SERVER_IP || '1.2.3.4';
const DNS_PROVIDER = process.env.DNS_PROVIDER || 'manual';

// Early path validation middleware
app.use((req, res, next) => {
  const fullUrl = `${req.protocol}://${req.get('host') || 'unknown'}${req.originalUrl}`;
  console.log(`Request received: ${fullUrl}, IP: ${req.ip}, User-Agent: ${req.get('User-Agent') || 'unknown'}`);
  
  // Block invalid paths
  const invalidPathRegex = /^(?:https?:\/\/|[<>[\]():])/i;
  if (invalidPathRegex.test(req.originalUrl) || req.originalUrl.includes('://')) {
    console.warn(`Blocked invalid path: ${req.originalUrl}`);
    return res.status(400).json({
      success: false,
      message: 'Invalid request path. URLs or special characters are not allowed.'
    });
  }
  
  next();
});

// Subdomain middleware
app.use((req, res, next) => {
  const host = req.get('host');
  if (!host) {
    console.warn('No host header provided in request');
    return res.status(400).json({
      success: false,
      message: 'Host header is required'
    });
  }
  
  const parts = host.split('.');
  const isSubdomain = parts.length >= 3 && !host.includes('localhost');
  
  if (isSubdomain) {
    const subdomain = parts[0];
    
    if (['www', 'api', 'admin'].includes(subdomain)) {
      return next();
    }
    
    const validation = validateSubdomain(subdomain);
    if (!validation.isValid) {
      console.warn(`Invalid subdomain format: ${subdomain}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid subdomain format'
      });
    }
    
    const store = Array.from(stores.values()).find(s => s.subdomain === subdomain);
    
    if (store) {
      req.store = store;
      req.isSubdomainRequest = true;
    } else {
      req.isSubdomainRequest = true;
    }
  }
  
  next();
});

// Register routes
app.use(router);

// Fallback for unmatched routes
app.use((req, res) => {
  console.warn(`Unmatched route: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 MyStore Subdomain System Started!
📡 Port: ${PORT}
🌐 Domain: ${MAIN_DOMAIN}
🖥️  Server IP: ${SERVER_IP}
🔧 DNS Provider: ${DNS_PROVIDER}

🎯 Ready to create stores!
Visit: http://localhost:${PORT}

📋 Environment Variables:
- MAIN_DOMAIN=${MAIN_DOMAIN}
- SERVER_IP=${SERVER_IP}
- DNS_PROVIDER=${DNS_PROVIDER}
- CLOUDFLARE_ZONE_ID=${process.env.CLOUDFLARE_ZONE_ID || 'not set'}
- CLOUDFLARE_API_TOKEN=${process.env.CLOUDFLARE_API_TOKEN ? 'set' : 'not set'}
  `);
});

// Export stores for backward compatibility (if needed elsewhere)
module.exports = { stores };