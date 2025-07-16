# Get-Honey Admin Tool

Tampermonkey userscript to find and manage users on the Get-Honey platform via an on-screen administrative panel.

![panel-screenshot]([https://i.imgur.com/uR13r4m.png](https://img.icons8.com/?size=100&id=U3kAAvzmMybK&format=png&color=000000))

## ✅ Features

- **Find any user** on the platform by their User ID or Email address.
- **Grant a 1-month subscription** with a single click.
- **Update user token balance**.
- **Modify `userFeatures`** with interactive controls (toggles, inputs, dropdowns).
- **Reset view** to easily search for another user.
- Fully **draggable, closable, and collapsible** overlay panel.
- Automatically **saves panel position** and state across reloads.

## 🔗 Installation & Configuration

Follow these steps carefully. The script requires configuration after installation to work correctly.

### Step 1. Install Tampermonkey
First, install the [Tampermonkey extension](https://www.tampermonkey.net/) for your browser (e.g., Chrome, Firefox, Safari).

### Step 2. Install the Script
Click the link below. Tampermonkey will open a new tab and ask you to confirm the installation.

- **[Install "Get-Honey Admin User Finder"](https://raw.githubusercontent.com/bohdan-gen-tech/GH-admin-tool/main/get-honey-admin-tool.user.js)**

### Step 3. Configure the Script
After installation, you must configure the script with project-specific settings.

1.  Open the Tampermonkey Dashboard from your browser's extension menu.
2.  Find **"Get-Honey Admin Tool"** in the list and click the **edit icon**.
3.  In the script editor, find the `// --- CONFIGURATION & STATE ---` section. You will need to modify the `config` object.

#### API Settings, Credentials, and Product IDs
You must fill in your admin credentials and verify that the API endpoints and Product IDs match your project's configuration.

```javascript
// ...
    api: {
        loginUrl: '', // Enter endpoint for login
        getUserIdByEmailUrl: '', // Enter endpoint for get user by id
        // ... other endpoints
        credentials: {
            email: "YOUR_ADMIN_EMAIL_HERE",          // <-- SET YOUR ADMIN EMAIL
            password: "YOUR_ADMIN_PASSWORD_HERE"       // <-- SET YOUR ADMIN PASSWORD
        },
        prodProductId: 'YOUR_PRODUCTION_PRODUCT_ID', // <-- SET PRODUCTION PRODUCT ID
        stageProductId: 'YOUR_STAGE_PRODUCT_ID',    // <-- SET STAGE PRODUCT ID
        prodApiBase: '[https://api.get-honey.ai/api](https://api.get-honey.ai/api)',    
        stageApiBase: '['')', // <-- VERIFY STAGE API URL
    },
// ...
Dropdown Menu Options
You can customize the preset values that appear in the dropdown for the FeatureChatExperiment field.

// ...
    featureChatExperimentOptions: [
    // <-- You can change or add values here
    ],
// ...

After making all necessary changes, press Ctrl+S (or Cmd+S on Mac) to save the script. It is now fully configured and ready to use.
