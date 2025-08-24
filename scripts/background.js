// Background script for API calls and caching
class PriceEmpireAPI {
  constructor() {
    this.baseURL = 'https://api.pricempire.com/v4/paid/items/prices';
    this.apiKey = null;
    this.currency = 'USD';
    this.requestQueue = new Map();
    this.lastRequestTime = 0;
    this.requestDelay = 1000; // 1 second between requests to avoid spamming
  }

  async getSettings() {
    const result = await chrome.storage.local.get(['apiKey', 'currency']);
    this.apiKey = result.apiKey;
    this.currency = result.currency || 'USD';
    return { apiKey: this.apiKey, currency: this.currency };
  }

  async saveSettings(apiKey, currency) {
    this.apiKey = apiKey;
    this.currency = currency;
    await chrome.storage.local.set({ apiKey, currency });
  }

  async fetchAllPrices() {
    const settings = await this.getSettings();
    if (!settings.apiKey) {
      throw new Error('API key not configured');
    }

    console.log('Fetching all prices from PriceEmpire...');
    const allPrices = await this.makeAPIRequest(null, settings.apiKey, settings.currency);
    
    // Store all prices in local storage
    const priceMap = {};
    allPrices.forEach(item => {
      const buff163Price = item.prices.find(p => p.provider_key === 'buff163');
      if (buff163Price && buff163Price.price !== null && buff163Price.price > 0) {
        priceMap[item.market_hash_name] = buff163Price.price / 100; // Convert cents to dollars
      }
    });
    
    await chrome.storage.local.set({ 
      allPrices: priceMap, 
      pricesTimestamp: Date.now() 
    });
    
    console.log('Stored', Object.keys(priceMap).length, 'prices');
    return priceMap;
  }

  async getPrice(marketHashName) {
    // Check if we have cached prices
    const result = await chrome.storage.local.get(['allPrices', 'pricesTimestamp']);
    
    if (!result.allPrices || !result.pricesTimestamp) {
      return null; // No cache available
    }
    
    // Check if cache is still valid (30 minutes)
    const cacheAge = Date.now() - result.pricesTimestamp;
    if (cacheAge > 30 * 60 * 1000) {
      return null; // Cache expired
    }
    
    return result.allPrices[marketHashName] || null;
  }

  async makeAPIRequest(marketHashName, apiKey, currency) {
    try {
      const url = new URL(this.baseURL);
      url.searchParams.set('currency', currency);
      url.searchParams.set('sources', 'buff163');
      
      // If no specific item, fetch all prices
      if (marketHashName) {
        url.searchParams.set('search', marketHashName);
      }
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`API request failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('PriceEmpire API error:', error);
      return null;
    }
  }

  async clearCache() {
    await chrome.storage.local.remove(['priceCache', 'cacheTimestamp']);
  }
}

const priceAPI = new PriceEmpireAPI();

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPrice') {
    priceAPI.getPrice(request.marketHashName)
      .then(price => sendResponse({ price }))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  }
  
  if (request.action === 'fetchAllPrices') {
    priceAPI.fetchAllPrices()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'saveSettings') {
    priceAPI.saveSettings(request.apiKey, request.currency)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'getSettings') {
    priceAPI.getSettings()
      .then(settings => sendResponse(settings))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'clearCache') {
    priceAPI.clearCache()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});