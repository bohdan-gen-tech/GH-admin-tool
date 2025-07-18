// ==UserScript==
// @name         Get-Honey Admin Tool
// @namespace    https://github.com/bohdan-gen-tech
// @version      2025.07.18.12
// @description  Added drag and drop capability on mobile devices
// @author       Bohdan S.
// @match        https://get-honey.ai/*
// @icon         https://img.icons8.com/?size=100&id=U3kAAvzmMybK&format=png&color=000000
// @grant        GM_setValue
// @grant        GM_getValue
// @updateURL    https://raw.githubusercontent.com/bohdan-gen-tech/GH-admin-tool/main/get-honey-admin-tool.user.js
// @downloadURL  https://raw.githubusercontent.com/bohdan-gen-tech/GH-admin-tool/main/get-honey-admin-tool.user.js
// ==/UserScript==

(function () {
    'use strict';

    // --- CONFIGURATION & STATE ---

    const config = {
        storage: {
            positionKey: 'adminToolPanelPosition',
            adminTokenCacheKey: 'adminAuthTokenCache',
            collapsedKey: 'adminToolPanelCollapsed',
            currentUserKey: 'BGT-AdminTool-CurrentUser',
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
            container: '#BGT-AdminContainer',
            panelBody: '#BGT-AdminPanelBody',
            findUserBtn: '[data-action="find-user"]',
            resetBtn: '[data-action="reset"]',
            userIdInput: '#admin-tool-user-id-input',
            emailInput: '#admin-tool-email-input',
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

    let ui = { container: null };
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
        if (config.domainGroups.prod.includes(currentHost)) return { apiBase: config.api.prodApiBase, productId: config.api.prodProductId };
        if (config.domainGroups.stage.includes(currentHost)) return { apiBase: config.api.stageApiBase, productId: config.api.stageProductId };
        return { apiBase: config.api.stageApiBase, productId: config.api.stageProductId };
    }

    /**
     * Loads the current user's data from sessionStorage on script startup.
     */
    function loadPersistedUser() {
        const savedUserJSON = sessionStorage.getItem(config.storage.currentUserKey);
        if (savedUserJSON) {
            try {
                currentUser = JSON.parse(savedUserJSON);
            } catch (e) {
                console.error("Failed to parse saved user data:", e);
                sessionStorage.removeItem(config.storage.currentUserKey);
                currentUser = null;
            }
        }
    }

    /**
     * Initializes the script.
     */
    function init() {
        loadPersistedUser();
        renderPanel();
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
     * Attaches all event listeners for the panel's functionality.
     */
    function attachEventListeners() {
        if (!ui.container) return;

        ui.container.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const actions = {
                'close': () => {
                    sessionStorage.removeItem(config.storage.currentUserKey);
                    ui.container.remove();
                    ui.container = null;
                },
                'reset': () => {
                    sessionStorage.removeItem(config.storage.currentUserKey);
                    currentUser = null;
                    lastEditedField = null;
                    renderPanel();
                },
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

        ui.container.addEventListener('keydown', (e) => {
             if (e.key === 'Enter') {
                 if (e.target.matches(config.selectors.userIdInput) || e.target.matches(config.selectors.emailInput)) {
                     handleFindUser();
                 } else if (e.target.dataset.action === 'update-feature-value') {
                     handleUpdateFeatureValue(e.target, currentUser.id);
                 }
             }
        });

        ui.container.addEventListener('input', (e) => {
            const target = e.target;
            if (target.matches(config.selectors.userIdInput)) {
                lastEditedField = 'id';
                updateSearchHint();
            } else if (target.matches(config.selectors.emailInput)) {
                lastEditedField = 'email';
                updateSearchHint();
            }
        });

        document.body.addEventListener('click', (e) => {
            if (ui.container && !ui.container.contains(e.target)) {
                const openDropdowns = ui.container.querySelectorAll('.feature-dropdown');
                openDropdowns.forEach(dd => dd.style.display = 'none');
            }
        }, true);
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
        if (cachedTokenData && cachedTokenData.expiry > now) return cachedTokenData.token;

        const { apiBase } = getApiConfigForCurrentDomain();
        const loginResp = await fetch(apiBase + config.api.loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config.api.credentials),
        });
        if (!loginResp.ok) throw new Error(`Admin login failed: ${loginResp.status}`);
        const { accessToken } = await loginResp.json();
        if (!accessToken) throw new Error('No admin accessToken received');
        const expiry = now + (24 * 60 * 60 * 1000);
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
        try {
            const adminToken = await getAdminAccessToken();
            const { apiBase } = getApiConfigForCurrentDomain();
            let targetUserId = userId;
            if (!targetUserId && email) {
                messageArea.textContent = 'Resolving email to ID...';
                const idResponse = await fetch(`${apiBase}${config.api.getUserIdByEmailUrl}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
                    body: JSON.stringify({ email }),
                });
                if (!idResponse.ok) throw new Error(`Email lookup failed: ${idResponse.status}`);
                targetUserId = (await idResponse.text()).replace(/"/g, '');
                if (!targetUserId) throw new Error('Email not found.');
            }
            messageArea.textContent = `Fetching data for ID: ${targetUserId}...`;
            const featuresResponse = await fetch(`${apiBase}${config.api.getUserFeaturesUrl}?UserId=${targetUserId}`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
            if (!featuresResponse.ok) throw new Error(`User features fetch failed: ${featuresResponse.status}`);
            const featuresData = await featuresResponse.json();
            currentUser = { id: targetUserId, email: email || featuresData.Email || 'N/A', features: featuresData };

            sessionStorage.setItem(config.storage.currentUserKey, JSON.stringify(currentUser));

            renderPanel();
        } catch (err) {
            console.error(err);
            messageArea.textContent = `❌ Error: ${err.message}`;
            findButton.disabled = false;
            findButton.textContent = 'Find User';
        }
    }

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
        const body = { userId, features: { [capitalize(featureKey)]: newFeatureValue } };
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
        sessionStorage.setItem(config.storage.currentUserKey, JSON.stringify(currentUser));
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
        const dropdown = ui.container.querySelector(`#${dropdownId}`);
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            ui.container.querySelectorAll('.feature-dropdown').forEach(dd => dd.style.display = 'none');
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

        const isCurrentlyHidden = body.style.display === 'none';
        const newState = !isCurrentlyHidden;

        body.style.display = newState ? 'none' : 'block';
        button.textContent = newState ? '◻' : '–';
        button.title = newState ? 'Expand' : 'Collapse';

        GM_setValue(config.storage.collapsedKey, newState);
    }

    // --- UI & PANEL RENDERING ---

    /**
     * Renders the main panel UI, recreating it from scratch each time to ensure a clean state.
     */
    function renderPanel() {
        if (ui.container) {
            ui.container.remove();
        }

        const isCollapsed = GM_getValue(config.storage.collapsedKey, false);
        const container = document.createElement('div');
        container.id = config.selectors.container.substring(1);
        Object.assign(container.style, {
            position: 'fixed', bottom: '20px', left: '20px', width: '300px',
            fontSize: '9px', background: 'rgba(0,0,0,0.7)', color: '#fff',
            padding: '5px', zIndex: 9999, fontFamily: 'monospace',
            backdropFilter: 'blur(8px)', borderRadius: '8px', overflow: 'hidden',
            border: '1px solid #555'
        });

        const headerHTML = `
            <div data-handle="drag" style="cursor: move; font-weight: bold; user-select: none; position: relative; background: #111; padding: 4px; margin: -5px -5px 8px -5px; border-bottom: 1px solid #444;">
                Admin Tool
                <button data-action="toggle-collapse" title="${isCollapsed ? 'Expand' : 'Collapse'}" style="position: absolute; top: 1px; right: 22px; border: none; background: transparent; color: #aaa; font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1;">${isCollapsed ? '◻' : '–'}</button>
                <button data-action="close" title="Close" style="position: absolute; top: 1px; right: 4px; border: none; background: transparent; color: #aaa; font-size: 16px; cursor: pointer; padding: 0 4px;">✖</button>
            </div>`;
        const contentHTML = currentUser ? generateUserDataHTML() : generateSearchHTML();
        const panelBodyId = config.selectors.panelBody.substring(1);

        container.innerHTML = `
            <style>
              #${container.id} { font-size: 9px; }
              #${container.id} input, #${container.id} button { font-family: monospace; font-size: 9px; }
              #${container.id} .search-input { width: 100%; box-sizing: border-box; background: #222; color: white; border: 1px solid #888; border-radius: 4px; padding: 6px; font-size: 11px; }
              #${container.id} button { cursor: pointer; background-color: #444; color: white; border: 1px solid #888; border-radius: 4px; padding: 6px 8px; }
              #${container.id} button:disabled { cursor: not-allowed; background-color: #222; color: #666; }
            </style>
            ${headerHTML}
            <div id="${panelBodyId}" style="display: ${isCollapsed ? 'none' : 'block'};">
                ${contentHTML}
            </div>
        `;

        document.body.appendChild(container);
        ui.container = container;

        applySavedPosition(container);
        attachEventListeners();
        makeDraggable(container);
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

            const displayKey = key.length > 39 ? key.substring(0, 38) + '...' : key;
            const commonStyles = `display: flex; justify-content: space-between; align-items: center; margin-top: 2px;`;
            const textInputStyles = `width: 50%; height: 17px; box-sizing: border-box; background: #222; color: white; border: 1px solid #fff; border-radius: 4px; padding: 4px 6px; font-family: monospace; font-size: 9px; text-align:center;`;
            const booleanBtnStyles = `color:${value ? 'limegreen' : 'crimson'}; cursor: pointer; background-color: #444; border:none; border-radius: 4px; padding: 0 4px; font-size: 9px; font-family: monospace; line-height: 1.6; width: 40px; text-align: center;`;

            if (key === 'FeatureChatExperiment') {
                 const dropdownId = `feature-dropdown-${key}`;
                 const inputId = `feature-input-${key}`;
                 return `
                     <div style="${commonStyles}" title="${key}">
                         <span>${displayKey}:</span>
                         <div style="position: relative; display: flex; align-items: center; gap: 2px; width: 50%;">
                             <input id="${inputId}" data-action="update-feature-value" data-key="${key}" type="text" value="${value ?? ''}"
                                    style="width: 100%; height: 17px; box-sizing: border-box; background: #222; color: white; border: 1px solid #fff; border-radius: 4px; padding: 4px 6px; font-family: monospace; font-size: 9px; text-align:center;">
                             <button data-action="toggle-dropdown" data-target-dropdown="${dropdownId}"
                                     style="height: 17px; width: 18px; padding: 0; cursor: pointer; background: #555; border: 1px solid #888; border-radius: 4px; color: white;">▼</button>
                             <div id="${dropdownId}" class="feature-dropdown" data-target-input="#${inputId}"
                                  style="display: none; position: absolute; top: 100%; right: 0; background: #222; border: 1px solid #888; border-radius: 4px; z-index: 10; width: 100%;">
                                 ${config.featureChatExperimentOptions.map(option => `<div data-action="set-feature-from-dropdown" data-value="${option}" style="padding: 4px 6px; cursor: pointer;">${option.replace('test_','')}</div>`).join('')}
                             </div>
                         </div>
                     </div>`;
            } else if (typeof value === 'boolean') {
                return `<div style="${commonStyles}" title="${key}">
                            <span>${displayKey}:</span>
                            <button data-action="toggle-feature" data-key="${key}" style="${booleanBtnStyles}">${value}</button>
                        </div>`;
            } else {
                return `<div style="${commonStyles}" title="${key}">
                            <span>${displayKey}:</span>
                            <input data-action="update-feature-value" data-key="${key}" type="text" value="${value ?? ''}" style="${textInputStyles}">
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
     * @param {HTMLElement} container The draggable container element.
     */
    function makeDraggable(container) {
        const dragHandle = container.querySelector(config.selectors.dragHandle);
        if (!dragHandle) return;

        let isDragging = false;
        let offsetX, offsetY;

        // A helper function to get coordinates from either mouse or touch events
        const getCoords = (e) => {
            if (e.touches && e.touches.length) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        };

        const onDragStart = (e) => {
            isDragging = true;
            const coords = getCoords(e);
            offsetX = coords.x - container.getBoundingClientRect().left;
            offsetY = coords.y - container.getBoundingClientRect().top;

            container.style.transition = 'none';
            container.style.right = 'auto';
            container.style.bottom = 'auto';

            // Add listeners for both mouse and touch move events
            document.addEventListener('mousemove', onDragMove);
            document.addEventListener('touchmove', onDragMove, { passive: false });

            // Add listeners for both mouse and touch end events
            document.addEventListener('mouseup', onDragEnd);
            document.addEventListener('touchend', onDragEnd);
        };

        const onDragMove = (e) => {
            if (!isDragging) return;
            // Prevent the page from scrolling on mobile while dragging
            e.preventDefault();

            const coords = getCoords(e);
            container.style.left = `${coords.x - offsetX}px`;
            container.style.top = `${coords.y - offsetY}px`;
        };

        const onDragEnd = () => {
            if (!isDragging) return;
            isDragging = false;

            // Remove all move and end listeners
            document.removeEventListener('mousemove', onDragMove);
            document.removeEventListener('touchmove', onDragMove);
            document.removeEventListener('mouseup', onDragEnd);
            document.removeEventListener('touchend', onDragEnd);

            // Save the final position
            localStorage.setItem(config.storage.positionKey, JSON.stringify({ left: container.offsetLeft, top: container.offsetTop }));
        };

        // Attach the initial start listeners
        dragHandle.addEventListener('mousedown', onDragStart);
        dragHandle.addEventListener('touchstart', onDragStart, { passive: false });
    }

    // --- INITIALIZATION ---
    waitForLoad();

})();
