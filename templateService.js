const fs = require('fs');
const path = require('path');

class TemplateService {
  constructor() {
    this.templateCache = new Map();
    this.loadTemplates();
  }

  loadTemplates() {
    try {
      // Load the main store template
      const templatePath = path.join(__dirname, 'templates', 'store-template.html');
      if (fs.existsSync(templatePath)) {
        const template = fs.readFileSync(templatePath, 'utf8');
        this.templateCache.set('store', template);
        console.log('✅ Store template loaded successfully');
      } else {
        console.warn('⚠️ Store template not found, using fallback');
        this.templateCache.set('store', this.getFallbackTemplate());
      }
    } catch (error) {
      console.error('❌ Error loading templates:', error.message);
      this.templateCache.set('store', this.getFallbackTemplate());
    }
  }

  getFallbackTemplate() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{STORE_NAME}} - Online Store</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 3rem;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 600px;
        }
        h1 { color: #333; margin-bottom: 1rem; }
        .info { margin: 2rem 0; padding: 1rem; background: #f8f9fa; border-radius: 8px; }
        .products { margin-top: 2rem; }
        .product { margin: 1rem 0; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
        .status { padding: 0.5rem 1rem; border-radius: 25px; font-weight: 600; text-transform: uppercase; }
        .status.active { background: #d4edda; color: #155724; }
        .status.creating { background: #fff3cd; color: #856404; }
        .status.configuring { background: #cce5ff; color: #004085; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏪 Welcome to {{STORE_NAME}}</h1>
        <div class="info">
            <p><strong>Domain:</strong> {{FULL_DOMAIN}}</p>
            <p><strong>Status:</strong> <span class="status {{STATUS_CLASS}}">{{STATUS}}</span></p>
            <p><strong>Store ID:</strong> {{STORE_ID}}</p>
            <p><strong>Created:</strong> {{CREATED_AT}}</p>
        </div>
        <div class="products">
            <h2>Featured Products</h2>
            {{PRODUCTS}}
        </div>
        <p><a href="/store">View Store API</a></p>
    </div>
</body>
</html>`;
  }

  generateStoreHTML(store) {
    try {
      let template = this.templateCache.get('store');
      
      if (!template) {
        template = this.getFallbackTemplate();
      }

      // Generate products HTML
      const productsHTML = this.generateProductsHTML(store.products || []);
      
      // Replace template variables
      const html = template
        .replace(/{{STORE_NAME}}/g, this.escapeHtml(store.name))
        .replace(/{{FULL_DOMAIN}}/g, store.fullDomain)
        .replace(/{{STATUS}}/g, store.status.toUpperCase())
        .replace(/{{STATUS_CLASS}}/g, store.status.toLowerCase())
        .replace(/{{STORE_ID}}/g, store.id)
        .replace(/{{CREATED_AT}}/g, this.formatDate(store.createdAt))
        .replace(/{{PRODUCTS}}/g, productsHTML);

      return html;
    } catch (error) {
      console.error('Error generating store HTML:', error.message);
      return this.getErrorHTML(error.message);
    }
  }

  generateProductsHTML(products) {
    if (!products || products.length === 0) {
      return '<div class="product"><p>No products available yet.</p></div>';
    }

    return products.map(product => `
      <div class="product">
        <div class="product-name"><strong>${this.escapeHtml(product.name)}</strong></div>
        <div class="product-description">${this.escapeHtml(product.description)}</div>
        <div class="product-price"><strong>$${product.price}</strong></div>
      </div>
    `).join('');
  }

  formatDate(date) {
    if (!date) return 'Unknown';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  getErrorHTML(errorMessage) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Store Error</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
        .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="error">
        <h1>Store Error</h1>
        <p>Unable to load store template: ${this.escapeHtml(errorMessage)}</p>
    </div>
</body>
</html>`;
  }
}

module.exports = new TemplateService();