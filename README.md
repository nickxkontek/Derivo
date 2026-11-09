# Derivo

A word processor for math notes. Type equations quickly with autocomplete, keep them in `.derivo` files, and export PDFs.
Equations are typeset by Derivo's own engine (`js/math-engine.js`). It draws radicals, brackets, braces, fraction bars, arrows and accents itself as vector shapes, so the app needs no internet connection and no outside libraries.

## Try it right now
Unzip the folder and double-click **index.html**. It opens in Edge or Chrome.

## Publish it (same route as FitBench)
1. **GitHub Pages.** Make a new GitHub repository, for example `Derivo`, and upload everything in this folder. Keep the folder structure. Then go to **Settings → Pages**, set the source to the `main` branch and the root folder, and save. A minute later the app is live at `https://<your-username>.github.io/Derivo/`.
2. **Check it.** Open that address in Edge. An "Install app" icon appears in the address bar. Once installed, Derivo runs in its own window, works offline, and can open `.derivo` files.
3. **PWABuilder → Microsoft Store.** Go to pwabuilder.com, paste your GitHub Pages address, and choose **Package for stores → Windows**. Enter the values from Partner Center:
   - **App name / Package ID:** the name you reserved in Partner Center. It must match exactly.
   - **Publisher ID:** `CN=84ED90F2-E22D-4EF1-B9C2-02B917E7B859`
   - **Publisher display name:** `Nick Kontek`
   Then upload the `.msixbundle` it gives you to Partner Center.

## Windows desktop app (Setup.exe for your own website)
The same app, packaged as a normal Windows program with an installer. It adds real Save/Open dialogs, one-click PDF export, `.derivo` files that open on double-click, a File/Edit/Insert menu, spell-check suggestions on right-click, a "save changes?" prompt when closing, and automatic updates.

You don't need to install anything on your PC. GitHub builds the installer for you.

### Build the installer
1. Upload this whole folder to your `Derivo` GitHub repository, including the hidden `.github` folder. The repository must be **public** so that downloads and auto-updates work.
2. On GitHub, open the **Actions** tab, choose **Build Windows installer**, and click **Run workflow**. It takes about 5 minutes.
3. When it finishes, open **Releases** on the repository page. **Derivo-Setup.exe** is there.

### Put it on your website
Upload the three files in the `site` folder (`download.html`, `screenshot.png`, `icon-192.png`) to your website. Rename `download.html` to `index.html` if you want it as the main page.
The **Download for Windows** button links to
`https://github.com/nickxkontek/Derivo/releases/latest/download/Derivo-Setup.exe`,
which always points to the newest version, so you never have to change the page. If you'd rather host the `.exe` on your own site, upload it and change the link in `download.html`. Auto-updates keep coming from GitHub either way.

### Sign it ("certified") so Windows trusts it
Unsigned installers trigger a red "Unknown publisher" warning. Signing puts your verified name on the app. Microsoft's service for this is **Azure Artifact Signing** (formerly Trusted Signing). It costs about $9.99/month and is open to individual developers in the US.
1. Create an Azure account at portal.azure.com.
2. Create an **Artifact Signing account** (Basic plan). Note its **name** and **endpoint** (for example `https://eus.codesigning.azure.net/`).
3. In the account, open **Identity validation** and request a **Public**, **Individual** validation. Microsoft checks your ID, which can take a few business days.
4. Create a **Certificate profile** of type **Public Trust** and note its name.
5. In **Microsoft Entra ID → App registrations**, create a new app (for example "Derivo signing"). Make a **client secret** for it, and note the **Directory (tenant) ID**, the **Application (client) ID**, and the secret value.
6. Back in the Artifact Signing account, open **Access control (IAM)** and give that app the role **Artifact Signing Certificate Profile Signer**. The role may still be listed under the old name "Trusted Signing Certificate Profile Signer".
7. In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add these secrets:

| Secret | Value |
|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID from step 5 |
| `AZURE_CLIENT_ID` | Application (client) ID from step 5 |
| `AZURE_CLIENT_SECRET` | the client secret value from step 5 |
| `SIGNING_ENDPOINT` | the endpoint from step 2 |
| `SIGNING_ACCOUNT` | the Artifact Signing account name from step 2 |
| `SIGNING_CERT_PROFILE` | the certificate profile name from step 4 |
| `SIGNING_PUBLISHER_NAME` | your name exactly as validated, e.g. `Nick Kontek` |

8. Run the workflow again. The installer and the app inside it are now signed. The build turns signing on automatically whenever these secrets exist.

Even signed apps can show a SmartScreen notice for the first weeks. It disappears as more people download the app and its reputation builds.

### Release an update
1. Raise `"version"` in `package.json` (for example `1.0.0` → `1.0.1`). Also raise `APP_VERSION` in `js/app.js` and `VERSION` in `sw.js`.
2. Run **Build Windows installer** again. Installed copies download the update on their own and install it when closed. The website button automatically serves the new version.

### Optional: build or test on your own PC
Install Node.js (the LTS version from nodejs.org), then double-click **RUN-DESKTOP.bat** to try the desktop app, or **BUILD-WINDOWS.bat** to make `dist\Derivo-Setup.exe` locally.

## Shipping an update (web / Store version)
1. Change `VERSION` at the top of `sw.js`, for example to `derivo-1.0.1`.
2. Change `APP_VERSION` near the top of `js/app.js` to match.
3. Upload the changed files to GitHub. Installed copies pick up the update the next time they open, so you don't need to resubmit to the Store for normal updates.

## Files
| File | What it does |
|---|---|
| `index.html` | The window layout: toolbar, page, symbol panel, help |
| `css/app.css` | The look of the word processor |
| `js/math-engine.js` | The equation engine: typing, autocomplete, layout, drawing, LaTeX |
| `js/app.js` | The word processor: formatting, saving, opening, PDF, autosave |
| `manifest.webmanifest` | App name, icons and the `.derivo` file type, for installing |
| `sw.js` | Keeps the app working offline |
| `icons/` | App icons |
| `desktop/main.js`, `desktop/preload.js` | The Windows desktop app: window, menus, dialogs, PDF, updates |
| `package.json`, `electron-builder.config.js` | Desktop app version and installer settings (signing, file type, shortcuts) |
| `.github/workflows/windows-installer.yml` | Builds, signs and publishes Derivo-Setup.exe on GitHub |
| `build/` | Installer and `.derivo` file icons |
| `site/` | Download page for your personal website |
| `BUILD-WINDOWS.bat`, `RUN-DESKTOP.bat` | Optional: build or run the desktop app on your own PC |

## The .derivo format
Older `.mathnote` files from before the rename still open normally.

A small JSON file: `{ app, version, title, savedAt, html }`. Each equation is stored as LaTeX in a `data-latex` attribute, so notes stay readable by other tools.
