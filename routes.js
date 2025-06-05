const express = require('express');
const crypto = require('crypto');
const { generateUniqueSubdomain, validateSubdomain } = require('./utils');
const { deployStore } = require('./deploy');
const { stores } = require('./store');
const templateService = require('./templateService');

const router = express.Router();
const MAIN_DOMAIN = process.env.MAIN_DOMAIN || 'myoutlet.app';

// System status endpoint
router.get('/api/system/status', (req, res) => {
  res.json({
    success: true,
    data: {
      system: {
        nodeEnv: process.env.NODE_ENV || 'development',
        mainDomain: MAIN_DOMAIN,
        serverIp: process.env.SERVER_IP || '1.2.3.4',
        dnsProvider: process.env.DNS_PROVIDER || 'manual'
      },
      cloudflare: {
        configured: !!(process.env.CLOUDFLARE_ZONE_ID && process.env.CLOUDFLARE_API_TOKEN),
        zoneId: process.env.CLOUDFLARE_ZONE_ID ? 'configured' : 'not configured',
        apiToken: process.env.CLOUDFLARE_API_TOKEN ? 'configured' : 'not configured'
      },
      stores: {
        total: stores.size,
        active: Array.from(stores.values()).filter(s => s.status === 'active').length,
        configuring: Array.from(stores.values()).filter(s => s.status === 'configuring').length,
        failed: Array.from(stores.values()).filter(s => s.status === 'failed').length
      }
    }
  });
});

// Create store
router.post('/api/stores/create', async (req, res) => {
  try {
    const { storeName, customSubdomain } = req.body;
    
    if (!storeName) {
      return res.status(400).json({
        success: false,
        message: 'Store name is required'
      });
    }
    
    let subdomain;
    
    if (customSubdomain) {
      const validation = validateSubdomain(customSubdomain);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid subdomain format. Must be 3-63 characters, lowercase letters, numbers, and hyphens only.'
        });
      }
      subdomain = customSubdomain;
    } else {
      subdomain = generateUniqueSubdomain(storeName);
    }
    
    // Check if subdomain already exists
    const existingStore = Array.from(stores.values()).find(s => s.subdomain === subdomain);
    if (existingStore) {
      return res.status(409).json({
        success: false,
        message: 'Subdomain already taken',
        suggestion: generateUniqueSubdomain(storeName)
      });
    }
    
    const storeId = crypto.randomUUID();
    const fullDomain = `${subdomain}.${MAIN_DOMAIN}`;
    const store = {
      id: storeId,
      name: storeName,
      subdomain,
      status: 'creating',
      createdAt: new Date(),
      fullDomain,
      publicUrl: null,
      deploymentLogs: [],
      products: [
        { name: 'Sample Product 1', description: 'Amazing product for your needs', price: 29.99 },
        { name: 'Sample Product 2', description: 'Another great product', price: 39.99 },
        { name: 'Sample Product 3', description: 'Premium quality item', price: 49.99 }
      ]
    };
    
    stores.set(storeId, store);
    
    res.status(201).json({
      success: true,
      message: 'Store creation initiated',
      data: {
        storeId: store.id,
        storeName: store.name,
        subdomain: store.subdomain,
        fullDomain: store.fullDomain,
        status: store.status,
        note: `Your store will be accessible at http://${store.fullDomain} once deployment completes`
      }
    });
    
    // Start deployment asynchronously
    deployStore(storeId, subdomain).catch(error => {
      console.error(`Deployment failed for ${subdomain}:`, error.message);
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create store',
      error: error.message
    });
  }
});

// Get store status with detailed information
router.get('/api/stores/:storeId/status', (req, res) => {
  const { storeId } = req.params;
  const store = stores.get(storeId);
  
  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Store not found'
    });
  }
  
  // Calculate deployment time if applicable
  let deploymentTime = null;
  if (store.deploymentStarted) {
    const endTime = store.deploymentCompleted || store.deploymentFailed || new Date();
    deploymentTime = Math.round((endTime - store.deploymentStarted) / 1000);
  }
  
  res.json({
    success: true,
    data: {
      storeId: store.id,
      name: store.name,
      subdomain: store.subdomain,
      status: store.status,
      fullDomain: store.fullDomain,
      publicUrl: store.publicUrl,
      deployment: {
        started: store.deploymentStarted,
        completed: store.deploymentCompleted,
        failed: store.deploymentFailed,
        timeSeconds: deploymentTime,
        logs: store.deploymentLogs || []
      },
      errorMessage: store.errorMessage,
      createdAt: store.createdAt
    }
  });
});

// Get deployment logs for a store
router.get('/api/stores/:storeId/logs', (req, res) => {
  const { storeId } = req.params;
  const store = stores.get(storeId);
  
  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Store not found'
    });
  }
  
  res.json({
    success: true,
    data: {
      storeId: store.id,
      subdomain: store.subdomain,
      status: store.status,
      logs: store.deploymentLogs || [],
      timestamps: {
        created: store.createdAt,
        deploymentStarted: store.deploymentStarted,
        deploymentCompleted: store.deploymentCompleted,
        deploymentFailed: store.deploymentFailed
      }
    }
  });
});

