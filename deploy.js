const axios = require('axios');
const { stores } = require('./store');
const dotenv = require('dotenv');

dotenv.config();

const MAIN_DOMAIN = process.env.MAIN_DOMAIN || 'myoutlet.app';
const SERVER_IP = process.env.SERVER_IP || '1.2.3.4';
const DNS_PROVIDER = process.env.DNS_PROVIDER || 'manual';

async function createCloudflareRecord(subdomain) {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const fullDomain = `${subdomain}.${MAIN_DOMAIN}`;

  if (!zoneId || !apiToken) {
    console.log('⚠️ Cloudflare credentials not configured, simulating DNS record creation...');
    return { 
      success: true, 
      recordId: 'simulated', 
      provider: 'simulation',
      message: `Simulated DNS record for ${fullDomain} → ${SERVER_IP}`
    };
  }

  try {
    // First check if record already exists
    const existingRecords = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${fullDomain}`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (existingRecords.data.result.length > 0) {
      const existingRecord = existingRecords.data.result[0];
      console.log(`📋 DNS record already exists: ${fullDomain} → ${existingRecord.content}`);
      return {
        success: true,
        recordId: existingRecord.id,
        provider: 'cloudflare',
        existing: true
      };
    }

    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        type: 'A',
        name: fullDomain,
        content: SERVER_IP,
        ttl: 300,
        proxied: false
      },
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Cloudflare DNS record created: ${fullDomain} → ${SERVER_IP}`);
    return {
      success: true,
      recordId: response.data.result.id,
      provider: 'cloudflare'
    };

  } catch (error) {
    console.error('❌ Cloudflare DNS creation failed:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.message,
      details: error.response?.data
    };
  }
}

async function deployStore(storeId, subdomain) {
  const fullDomain = `${subdomain}.${MAIN_DOMAIN}`;
  console.log(`🚀 Starting deployment for ${fullDomain}`);
  
  try {
    const store = stores.get(storeId);
    if (!store) {
      throw new Error(`Store ${storeId} not found`);
    }
    
    store.status = 'configuring';
    store.deploymentStarted = new Date();
    store.deploymentLogs = [];
    
    // Step 1: DNS Configuration
    console.log('🌐 Creating DNS record...');
    store.deploymentLogs.push('Creating DNS record...');
    
    if (DNS_PROVIDER === 'cloudflare') {
      const dnsResult = await createCloudflareRecord(subdomain);
      if (!dnsResult.success) {
        throw new Error(`DNS creation failed: ${dnsResult.error}`);
      }
      store.dnsRecordId = dnsResult.recordId;
      store.deploymentLogs.push(`DNS record created: ${dnsResult.recordId}`);
    } else {
      console.log(`📝 Manual DNS Setup Required:`);
      console.log(`   Add A record: ${fullDomain} → ${SERVER_IP}`);
      store.deploymentLogs.push(`Manual DNS setup required: ${fullDomain} → ${SERVER_IP}`);
    }
    
    // Update store status
    store.status = 'active';
    store.deploymentCompleted = new Date();
    store.publicUrl = `http://${fullDomain}`;
    
    const deploymentTime = Math.round((store.deploymentCompleted - store.deploymentStarted) / 1000);
    
    console.log(`✅ Deployment completed in ${deploymentTime}s! Store is live at: ${store.publicUrl}`);
    
    return { 
      success: true, 
      url: store.publicUrl,
      deploymentTime
    };
    
  } catch (error) {
    console.error(`❌ Deployment failed for ${fullDomain}:`, error.message);
    
    const store = stores.get(storeId);
    if (store) {
      store.status = 'failed';
      store.errorMessage = error.message;
      store.deploymentFailed = new Date();
      store.deploymentLogs = store.deploymentLogs || [];
      store.deploymentLogs.push(`Deployment failed: ${error.message}`);
    }
    
    throw error;
  }
}

module.exports = { 
  createCloudflareRecord, 
  deployStore
};