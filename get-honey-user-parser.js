// ==UserScript==
// @name         Get-Honey User Parser from LocalStorage
// @namespace    https://github.com/bohdan-gen-tech
// @version      2025.07.13.8
// @description  Shows decoded user info from localStorage persist:user on get-honey domains and update user features
// @author       Bohdan S.
// @match        https://get-honey.ai/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=get-honey.ai
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/bohdan-gen-tech/GH-user-parser/main/get-honey-user-parser.js
// @downloadURL  https://raw.githubusercontent.com/bohdan-gen-tech/GH-user-parser/main/get-honey-user-parser.js
// ==/UserScript==

(function () {
  'use strict';

  // --- CONFIGURATION & STATE ---

  const config = {
    storage: {
      userKey: 'persist:user',
      authKey: 'persist:auth',
      positionKey: 'userInfoPanelPosition',
      adminTokenCacheKey: 'adminAuthTokenCache',
    },
    api: {
      loginUrl: '',
      subscriptionUrl: '',
      updateTokensUrl: '',
      updateUserFeaturesUrl: '',
      deleteUserUrl: '/User',
      credentials: {
        email: "",
        password: ""
      },
      prodProductId: '',
      stageProductId: '',
      prodApiBase: 'https://api.get-honey.ai/api',
      stageApiBase: '',
    },
    domainGroups: {
      prod: [
      'get-honey.ai'
      ],
      stage: [
      ]
    },
    readOnlyDomains: [
    ],
    featureChatExperimentOptions: [
    ],
    nonInteractiveFeatures: [
        'hasConfirmedAge',
        'isRomanceModeActive',
        'isTUser',
        'nEnabled'
    ],

    checkInterval: 1000,
    selectors: {
      container: '#userInfoPanel',
      copyIdBtn: '[data-action="copy-id"]',
      copyIdIcon: '[data-icon="copy-id"]',
      activateBtn: '[data-action="activate-sub"]',
      updateTokensBtn: '[data-action="update-tokens"]',
      tokensInput: '[data-input="tokens"]',
      clearBtn: '[data-action="clear-data"]',
      closeBtn: '[data-action="close"]',
      dragHandle: '[data-handle="drag"]',
      toggleFeatureBtn: '[data-action="toggle-feature"]',
      updateFeatureInput: '[data-action="update-feature-value"]',
      dropdownToggle: '[data-action="toggle-dropdown"]',
      presetValue: '[data-action="set-preset-value"]',
      deleteUserBtn: '[data-action="delete-user"]',
    },
  };

  /**
   * Global state variables for the script.
   */
  let lastPersistUser = null;
  let ui = {
    container: null,
    loader: null,
  };


  // --- SCRIPT LOGIC & HANDLERS ---

  /**
   * Capitalizes the first letter of a string.
   * @param {string} s The string to capitalize.
   * @returns {string}
   */
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /**
   * Gets API config (apiBase, productId) based on the current domain.
   * @returns {{apiBase: string, productId: string}}
   */
  function getApiConfigForCurrentDomain() {
    const currentHost = window.location.hostname.replace(/^www\./, '');
    if (config.domainGroups.prod.includes(currentHost)) {
      return { apiBase: config.api.prodApiBase, productId: config.api.prodProductId };
    } else if (config.domainGroups.stage.includes(currentHost)) {
      return { apiBase: config.api.stageApiBase, productId: config.api.stageProductId };
    }
    console.error(`Unsupported domain: ${currentHost}.`);
    return { apiBase: config.api.stageApiBase, productId: config.api.stageProductId };
  }

  /**
   * Kicks off the main interval to check for user data changes.
   */
  function main() {
    setInterval(() => {
      const raw = localStorage.getItem(config.storage.userKey);
      if (!raw || raw === lastPersistUser) return;
      lastPersistUser = raw;
      try {
        const outer = JSON.parse(raw);
        if (!outer.user || outer.user === 'null') {
          if (ui.container) ui.container.remove();
          return;
        };
        const inner = JSON.parse(outer.user);
        renderPanel({ ...inner });
      } catch (err) {
        console.warn('❌ Error parsing persist:user:', err);
        hideLoader();
      }
    }, config.checkInterval);
  }

  /**
   * Waits for the page to be fully loaded before starting.
   */
  function waitForLoad() {
    if (document.readyState === 'complete') {
      setTimeout(main, 1500);
    } else {
      window.addEventListener('load', () => setTimeout(main, 1500));
    }
  }

  /**
   * Attaches all event listeners for the panel.
   * @param {HTMLElement} container - The panel's container element.
   * @param {object} user - The user data object.
   */
  function attachEventListeners(container, user) {
    container.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (!action) return;
      const actions = {
        'close': () => container.remove(),
        'copy-id': () => handleCopy(e.target, user.id),
        'clear-data': () => handleClearData(e.target),
        'activate-sub': () => handleSubscriptionActivation(e.target, user.id),
        'update-tokens': () => handleUpdateTokens(e.target, user.id),
        'toggle-feature': () => handleToggleFeature(e.target, user.id),
        'toggle-dropdown': () => handleToggleDropdown(e.target),
        'set-preset-value': () => handleSetPresetValue(e.target),
        'delete-user': () => handleDeleteUser(e.target, user.id),
      };
      actions[action]?.(e);
    });

    container.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.dataset.action === 'update-feature-value') {
            handleUpdateFeatureValue(e.target, user.id);
        }
    });

    document.addEventListener('click', (e) => {
        if (ui.container && !ui.container.contains(e.target)) {
            const openDropdowns = ui.container.querySelectorAll('.feature-dropdown');
            openDropdowns.forEach(dd => {
              dd.style.display = 'none';
            });
        }
    });
  }

  /**
   * Fetches an admin access token, using a 24-hour cache via GM_setValue/GM_getValue.
   * @returns {Promise<string>} The access token.
   */
  async function getAdminAccessToken() {
    const cachedTokenData = GM_getValue(config.storage.adminTokenCacheKey, null);
    const now = new Date().getTime();
    if (cachedTokenData && cachedTokenData.expiry > now) {
      return cachedTokenData.token;
    }
    const { apiBase } = getApiConfigForCurrentDomain();
    const loginResp = await fetch(apiBase + config.api.loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config.api.credentials),
    });
    if (!loginResp.ok) {
      const errorText = await loginResp.text();
      throw new Error(`admin login failed: ${loginResp.status} ${errorText}`);
    }
    const { accessToken } = await loginResp.json();
    if (!accessToken) throw new Error('No accessToken received');
    const expiry = now + (24 * 60 * 60 * 1000);
    GM_setValue(config.storage.adminTokenCacheKey, { token: accessToken, expiry });
    return accessToken;
  }

  /**
   * Gets the current user's access token from localStorage.
   * @returns {string|null} The user's access token or null if not found.
   */
  function getUserAccessToken() {
      const rawAuth = localStorage.getItem(config.storage.authKey);
      if (!rawAuth) {
          throw new Error('User auth data not found in localStorage.');
      }
      const authData = JSON.parse(rawAuth);
      if (!authData.accessToken) {
          throw new Error('User accessToken not found in auth data.');
      }
      return JSON.parse(authData.accessToken);
  }

  /**
   * Toggles the visibility of a custom dropdown menu.
   * @param {HTMLElement} button - The dropdown toggle button.
   */
  function handleToggleDropdown(button) {
      const dropdownId = button.dataset.targetDropdown;
      const dropdown = document.getElementById(dropdownId);
      if (dropdown) {
          const isVisible = dropdown.style.display === 'block';
          dropdown.style.display = isVisible ? 'none' : 'block';
      }
  }

  /**
   * Sets the value of an input field based on a dropdown selection.
   * @param {HTMLElement} optionElement - The clicked option element in the dropdown.
   */
  function handleSetPresetValue(optionElement) {
      const targetInputId = optionElement.dataset.targetInput;
      const value = optionElement.dataset.value;
      const input = document.getElementById(targetInputId);
      const dropdown = optionElement.closest('.feature-dropdown');
      if (input) {
          input.value = value;
          input.focus();
      }
      if (dropdown) {
          dropdown.style.display = 'none';
      }
  }

  /**
   * Generic handler to send the user feature update PUT request.
   * @param {string} userId - The user's ID.
   * @param {string} featureKey - The key of the feature to update.
   * @param {any} newFeatureValue - The new value for the feature.
   */
  async function handleUpdateUserFeature(userId, featureKey, newFeatureValue) {
      const { apiBase } = getApiConfigForCurrentDomain();
      const accessToken = await getAdminAccessToken();
      const body = {
          userId,
          features: { [capitalize(featureKey)]: newFeatureValue }
      };
      const response = await fetch(apiBase + config.api.updateUserFeaturesUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify(body),
      });
      if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`${response.status}: ${errorBody}`);
      }
  }

  /**
   * Handles toggling a boolean user feature.
   * @param {HTMLElement} button - The clicked toggle button.
   * @param {string} userId - The user's ID.
   */
  async function handleToggleFeature(button, userId) {
      const key = button.dataset.key;
      const currentValue = button.textContent.trim() === 'true';
      const newValue = !currentValue;
      button.disabled = true;
      button.textContent = '⏳';
      try {
          await handleUpdateUserFeature(userId, key, newValue);
          button.style.backgroundColor = 'limegreen';
          button.style.color = 'black';
          button.textContent = '✅';
          setTimeout(() => window.location.reload(), 500);
      } catch (err) {
          button.style.backgroundColor = 'crimson';
          button.style.color = 'white';
          button.textContent = '❌';
          button.title = err.message;
          console.error(err);
          setTimeout(() => {
              button.disabled = false;
              button.textContent = String(currentValue);
              button.title = '';
              button.style.backgroundColor = '#444';
              button.style.color = 'white';
          }, 3000);
      }
  }

  /**
   * Handles updating a string/number user feature.
   * @param {HTMLElement} input - The input element.
   * @param {string} userId - The user's ID.
   */
  async function handleUpdateFeatureValue(input, userId) {
      const key = input.dataset.key;
      const newValue = input.value;
      const originalValue = input.defaultValue;
      const originalBorder = input.style.border;
      input.disabled = true;
      input.style.border = '1px solid #ff0';
      try {
          await handleUpdateUserFeature(userId, key, newValue);
          input.style.border = '1px solid limegreen';
          setTimeout(() => window.location.reload(), 500);
      } catch(err) {
          input.style.border = '1px solid crimson';
          input.value = err.message;
          console.error(err);
          setTimeout(() => {
              input.disabled = false;
              input.value = originalValue;
              input.style.border = originalBorder;
          }, 3000);
      }
  }

  /**
   * Handles updating user token balance.
   * @param {HTMLElement} button - The clicked button.
   * @param {string} userId - The user's ID.
   */
  async function handleUpdateTokens(button, userId) {
    const input = ui.container.querySelector(config.selectors.tokensInput);
    const amount = parseInt(input.value, 10);
    if (isNaN(amount) || amount < 0) {
      input.style.border = '1px solid crimson';
      return;
    }
    input.style.border = '1px solid #555';
    button.disabled = true;
    input.disabled = true;
    button.textContent = '⏳';
    try {
      const { apiBase } = getApiConfigForCurrentDomain();
      const accessToken = await getAdminAccessToken();
      const response = await fetch(apiBase + config.api.updateTokensUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ userId, amount }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`${response.status}: ${errorBody}`);
      }
      button.style.backgroundColor = 'limegreen';
      button.style.color = 'black';
      button.textContent = '✅';
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      button.style.backgroundColor = 'crimson';
      button.style.color = 'white';
      button.textContent = `🤦‍♂️`;
      console.error(err);
      input.value = err.message;
      setTimeout(() => {
        button.style.backgroundColor = '#333';
        button.style.color = '#fff';
        button.textContent = '🔄';
        button.disabled = false;
        input.disabled = false;
        input.value = '';
      }, 2000);
    }
  }

  /**
   * Handles activating a free subscription.
   * @param {HTMLElement} button - The clicked button.
   * @param {string} userId - The user's ID.
   */
  async function handleSubscriptionActivation(button, userId) {
    button.disabled = true;
    button.textContent = '⏳';
    button.style.backgroundColor = '#666';
    try {
      const { apiBase, productId } = getApiConfigForCurrentDomain();
      const accessToken = await getAdminAccessToken();
      if (!productId) throw new Error('Unsupported domain');
      const activateResp = await fetch(apiBase + config.api.subscriptionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ userId, productId }),
      });
      if (!activateResp.ok) throw new Error(`sub failed: ${activateResp.status}`);
      button.style.backgroundColor = 'limegreen';
      button.style.color = 'black';
      button.textContent = '🎉';
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      button.style.backgroundColor = 'crimson';
      button.style.color = 'white';
      button.textContent = `🤦‍♂️ ${err.message}`;
      console.error(err);
      setTimeout(() => {
        button.style.backgroundColor = '#444';
        button.style.color = '#fff';
        button.textContent = 'activate 1 month?';
        button.disabled = false;
      }, 5000);
    }
  }

  /**
   * Handles copying text to the clipboard.
   * @param {HTMLElement} target - The clicked element.
   * @param {string} text - The text to copy.
   */
  async function handleCopy(target, text) {
    const icon = ui.container.querySelector(config.selectors.copyIdIcon);
    try {
      await navigator.clipboard.writeText(text);
      target.style.backgroundColor = 'limegreen';
      icon.textContent = '✅ user: ';
    } catch (err) {
      target.style.backgroundColor = 'crimson';
      icon.textContent = '❌ user: ';
      console.error("Copy failed:", err);
    } finally {
      setTimeout(() => {
        target.style.backgroundColor = '#444';
        icon.textContent = '🆔 user: ';
      }, 1000);
    }
  }

  /**
   * Handles deleting the current user.
   * @param {HTMLElement} button - The clicked button.
   * @param {string} userId - The user's ID.
   */
  async function handleDeleteUser(button, userId) {
    if (!window.confirm('Are you sure you want to permanently delete this user? This cannot be undone.')) {
        return;
    }

    const originalContent = button.innerHTML;
    button.disabled = true;
    button.textContent = '⏳';
    try {
      const { apiBase } = getApiConfigForCurrentDomain();
      const accessToken = getUserAccessToken();

      const response = await fetch(apiBase + config.api.deleteUserUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`${response.status}: ${errorBody}`);
      }

      button.style.backgroundColor = 'limegreen';
      button.innerHTML = '✅';

      try {
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(cookie => {
            const eqPos = cookie.indexOf("=");
            const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        });
      } catch (e) {
        console.error('Error clearing site data after user deletion:', e);
      } finally {
        setTimeout(() => window.location.reload(), 500);
      }

    } catch (err) {
      button.style.backgroundColor = 'crimson';
      button.innerHTML = '❌';
      button.title = err.message;
      console.error(err);
      setTimeout(() => {
        button.disabled = false;
        button.innerHTML = originalContent;
        button.title = 'Delete this user';
        button.style.backgroundColor = 'transparent';
      }, 3000);
    }
  }

  /**
   * Handles clearing all site data.
   * @param {HTMLElement} button - The clicked button.
   */
  function handleClearData(button) {
    const currentHost = window.location.hostname.replace(/^www\./, '');
    const allDomains = [...config.domainGroups.prod, ...config.domainGroups.stage];
    if (!allDomains.includes(currentHost)) {
      button.style.background = 'crimson';
      button.textContent = '❌ Invalid domain!';
      setTimeout(() => {
        button.style.background = '#333';
        button.textContent = '🧹 Clear';
      }, 1500);
      return;
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie.split(";").forEach(cookie => {
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
      button.style.background = 'limegreen';
      button.textContent = '✅ Cleared!';
    } catch (e) {
      console.error('Error clearing data:', e);
      button.style.background = 'crimson';
      button.textContent = '❌ Error!';
    } finally {
      setTimeout(() => window.location.reload(), 800);
    }
  }


  // --- UI & PANEL RENDERING ---

  /**
   * Renders the main user info panel.
   * @param {object} user - The user data object.
   */
  function renderPanel(user) {
    hideLoader();
    if (ui.container) ui.container.remove();

    const {
      id, email, utmSource, url, isTUser, userFeatures, nEnabled, activeSubscription
    } = user;

    const currentHost = window.location.hostname.replace(/^www\./, '');
    const isReadOnly = config.readOnlyDomains.includes(currentHost);

    let displayUrl = url;
    if (url && url.length > 77) {
      displayUrl = url.substring(0, 77) + '...';
    }

    const container = document.createElement('div');
    container.id = config.selectors.container.substring(1);
    Object.assign(container.style, {
      position: 'fixed', bottom: '20px', right: '20px', width: '280px',
      fontSize: '9px', background: 'rgba(0,0,0,0.5)', color: '#fff',
      padding: '3px 3px 3px', zIndex: 9999, fontFamily: 'monospace',
      backdropFilter: 'blur(5px)', borderRadius: '8px', overflow: 'hidden',
    });

    /**
     * Helper to render a non-interactive, right-aligned, colored row.
     * @param {string} label - The text label for the row.
     * @param {any} value - The value to display.
     * @returns {string} HTML string for the row.
     */
    const renderNonInteractiveRow = (label, value) => {
        const color = value === true ? 'limegreen' : (value === false ? 'crimson' : 'white');
        return `<div style="display: flex; justify-content: space-between; margin-top: 2px; color: ${color};"><span>${label}</span><b>${String(value)}</b></div>`;
    };

    const updatableFeatures = userFeatures ? Object.entries(userFeatures)
        .filter(([key]) => !config.nonInteractiveFeatures.includes(key)) : [];

    const updatableFeaturesHTML = updatableFeatures.length > 0 ? `
      <div style="margin: 10px 0 0px 0;"><b>🔧 Updatable userFeatures:</b></div>
      ${updatableFeatures.map(([key, value]) => {
        const displayKey = key.length > 37 ? key.substring(0, 36) + '...' : key;
        const commonStyles = `display: flex; justify-content: space-between; align-items: center; margin-top: 2px;`;

        if (key === 'featureChatExperiment') {
            const inputId = `feature-input-${key}`;
            const dropdownId = `feature-dropdown-${key}`;
            return `
                <div style="${commonStyles}">
                    <span>${displayKey}:</span>
                    <div style="position: relative; display: flex; align-items: center; gap: 2px; width: 50%;">
                        <input id="${inputId}" data-action="update-feature-value" data-key="${key}" type="text" value="${value}" style="width: 100%; height: 17px; box-sizing: border-box; background: #222; color: white; border: 1px solid #fff; border-radius: 4px; padding: 4px 6px; font-family: monospace; font-size: 9px; text-align:center;">
                        <button data-action="toggle-dropdown" data-target-dropdown="${dropdownId}" style="height: 17px; width: 18px; padding: 0; cursor: pointer; background: #555; border: 1px solid #888; border-radius: 4px; color: white;">▼</button>
                        <div id="${dropdownId}" class="feature-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: #222; border: 1px solid #888; border-radius: 4px; z-index: 10; width: 100%;">
                            ${config.featureChatExperimentOptions.map(option => `
                                <div data-action="set-preset-value" data-value="${option}" data-target-input="${inputId}" style="padding: 4px 6px; cursor: pointer;">${option.replace('test_','')}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        } else if (typeof value === 'boolean') {
            return `<div style="${commonStyles}"><span>${displayKey}:</span><button data-action="toggle-feature" data-key="${key}" style="color:${value ? 'limegreen' : 'crimson'}; cursor: pointer; background-color: #444; border:none; border-radius: 4px; padding: 0 4px; font-size: 9px; font-family: monospace; line-height: 1.6;">${value}</button></div>`;
        } else {
            return `<div style="${commonStyles}"><span>${displayKey}:</span><input data-action="update-feature-value" data-key="${key}" type="text" value="${value}" style="width: 50%; height: 17px; box-sizing: border-box; background: #222; color: white; border: 1px solid #fff; border-radius: 4px; padding: 4px 6px; font-family: monospace; font-size: 9px; text-align:center;"></div>`;
        }
      }).join('')}
    ` : '';

    const subscriptionHTML = activeSubscription ? `
      <div style="margin-top: 8px"><b>💳 Subscription:</b></div>
      <div>priceID: ${activeSubscription.productId}</div>
      <div>endDate: ${activeSubscription.endDate}</div>
      <div>status: ${activeSubscription.status}</div>
      ${isReadOnly ? '' : `
        <div style="margin-top: 8px; display: flex; gap: 5px; align-items: center;">
          <input data-input="tokens" type="number" placeholder="SET NEW TOKEN AMOUNT" style="width: 100%; height: 17px; width: 189px; box-sizing: border-box; background: #222; color: white; border: 1px solid #fff; border-radius: 4px; padding: 4px 6px; font-family: monospace; font-size: 9px;text-align:center;">
          <button data-action="update-tokens" style="cursor: pointer; height: 17px; width: 58px; background: #333; color: #fff; font-weight: regular; border: none; border-radius: 4px; padding: 1px 1px; font-size: 9px; font-family: monospace; text-align:center; white-space: nowrap;">
            🔄 Update
          </button>
        </div>
      `}
    ` : `
      <div style="margin-top: 8px; user-select: text;">
        <span>💳 unsubscribed! </span>
        ${isReadOnly ? '' : `
          <button data-action="activate-sub" title="Click to activate monthly subscription" style="color: #0ff; cursor: pointer; background-color: #444; border-radius: 4px; padding: 0 4px; font-size: 9px; font-family: monospace; line-height: 1.6;">
          activate 1 month?
          </button>
        `}
      </div>
    `;

    container.innerHTML = `
      <style>
        #${container.id} input[type=number]::-webkit-outer-spin-button,
        #${container.id} input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        #${container.id} input[type=number] { -moz-appearance: textfield; }
        #${container.id} input::placeholder { font-size: 8px; color: #888; }
        #${container.id} .feature-dropdown > div:hover { background-color: #444; }
      </style>
      <div data-handle="drag" style="cursor: move; font-weight: bold; margin-bottom: 8px; margin-left: -2px; margin-right: -2px; margin-top: -2px; user-select: none; position: relative; background: black; padding: 4px 4px 3px; border-radius: 2px;">
        User Info Panel
        <button data-action="close" title="Close" style="position: absolute; top: 0; right: 0; border: none; background: transparent; color: #fff; font-size: 14px; cursor: pointer; padding: 0 4px;">✖</button>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <div>
            <span data-icon="copy-id">🆔 user: </span>
            <span data-action="copy-id" title="Click to copy user.id" style="color: #0ff; cursor: pointer; background-color: #444; padding: 2px 4px; border-radius: 4px; user-select: text;">
            ${id}
            </span>
        </div>
        <button data-action="delete-user" title="Delete this user" style="background: transparent; border: none; cursor: pointer; font-size: 14px; color: #fff; padding: 0 4px;">☠️</button>
      </div>
      <div style="margin-bottom: 6px;">📩 email: ${email || '-'}</div>

      ${subscriptionHTML}

      <div style="margin-top: 8px;">🌐 utmSource: <b style="color: ${user.utmSource || '-' !== '-' ? 'white' : '#888'}">${user.utmSource || '-'}</b></div>
      <div style="display: flex; align-items: baseline; line-height: 1.3;">
        <span style="white-space: nowrap; flex-shrink: 0;">🔗 url:&nbsp;</span>
        <b style="color: ${user.url || '-' !== '-' ? 'white' : '#888'}; word-break: break-all;">${displayUrl || '-'}</b>
      </div>

      ${renderNonInteractiveRow('🧩 isTUser:', isTUser)}
      ${user.hasOwnProperty('nEnabled') ? renderNonInteractiveRow('🔞 nEnabled:', nEnabled) : ''}
      ${userFeatures && userFeatures.hasConfirmedAge !== undefined ? renderNonInteractiveRow('hasConfirmedAge:', userFeatures.hasConfirmedAge) : ''}
      ${userFeatures && userFeatures.isRomanceModeActive !== undefined ? renderNonInteractiveRow('isRomanceModeActive:', userFeatures.isRomanceModeActive) : ''}

      ${updatableFeaturesHTML}

      <button data-action="clear-data" style="margin-top: 10px; padding: 5px 10px; border-radius: 6px; border: none; background: #333; color: #fff; cursor: pointer; font-size: 9px; width: 100%;">
        🧹 Clear site data
      </button>
    `;

    document.body.appendChild(container);
    ui.container = container;
    makeDraggable(container);
    attachEventListeners(container, user);
    applySavedPosition(container);
  }

  /**
   * Creates and displays the initial loading indicator.
   */
  function showLoader() {
    if (ui.container) ui.container.remove();
    if (!ui.loader) {
      ui.loader = document.createElement('div');
      ui.loader.textContent = '⏳ Loading data...';
      Object.assign(ui.loader.style, {
        position: 'fixed', bottom: '20px', right: '20px', padding: '8px 12px',
        background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '10px',
        fontFamily: 'monospace', borderRadius: '9px', zIndex: 9999, backdropFilter: 'blur(4px)',
      });
      document.body.appendChild(ui.loader);
    }
  }

  /**
   * Removes the loading indicator from the DOM.
   */
  function hideLoader() {
    if (ui.loader) {
      ui.loader.remove();
      ui.loader = null;
    }
  }

    // --- DRAGGING & POSITIONING ---

  /**
   * Applies the saved position to the container.
   * @param {HTMLElement} container - The element to position.
   */
  function applySavedPosition(container) {
      const savedPos = localStorage.getItem(config.storage.positionKey);
      if (savedPos) {
          try {
              const pos = JSON.parse(savedPos);
              container.style.left = `${pos.left}px`;
              container.style.top = `${pos.top}px`;
              container.style.right = 'auto';
              container.style.bottom = 'auto';
          } catch {}
      }
  }

  /**
   * Makes an element draggable.
   * @param {HTMLElement} container - The draggable container element.
   */
  function makeDraggable(container) {
    const dragHandle = container.querySelector(config.selectors.dragHandle);
    let isDragging = false;
    let offsetX, offsetY;

    const onMouseDown = (e) => {
        isDragging = true;
        offsetX = e.clientX - container.getBoundingClientRect().left;
        offsetY = e.clientY - container.getBoundingClientRect().top;
        container.style.transition = 'none';
        e.preventDefault();
    };

    const onMouseMove = (e) => {
        if (isDragging) {
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        }
    };

    const onMouseUp = () => {
        if (isDragging) {
            isDragging = false;
            localStorage.setItem(config.storage.positionKey, JSON.stringify({
                left: container.offsetLeft,
                top: container.offsetTop,
            }));
        }
    };

    dragHandle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // --- INITIALIZATION ---

  showLoader();
  waitForLoad();

})();