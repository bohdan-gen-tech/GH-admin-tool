// ==UserScript==
// @name         Get-Honey Admin Tool
// @namespace    https://github.com/bohdan-gen-tech
// @version      2025.07.16.1
// @description  Finds a user by ID or Email and allows editing tokens, subscription, and user features.
// @author       Bohdan S.
// @match        https://get-honey.ai/*
// @icon         https://img.icons8.com/?size=100&id=U3kAAvzmMybK&format=png&color=000000
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/bohdan-gen-tech/GH-user-parser/main/get-honey-admin-tool.user.js
// @downloadURL  https://raw.githubusercontent.com/bohdan-gen-tech/GH-user-parser/main/get-honey-admin-tool.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- CONFIGURATION & STATE ---

    const config = {
        storage: {
            positionKey: 'adminToolPanelPosition',
            adminTokenCacheKey: 'adminAuthTokenCache',
            collapsedKey: 'adminToolPanelCollapsed',
        },
        api: {
            loginUrl: '', // <-- ENTER YOUR LOGIN ENDPOINT
            getUserIdByEmailUrl: '', // <-- ENTER YOUR GET ID BY EMAIL ENDPOINT
            getUserFeaturesUrl: '', // <-- ENTER YOUR GET ALL ENDPOINT
            subscriptionUrl: '', // <-- ENTER YOUR SUBSCRIPTION ENDPOINT
            updateTokensUrl: '', // <-- ENTER YOUR TOKENS ENDPOINT
            updateUserFeaturesUrl: '', // <-- ENTER YOUR FEATURES ENDPOINT
            credentials: {
                email: "", // <-- ENTER YOUR ADMIN EMAIL
                password: "" // <-- ENTER YOUR ADMIN PASSWORD
            },
            prodProductId: '', // <-- ENTER product id to buy a subscription on prod
            stageProductId: '', // <-- ENTER product id to buy a subscription on stg
            prodApiBase: 'https://api.get-honey.ai/api',
            stageApiBase: '', // <-- ENTER stage api ur
        },
        domainGroups: {
            prod: ['get-honey.ai'],
            stage: [] // Add stage domain where domain where set subscription and tokens will be work. 
        },
        featureChatExperimentOptions: [
        // Add chatgroups values for dropdown menu 
        ],
        nonInteractiveFeatures: ['UserId'],
        selectors: {
            container: '#adminToolPanel',
            panelBody: '#admin-tool-results',
            findUserBtn: '[data-action="find-user"]',
            resetBtn: '[data-action="reset"]',
            userIdInput: '#admin-tool-user-id-input',
            emailInput: '#admin-tool-email-input',
            resultsContainer: '#admin-tool-results',
            messageArea: '#admin-tool-message-area',
            searchHint: '#admin-tool-search-hint',
            activateBtn: '[data-action="activate-sub"]',
            updateTokensBtn: '[data-action="update-tokens"]',
            tokensInput: '[data-input="tokens"]',
            toggleFeatureBtn: '[data-action="toggle-feature"]',
            updateFeatureInput: '[data-action="update-feature-value"]',
            dropdownToggle: '[data-action="toggle-dropdown"]',
            setFeatureFromDropdown: '[data-action="set-feature-from-dropdown"]',
            closeBtn: '[data-action="close"]',
            collapseBtn: '[data-action="toggle-collapse"]',
            dragHandle: '[data-handle="drag"]',
        },
    };

    let ui = { container: null, loader: null };
    let currentUser = null;
    let lastEditedField = null;

    // --- SCRIPT LOGIC & HANDLERS ---

    /**
     * Capitalizes the first letter of a string.
     * @param {string} s The input string.
     * @returns {string} The capitalized string.
     */
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    /**
     * Determines the correct API endpoint and product ID based on the current domain.
     * @returns {{apiBase: string, productId: string}} The API configuration for the current environment.
     */
    function getApiConfigForCurrentDomain() {
        const currentHost = window.location.hostname.replace(/^www\./, '');
        if (config.domainGroups.prod.includes(currentHost)) {
            return { apiBase: config.api.prodApiBase, productId: config.api.prodProductId };
        } else if (config.domainGroups.stage.includes(currentHost)) {
            return { apiBase: config.api.stageApiBase, productId: config.api.stageProductId };
        }
        return { apiBase: config.api.stageApiBase, productId: config.api.stageProductId };
    }

    /**
     * Initializes the script by rendering the panel and attaching event listeners.
     */
    function init() {
        hideLoader();
        renderPanel();
        attachEventListeners();
        makeDraggable();
    }

    /**
     * Waits for the page to be fully loaded before executing the main script logic.
     */
    function waitForLoad() {
        if (document.readyState === 'complete') {
            setTimeout(init, 1500);
        } else {
            window.addEventListener('load', () => setTimeout(init, 1500));
        }
    }

    /**
     * Attaches all global event listeners for the panel's functionality.
     */
    function attachEventListeners() {
        document.body.addEventListener('click', (e) => {
            if (!ui.container) return;
            const target = e.target.closest('[data-action]');
            if (!ui.container.contains(e.target)) {
                const openDropdowns = ui.container.querySelectorAll('.feature-dropdown');
                openDropdowns.forEach(dd => dd.style.display = 'none');
            }
            if (!target || !ui.container.contains(target)) return;

            const action = target.dataset.action;
            const actions = {
                'close': () => { ui.container.remove(); ui.container = null; },
                'reset': () => { currentUser = null; lastEditedField = null; renderPanel(); },
                'find-user': () => handleFindUser(),
                'activate-sub': () => handleSubscriptionActivation(target, currentUser.id),
                'update-tokens': () => handleUpdateTokens(target, currentUser.id),
                'toggle-feature': () => handleToggleFeature(target, currentUser.id),
                'toggle-dropdown': () => handleToggleDropdown(target),
                'set-feature-from-dropdown': () => handleSetFeatureFromDropdown(target),
                'toggle-collapse': () => handleToggleCollapse(target),
            };
            actions[action]?.();
        });

        document.body.addEventListener('keydown', (e) => {
             if (!ui.container) return;
             if (e.key === 'Enter') {
                 if (e.target.matches(config.selectors.userIdInput) || e.target.matches(config.selectors.emailInput)) {
                     handleFindUser();
                 } else if (e.target.dataset.action === 'update-feature-value') {
                     handleUpdateFeatureValue(e.target, currentUser.id);
                 }
             }
        });

        document.body.addEventListener('input', (e) => {
            if (!ui.container) return;
            const target = e.target;
            if (target.matches(config.selectors.userIdInput)) {
                lastEditedField = 'id';
                updateSearchHint();
            } else if (target.matches(config.selectors.emailInput)) {
                lastEditedField = 'email';
                updateSearchHint();
            }
        });
    }

    /**
     * Displays a hint indicating which search field will be used if both are filled.
     */
    function updateSearchHint() {
        const hintArea = ui.container.querySelector(config.selectors.searchHint);
        if (!hintArea) return;
        const userIdValue = ui.container.querySelector(config.selectors.userIdInput).value.trim();
        const emailValue = ui.container.querySelector(config.selectors.emailInput).value.trim();
        if (userIdValue && emailValue) {
            hintArea.textContent = lastEditedField === 'id' ? 'ℹ️ Search will use User ID' : 'ℹ️ Search will use Email';
            hintArea.style.display = 'block';
        } else {
            hintArea.style.display = 'none';
        }
    }

    /**
     * Retrieves a cached admin access token or fetches a new one if expired.
     * @returns {Promise<string>} The admin access token.
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
        if (!loginResp.ok) throw new Error(`Admin login failed: ${loginResp.status}`);
        const { accessToken } = await loginResp.json();
        if (!accessToken) throw new Error('No admin accessToken received');
        const expiry = now + (24 * 60 * 60 * 1000); // 24-hour expiry
        GM_setValue(config.storage.adminTokenCacheKey, { token: accessToken, expiry });
        return accessToken;
    }

    /**
     * Handles the user search logic, fetching user data by ID or Email.
     */
    async function handleFindUser() {
        const userIdInput = ui.container.querySelector(config.selectors.userIdInput);
        const emailInput = ui.container.querySelector(config.selectors.emailInput);
        const messageArea = ui.container.querySelector(config.selectors.messageArea);
        const findButton = ui.container.querySelector(config.selectors.findUserBtn);

        let userId = userIdInput.value.trim();
        let email = emailInput.value.trim();

        if (userId && email) {
            if (lastEditedField === 'id') email = '';
            else userId = '';
        }

        if (!userId && !email) {
            messageArea.textContent = 'Please enter a User ID or an Email.';
            return;
        }

        findButton.disabled = true;
        findButton.textContent = '⏳ Finding...';
        messageArea.textContent = '';
        let targetUserId = userId;
        let originalEmail = email;

        try {
            const adminToken = await getAdminAccessToken();
            const { apiBase } = getApiConfigForCurrentDomain();

            if (!targetUserId && email) {
                messageArea.textContent = 'Resolving email to ID...';
                const idResponse = await fetch(apiBase + config.api.getUserIdByEmailUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                    body: JSON.stringify({ email }),
                });
                if (!idResponse.ok) throw new Error(`Email lookup failed: ${idResponse.status}`);
                targetUserId = (await idResponse.text()).replace(/"/g, '');
                if (!targetUserId) throw new Error('Email not found.');
            }

            messageArea.textContent = `Fetching data for ID: ${targetUserId}...`;
            const featuresResponse = await fetch(`${apiBase}${config.api.getUserFeaturesUrl}?UserId=${targetUserId}`, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            if (!featuresResponse.ok) throw new Error(`User features fetch failed: ${featuresResponse.status}`);
            const featuresData = await featuresResponse.json();

            currentUser = {
                id: targetUserId,
                email: originalEmail || featuresData.Email || 'N/A',
                features: featuresData,
            };
            renderPanel();

        } catch (err) {
            console.error(err);
            messageArea.textContent = `❌ Error: ${err.message}`;
            findButton.disabled = false;
            findButton.textContent = 'Find User';
        }
    }


    // --- FEATURE/SUBSCRIPTION/TOKEN HANDLERS ---

    /**
     * Grants a one-month free subscription to the specified user.
     * @param {HTMLElement} button The clicked button element.
     * @param {string} userId The ID of the user.
     */
    async function handleSubscriptionActivation(button, userId) {
        button.disabled = true;
        button.textContent = '⏳';
        try {
            const { apiBase, productId } = getApiConfigForCurrentDomain();
            const accessToken = await getAdminAccessToken();
            if (!productId) throw new Error('Unsupported domain');
            await fetch(apiBase + config.api.subscriptionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({ userId, productId }),
            });
            button.style.backgroundColor = 'limegreen';
            button.textContent = '✅ Activated!';
        } catch (err) {
            button.style.backgroundColor = 'crimson';
            button.textContent = `❌ ${err.message}`;
            console.error(err);
        }
    }

    /**
     * Updates the token balance for the specified user.
     * @param {HTMLElement} button The clicked button element.
     * @param {string} userId The ID of the user.
     */
    async function handleUpdateTokens(button, userId) {
        const input = ui.container.querySelector(config.selectors.tokensInput);
        const amount = parseInt(input.value, 10);
        if (isNaN(amount) || amount < 0) return;
        button.disabled = true;
        input.disabled = true;
        button.textContent = '⏳';
        try {
            const { apiBase } = getApiConfigForCurrentDomain();
            const accessToken = await getAdminAccessToken();
            await fetch(apiBase + config.api.updateTokensUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify({ userId, amount }),
            });
            button.style.backgroundColor = 'limegreen';
            button.textContent = '✅ Updated!';
        } catch (err) {
            button.style.backgroundColor = 'crimson';
            button.textContent = '❌ Error';
            console.error(err);
        } finally {
            setTimeout(() => {
                button.disabled = false;
                input.disabled = false;
                button.textContent = 'Update';
                button.style.backgroundColor = '#444';
            }, 2000);
        }
    }

    /**
     * Sends a request to update a user's feature flags.
     * @param {string} userId The ID of the user.
     * @param {string} featureKey The key of the feature to update.
     * @param {any} newFeatureValue The new value for the feature.
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
        currentUser.features[featureKey] = newFeatureValue;
    }

    /**
     * Toggles a boolean user feature on or off.
     * @param {HTMLElement} button The clicked button element.
     * @param {string} userId The ID of the user.
     */
    async function handleToggleFeature(button, userId) {
        const key = button.dataset.key;
        const currentValue = currentUser.features[key];
        const newValue = !currentValue;
        button.disabled = true;
        button.textContent = '⏳';
        try {
            await handleUpdateUserFeature(userId, key, newValue);
            button.textContent = String(newValue);
            button.style.color = newValue ? 'limegreen' : 'crimson';
        } catch (err) {
            button.textContent = '❌';
            button.title = err.message;
            console.error(err);
        } finally {
            button.disabled = false;
        }
    }

    /**
     * Updates a user feature with a value from an input field.
     * @param {HTMLElement} input The input element.
     * @param {string} userId The ID of the user.
     */
    async function handleUpdateFeatureValue(input, userId) {
        const key = input.dataset.key;
        let newValue = input.value;
        const originalBorder = input.style.border;
        input.disabled = true;
        input.style.border = '1px solid #ff0';
        try {
            if (typeof currentUser.features[key] === 'number') {
                newValue = Number(newValue);
                if (isNaN(newValue)) throw new Error("Invalid number format");
            }
            await handleUpdateUserFeature(userId, key, newValue);
            input.style.border = '1px solid limegreen';
        } catch (err) {
            input.style.border = '1px solid crimson';
            console.error(err);
        } finally {
            input.disabled = false;
            setTimeout(() => input.style.border = originalBorder, 2000);
        }
    }

    /**
     * Toggles the visibility of a feature's dropdown menu.
     * @param {HTMLElement} button The clicked dropdown toggle button.
     */
    function handleToggleDropdown(button) {
        const dropdownId = button.dataset.targetDropdown;
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            // Close all other dropdowns first
            ui.container.querySelectorAll('.feature-dropdown').forEach(dd => dd.style.display = 'none');
            // Then toggle the current one
            dropdown.style.display = isVisible ? 'none' : 'block';
        }
    }

    /**
     * Sets the value of an input field from a dropdown selection.
     * @param {HTMLElement} optionElement The clicked dropdown option element.
     */
    function handleSetFeatureFromDropdown(optionElement) {
        const newValue = optionElement.dataset.value;
        const dropdown = optionElement.closest('.feature-dropdown');
        if (!dropdown) return;

        const inputSelector = dropdown.dataset.targetInput;
        const inputElement = ui.container.querySelector(inputSelector);

        if (inputElement) {
            inputElement.value = newValue;
            inputElement.focus();
        }

        dropdown.style.display = 'none';
    }

    /**
     * Collapses or expands the panel body.
     * @param {HTMLElement} button The clicked collapse/expand button.
     */
    function handleToggleCollapse(button) {
        const body = ui.container.querySelector(config.selectors.panelBody);
        if (!body) return;

        const isCurrentlyCollapsed = body.style.display === 'none';
        if (isCurrentlyCollapsed) {
            body.style.display = 'block';
            button.innerHTML = '–';
            button.title = 'Collapse';
            GM_setValue(config.storage.collapsedKey, false);
        } else {
            body.style.display = 'none';
            button.innerHTML = '◻';
            button.title = 'Expand';
            GM_setValue(config.storage.collapsedKey, true);
        }
    }

    // --- UI & PANEL RENDERING ---

    /**
     * Displays a loading indicator on the screen.
     */
    function showLoader() {
        if (ui.loader) return;
        ui.loader = document.createElement('div');
        ui.loader.textContent = '⏳ Loading data...';
        Object.assign(ui.loader.style, {
            position: 'fixed', bottom: '20px', left: '20px', padding: '8px 12px',
            background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '10px',
            fontFamily: 'monospace', borderRadius: '9px', zIndex: 9999, backdropFilter: 'blur(4px)',
        });
        document.body.appendChild(ui.loader);
    }

    /**
     * Hides the loading indicator.
     */
    function hideLoader() {
        if (ui.loader) {
            ui.loader.remove();
            ui.loader = null;
        }
    }

    /**
     * Renders the main panel UI, either the search view or the user data view.
     */
    function renderPanel() {
        const isFirstRender = !ui.container;

        if (isFirstRender) {
            ui.container = document.createElement('div');
            ui.container.id = config.selectors.container.substring(1);
            Object.assign(ui.container.style, {
                position: 'fixed', bottom: '20px', left: '20px', width: '300px',
                fontSize: '9px', background: 'rgba(0,0,0,0.7)', color: '#fff',
                padding: '5px', zIndex: 9999, fontFamily: 'monospace',
                backdropFilter: 'blur(8px)', borderRadius: '8px', overflow: 'hidden',
                border: '1px solid #555'
            });
            document.body.appendChild(ui.container);
        }

        const headerHTML = `
            <div data-handle="drag" style="cursor: move; font-weight: bold; user-select: none; position: relative; background: #111; padding: 4px; margin: -5px -5px 8px -5px; border-bottom: 1px solid #444;">
                Admin User Tool
                <button data-action="toggle-collapse" title="Collapse" style="position: absolute; top: 1px; right: 22px; border: none; background: transparent; color: #aaa; font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1;">–</button>
                <button data-action="close" title="Close" style="position: absolute; top: 1px; right: 4px; border: none; background: transparent; color: #aaa; font-size: 16px; cursor: pointer; padding: 0 4px;">✖</button>
            </div>`;
        const contentHTML = currentUser ? generateUserDataHTML() : generateSearchHTML();

        ui.container.innerHTML = `
            <style>
              #${ui.container.id} { font-size: 9px; }
              #${ui.container.id} input, #${ui.container.id} button { font-family: monospace; font-size: 9px; }
              #${ui.container.id} .search-input { width: 100%; box-sizing: border-box; background: #222; color: white; border: 1px solid #888; border-radius: 4px; padding: 6px; font-size: 11px; }
              #${ui.container.id} button { cursor: pointer; background-color: #444; color: white; border: 1px solid #888; border-radius: 4px; padding: 6px 8px; }
              #${ui.container.id} button:disabled { cursor: not-allowed; background-color: #222; color: #666; }
              #${ui.container.id} .feature-dropdown > div:hover { background-color: #555; }
              #${ui.container.id} .search-btn { background-color: #3e6a94; font-size: 11px; }
            </style>
            ${headerHTML}
            <div id="${config.selectors.resultsContainer.substring(1)}">${contentHTML}</div>
        `;
        if (isFirstRender) {
            applySavedPosition(ui.container);
        }

        const isCollapsed = GM_getValue(config.storage.collapsedKey, false);
        if (isCollapsed) {
            const body = ui.container.querySelector(config.selectors.panelBody);
            const btn = ui.container.querySelector(config.selectors.collapseBtn);
            if (body) body.style.display = 'none';
            if (btn) {
                btn.innerHTML = '◻';
                btn.title = 'Expand';
            }
        }
    }

    /**
     * Generates the HTML content for the initial search view.
     * @returns {string} The HTML string for the search form.
     */
    function generateSearchHTML() {
        return `
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div>
                    <label for="admin-tool-user-id-input" style="font-size: 11px;">User ID:</label>
                    <input id="admin-tool-user-id-input" type="text" class="search-input" placeholder="Enter User ID...">
                </div>
                <div>
                    <label for="admin-tool-email-input" style="font-size: 11px;">or Email:</label>
                    <input id="admin-tool-email-input" type="email" class="search-input" placeholder="Enter user's email...">
                </div>
                <div id="admin-tool-search-hint" style="color: #ffcc00; text-align: center; display: none; margin-top: -4px; margin-bottom: 4px;"></div>
                <button data-action="find-user" class="search-btn">Find User</button>
                <div id="admin-tool-message-area" style="color: #ffcc00; min-height: 1.2em; text-align: center; margin-top: 4px;"></div>
            </div>`;
    }

    /**
     * Generates the HTML content for the user data view.
     * @returns {string} The HTML string for the user data display.
     */
    function generateUserDataHTML() {
        const { id, email, features } = currentUser;
        const featureEntries = Object.entries(features).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

        const featuresHTML = featureEntries.map(([key, value]) => {
            if (config.nonInteractiveFeatures.includes(key)) return '';

            const displayKey = key.length > 35 ? key.substring(0, 34) + '...' : key;
            const commonStyles = `display: flex; justify-content: space-between; align-items: center; margin-top: 2px;`;
            const textInputStyles = `height: 17px; box-sizing: border-box; background: #222; color: white; border-radius: 4px; padding: 4px 6px; text-align:center; border: 1px solid #fff;`;
            const booleanBtnStyles = `width: 27.5%; height: 17px; box-sizing: border-box; background-color: #444; border-radius: 4px; border: none; padding: 0; line-height: 1.6;`;

            if (key === 'FeatureChatExperiment') {
                 const dropdownId = `feature-dropdown-${key}`;
                 const inputId = `feature-input-${key}`;
                 return `
                     <div style="${commonStyles}" title="${key}">
                         <span>${displayKey}:</span>
                         <div style="width: 55%; display: flex; align-items: center; position: relative;">
                             <button data-action="toggle-dropdown" data-target-dropdown="${dropdownId}"
                                     title="Select a value"
                                     style="height: 17px; box-sizing: border-box; background-color: #444; color: white; border: 1px solid #fff; border-right: none; border-radius: 4px 0 0 4px; padding: 0 4px; cursor: pointer; flex-shrink: 0;">
                                 ▼
                             </button>
                             <input id="${inputId}" data-action="update-feature-value" data-key="${key}" type="text" value="${value ?? ''}"
                                    style="height: 17px; box-sizing: border-box; background: #222; color: white; border: 1px solid #fff; padding: 4px 6px; width: 100%; border-radius: 0 4px 4px 0; text-align: left;">
                             <div id="${dropdownId}" class="feature-dropdown" data-target-input="#${inputId}"
                                  style="display: none; position: absolute; top: 18px; left: 0; background: #333; border: 1px solid #888; border-radius: 4px; z-index: 10; width: 100%; max-height: 150px; overflow-y: auto;">
                                 ${config.featureChatExperimentOptions.map(option => `
                                     <div data-action="set-feature-from-dropdown" data-value="${option}" style="padding: 4px 8px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                         ${option.replace(/test_|_/g, ' ')}
                                     </div>
                                 `).join('')}
                             </div>
                         </div>
                     </div>`;
            } else if (typeof value === 'boolean') {
                return `<div style="${commonStyles}" title="${key}">
                            <span>${displayKey}:</span>
                            <button data-action="toggle-feature" data-key="${key}" style="${booleanBtnStyles} color:${value ? 'limegreen' : 'crimson'};">${value}</button>
                        </div>`;
            } else {
                return `<div style="${commonStyles}" title="${key}">
                            <span>${displayKey}:</span>
                            <input data-action="update-feature-value" data-key="${key}" type="text" value="${value ?? ''}" style="${textInputStyles} width: 55%;">
                        </div>`;
            }
        }).join('');

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                    <b>ID:</b> <span style="color: #0ff; user-select: text;">${id}</span><br>
                    <b>Email:</b> <span style="user-select: text;">${email}</span>
                </div>
                <button data-action="reset" title="Find another user">🔄 Reset</button>
            </div>
            <div style="background: #2a2a2a; padding: 8px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
                 <button data-action="activate-sub">Grant 1-Month Subscription</button>
                 <div style="display: flex; gap: 5px; align-items: center;">
                    <input data-input="tokens" type="number" placeholder="New token balance" style="width: 100%; text-align:center; height: 17px; background: #222; color: white; border: 1px solid #fff; border-radius: 4px; padding: 4px 6px;">
                    <button data-action="update-tokens" style="white-space: nowrap;">Update</button>
                 </div>
            </div>
            <div style="max-height: 250px; overflow-y: auto; padding-right: 5px;">
                <b>🔧 User Features:</b>
                ${featuresHTML}
            </div>
        `;
    }

    // --- DRAGGING & POSITIONING ---

    /**
     * Applies the saved panel position from localStorage.
     * @param {HTMLElement} container The panel element to position.
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
     * Makes the panel draggable by its header.
     */
    function makeDraggable() {
        let isDragging = false;
        let offsetX, offsetY;

        const onMouseMove = (e) => {
            if (!isDragging) return;
            ui.container.style.left = `${e.clientX - offsetX}px`;
            ui.container.style.top = `${e.clientY - offsetY}px`;
            ui.container.style.right = 'auto';
            ui.container.style.bottom = 'auto';
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            localStorage.setItem(config.storage.positionKey, JSON.stringify({
                left: ui.container.offsetLeft,
                top: ui.container.offsetTop,
            }));
        };

        const onMouseDown = (e) => {
            if (!ui.container || !e.target.matches(config.selectors.dragHandle)) return;

            isDragging = true;
            offsetX = e.clientX - ui.container.getBoundingClientRect().left;
            offsetY = e.clientY - ui.container.getBoundingClientRect().top;
            ui.container.style.transition = 'none';
            e.preventDefault();

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };

        document.removeEventListener('mousedown', onMouseDown);
        document.addEventListener('mousedown', onMouseDown);
    }

    // --- INITIALIZATION ---
    showLoader();
    waitForLoad();

})();