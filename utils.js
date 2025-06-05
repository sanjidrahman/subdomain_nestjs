const crypto = require('crypto');

function generateUniqueSubdomain(storeName) {
  const baseKey = storeName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 15);
  
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  return `${baseKey}-${randomSuffix}`;
}

function validateSubdomain(subdomain) {
  const subdomainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  const reservedSubdomains = ['www', 'api', 'admin', 'mail'];
  
  const isValid = subdomainRegex.test(subdomain) && 
                  subdomain.length >= 3 && 
                  subdomain.length <= 63 &&
                  !reservedSubdomains.includes(subdomain);
  
  return { isValid };
}

module.exports = { generateUniqueSubdomain, validateSubdomain };