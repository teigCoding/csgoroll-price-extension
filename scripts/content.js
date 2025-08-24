// Content script for CSGORoll price checker extension
class PriceChecker {
  constructor() {
    this.priceCache = new Map();
    this.init();
  }

  async init() {
    await this.loadCache();
    this.observeItemCards();
    this.processExistingItems();
  }

  async loadCache() {
    const result = await chrome.storage.local.get(['priceCache', 'cacheTimestamp']);
    if (result.priceCache && result.cacheTimestamp) {
      const cacheAge = Date.now() - result.cacheTimestamp;
      if (cacheAge < 30 * 60 * 1000) { // 30 minutes cache
        this.priceCache = new Map(Object.entries(result.priceCache));
      }
    }
  }

  observeItemCards() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const itemCards = node.querySelectorAll('.item-card.selectable');
            itemCards.forEach(card => this.processItemCard(card));
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  processExistingItems() {
    const itemCards = document.querySelectorAll('.item-card.selectable');
    itemCards.forEach(card => this.processItemCard(card));
  }

  async processItemCard(itemCard) {
    if (itemCard.dataset.priceCheckerProcessed) return;
    itemCard.dataset.priceCheckerProcessed = 'true';

    const itemName = this.extractItemName(itemCard);
    if (!itemName) return;

    const currentPrice = this.extractCurrentPrice(itemCard);
    if (!currentPrice) return;

    const marketHashName = this.buildMarketHashName(itemCard, itemName);
    const priceEmpirePrice = await this.getPriceFromCache(marketHashName);
    
    if (priceEmpirePrice) {
      await this.displayPriceComparison(itemCard, currentPrice, priceEmpirePrice);
    }
  }

  extractItemName(itemCard) {
    const nameElement = itemCard.querySelector('[data-test="item-name"]');
    const subcategoryElement = itemCard.querySelector('[data-test="item-subcategory"]');
    
    if (!nameElement || !subcategoryElement) return null;
    
    const name = nameElement.textContent.trim();
    const subcategory = subcategoryElement.textContent.trim();
    
    // Handle all Doppler phases and special variants
    const isDopplerPhase = name.match(/^(Emerald|Ruby|Sapphire|Black Pearl|Doppler Phase [1-4]|Gamma Doppler Phase [1-4])$/);
    
    if (isDopplerPhase) {
      // For Emerald, use Gamma Doppler
      if (name === 'Emerald') {
        return `${subcategory} | Gamma Doppler`;
      }
      // For Gamma Doppler phases, use Gamma Doppler
      if (name.startsWith('Gamma Doppler Phase')) {
        return `${subcategory} | Gamma Doppler`;
      }
      // For all others, use regular Doppler
      return `${subcategory} | Doppler`;
    }
    
    return `${subcategory} | ${name}`;
  }

  extractCurrentPrice(itemCard) {
    const priceElement = itemCard.querySelector('cw-pretty-balance [data-test="value"]');
    if (!priceElement) {
      const altPrice = itemCard.querySelector('.currency-value') || 
                     itemCard.querySelector('cw-pretty-balance span');
      if (altPrice) {
        const priceText = altPrice.textContent.trim().replace(/,/g, '');
        return parseFloat(priceText);
      }
      return null;
    }
    
    const priceText = priceElement.textContent.trim().replace(/,/g, '');
    return parseFloat(priceText);
  }

  buildMarketHashName(itemCard, itemName) {
    const nameElement = itemCard.querySelector('[data-test="item-name"]');
    const originalName = nameElement ? nameElement.textContent.trim() : '';
    
    const wearElement = itemCard.querySelector('.wear-bar');
    let wear = 'Factory New'; // default
    
    if (wearElement) {
      if (wearElement.classList.contains('wear-bar-mw')) wear = 'Minimal Wear';
      else if (wearElement.classList.contains('wear-bar-ft')) wear = 'Field-Tested';
      else if (wearElement.classList.contains('wear-bar-ww')) wear = 'Well-Worn';
      else if (wearElement.classList.contains('wear-bar-bs')) wear = 'Battle-Scarred';
    }
    
    // Handle Doppler phases - need to include phase in market hash name
    const isDopplerPhase = originalName.match(/^(Emerald|Ruby|Sapphire|Black Pearl|Doppler Phase [1-4]|Gamma Doppler Phase [1-4])$/);
    
    if (isDopplerPhase) {
      // Extract just the phase part for the suffix
      if (originalName.startsWith('Doppler Phase')) {
        const phaseNumber = originalName.replace('Doppler Phase ', 'Phase ');
        return `${itemName} (${wear}) - ${phaseNumber}`;
      } else if (originalName.startsWith('Gamma Doppler Phase')) {
        const phaseNumber = originalName.replace('Gamma Doppler Phase ', 'Phase ');
        return `${itemName} (${wear}) - ${phaseNumber}`;
      } else {
        return `${itemName} (${wear}) - ${originalName}`;
      }
    }
    
    return `${itemName} (${wear})`;
  }

  async getPriceFromCache(marketHashName) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getPrice',
        marketHashName: marketHashName
      });
      return response.price;
    } catch (error) {
      return null;
    }
  }

  async displayPriceComparison(itemCard, csgoRollPrice, priceEmpirePrice) {
    const existingIndicator = itemCard.querySelector('.price-comparison-indicator');
    if (existingIndicator) return;

    // Get currency setting
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const currency = response.currency || 'USD';
    
    const currencySymbols = {
      'USD': '$',
      'EUR': '€',
      'NOK': 'kr',
      'SEK': 'kr',
      'GBP': '£',
      'CAD': '$',
      'AUD': '$'
    };
    
    const symbol = currencySymbols[currency] || '$';
    const pricePerCoin = priceEmpirePrice / csgoRollPrice;
    
    const indicator = document.createElement('div');
    indicator.className = 'price-comparison-indicator';
    indicator.innerHTML = `<div class="price-per-coin">${symbol}${pricePerCoin.toFixed(2)}</div>`;
    
    // Color coding based on price per coin value
    if (pricePerCoin < 0.01) {
      indicator.classList.add('underpriced');
    } else if (pricePerCoin > 0.1) {
      indicator.classList.add('overpriced');
    } else {
      indicator.classList.add('fair');
    }

    itemCard.style.position = 'relative';
    itemCard.appendChild(indicator);
  }

  async saveCache() {
    await chrome.storage.local.set({
      priceCache: Object.fromEntries(this.priceCache),
      cacheTimestamp: Date.now()
    });
  }

  async refreshPrices() {
    this.priceCache.clear();
    await chrome.storage.local.remove(['priceCache', 'cacheTimestamp']);
    
    const indicators = document.querySelectorAll('.price-comparison-indicator');
    indicators.forEach(indicator => indicator.remove());
    
    const itemCards = document.querySelectorAll('.item-card.selectable');
    itemCards.forEach(card => {
      delete card.dataset.priceCheckerProcessed;
      this.processItemCard(card);
    });
  }
}

// Listen for refresh message from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'refreshPrices') {
    if (window.priceChecker) {
      window.priceChecker.refreshPrices();
    }
    sendResponse({success: true});
  }
});

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.priceChecker = new PriceChecker();
  });
} else {
  window.priceChecker = new PriceChecker();
}