// Check subdomain availability
router.get('/api/stores/check-subdomain/:subdomain', (req, res) => {
  const { subdomain } = req.params;
  
  const validation = validateSubdomain(subdomain);
  if (!validation.isValid) {
    return res.status(400).json({
      available: false,
      valid: false,
      message: 'Invalid subdomain format. Must be 3-63 characters, lowercase letters, numbers, and hyphens only.',
      suggestion: generateUniqueSubdomain(subdomain)
    });
  }
  
  const existingStore = Array.from(stores.values()).find(s => s.subdomain === subdomain);
  
  res.json({
    available: !existingStore,
    valid: true,
    subdomain,
    suggestion: !existingStore ? null : generateUniqueSubdomain(subdomain)
  });
});

// List all stores with enhanced information
router.get('/api/stores', (req, res) => {
  const allStores = Array.from(stores.values()).map(store => {
    let deploymentTime = null;
    if (store.deploymentStarted) {
      const endTime = store.deploymentCompleted || store.deploymentFailed || new Date();
      deploymentTime = Math.round((endTime - store.deploymentStarted) / 1000);
    }
    
    return {
      storeId: store.id,
      name: store.name,
      subdomain: store.subdomain,
      status: store.status,
      fullDomain: store.fullDomain,
      publicUrl: store.publicUrl,
      createdAt: store.createdAt,
      deploymentTimeSeconds: deploymentTime
    };
  });
  
  // Sort by creation date (newest first)
  allStores.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({
    success: true,
    data: allStores,
    summary: {
      total: allStores.length,
      active: allStores.filter(s => s.status === 'active').length,
      configuring: allStores.filter(s => s.status === 'configuring').length,
      failed: allStores.filter(s => s.status === 'failed').length
    }
  });
});

// Delete a store
router.delete('/api/stores/:storeId', (req, res) => {
  const { storeId } = req.params;
  const store = stores.get(storeId);
  
  if (!store) {
    return res.status(404).json({
      success: false,
      message: 'Store not found'
    });
  }
  
  stores.delete(storeId);
  
  res.json({
    success: true,
    message: 'Store deleted successfully',
    data: {
      storeId,
      subdomain: store.subdomain,
      note: 'Manual cleanup of DNS records may be required if using Cloudflare'
    }
  });
});

// Main API route
router.get('/', (req, res) => {
  const fullUrl = `${req.protocol}://${req.get('host') || 'unknown'}${req.originalUrl}`;
  console.log(`Processing main API: ${fullUrl}`);
  
  if (req.isSubdomainRequest) {
    if (req.store) {
      // Serve HTML template for subdomain root
      const html = templateService.generateStoreHTML(req.store);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } else {
      res.status(404).json({
        success: false,
        message: `Subdomain "${req.get('host')?.split('.')[0] || 'unknown'}" not found`,
        suggestion: 'Check if the store deployment is complete or if the subdomain is correct'
      });
    }
  } else {
    res.json({
      success: true,
      message: 'Welcome to MyStore API',
      version: '1.0.0',
      endpoints: {
        system: {
          status: 'GET /api/system/status'
        },
        stores: {
          create: 'POST /api/stores/create',
          list: 'GET /api/stores',
          getStatus: 'GET /api/stores/:storeId/status',
          getLogs: 'GET /api/stores/:storeId/logs',
          delete: 'DELETE /api/stores/:storeId',
          checkSubdomain: 'GET /api/stores/check-subdomain/:subdomain'
        }
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        mainDomain: MAIN_DOMAIN
      }
    });
  }
});

// Subdomain store API
router.get('/store', (req, res) => {
  const fullUrl = `${req.protocol}://${req.get('host') || 'unknown'}${req.originalUrl}`;
  console.log(`Processing store API: ${fullUrl}`);
  
  if (req.isSubdomainRequest && req.store) {
    res.json({
      success: true,
      message: 'Store details',
      data: {
        storeId: req.store.id,
        name: req.store.name,
        subdomain: req.store.subdomain,
        status: req.store.status,
        fullDomain: req.store.fullDomain,
        publicUrl: req.store.publicUrl,
        createdAt: req.store.createdAt.toISOString(),
        products: req.store.products || [
          { name: 'Sample Product 1', description: 'Amazing product', price: 29.99 },
          { name: 'Sample Product 2', description: 'Another great product', price: 39.99 },
          { name: 'Sample Product 3', description: 'Premium quality item', price: 49.99 }
        ]
      }
    });
  } else {
    res.status(404).json({
      success: false,
      message: `Subdomain "${req.get('host')?.split('.')[0] || 'unknown'}" not found`,
      suggestion: 'Check if the store exists and deployment is complete'
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

module.exports = { router };