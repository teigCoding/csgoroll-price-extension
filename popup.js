// Popup script for the Chrome extension
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const currencySelect = document.getElementById('currency');
  const saveKeyButton = document.getElementById('saveKey');
  const refreshButton = document.getElementById('refreshPrices');
  const clearCacheButton = document.getElementById('clearCache');
  const statusDiv = document.getElementById('status');

  // Load existing settings
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response.apiKey) {
      apiKeyInput.value = response.apiKey;
    }
    if (response.currency) {
      currencySelect.value = response.currency;
    }
  } catch (error) {
    showStatus('Error loading settings', 'error');
  }

  // Validate API key format
  function isValidApiKey(apiKey) {
    // UUID format: 8-4-4-4-12 characters
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(apiKey);
  }

  // Save settings
  saveKeyButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const currency = currencySelect.value;
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    if (!isValidApiKey(apiKey)) {
      showStatus('Invalid API key format', 'error');
      return;
    }

    try {
      saveKeyButton.disabled = true;
      saveKeyButton.textContent = 'Saving...';

      const response = await chrome.runtime.sendMessage({
        action: 'saveSettings',
        apiKey: apiKey,
        currency: currency
      });

      if (response.success) {
        showStatus('Settings saved successfully', 'success');
        
        // Auto-fetch all prices after saving
        setTimeout(async () => {
          try {
            showStatus('Fetching prices...', 'info');
            await chrome.runtime.sendMessage({ action: 'fetchAllPrices' });
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url && tab.url.includes('csgoroll.com')) {
              await chrome.tabs.reload(tab.id);
              showStatus('Prices loaded successfully', 'success');
            }
          } catch (error) {
            showStatus('Error fetching prices', 'error');
            console.error('Auto-refresh error:', error);
          }
        }, 500);
      } else {
        showStatus('Error saving settings', 'error');
      }
    } catch (error) {
      showStatus('Error saving settings', 'error');
    } finally {
      saveKeyButton.disabled = false;
      saveKeyButton.textContent = 'Save Settings';
    }
  });

  // Refresh prices
  refreshButton.addEventListener('click', async () => {
    try {
      refreshButton.disabled = true;
      refreshButton.textContent = 'Refreshing...';

      // Check if API key is set
      const settingsResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
      if (!settingsResponse.apiKey) {
        showStatus('Please set your API key first', 'error');
        return;
      }

      // Fetch all prices and refresh page
      showStatus('Fetching all prices...', 'info');
      await chrome.runtime.sendMessage({ action: 'fetchAllPrices' });

      // Refresh the CSGORoll page
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && tab.url.includes('csgoroll.com')) {
        await chrome.tabs.reload(tab.id);
        showStatus('Prices refreshed successfully', 'success');
      } else {
        showStatus('Please visit csgoroll.com first', 'info');
      }
    } catch (error) {
      console.error('Refresh error:', error);
      showStatus('Error refreshing prices: ' + error.message, 'error');
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh Prices';
    }
  });

  // Clear cache
  clearCacheButton.addEventListener('click', async () => {
    try {
      clearCacheButton.disabled = true;
      clearCacheButton.textContent = 'Clearing...';

      await chrome.runtime.sendMessage({ action: 'clearCache' });
      showStatus('Cache cleared successfully', 'success');
    } catch (error) {
      showStatus('Error clearing cache', 'error');
    } finally {
      clearCacheButton.disabled = false;
      clearCacheButton.textContent = 'Clear Cache';
    }
  });

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
});