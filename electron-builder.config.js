/*
 * Settings for building the Windows installer (Derivo-Setup.exe).
 * Signing turns on automatically when the Azure Artifact Signing values are present
 * (GitHub repository secrets, or environment variables on your PC). Without them,
 * an unsigned installer is built, which is fine for testing.
 */
const sign = !!(process.env.AZURE_CLIENT_ID && process.env.SIGNING_ENDPOINT);

module.exports = {
  appId: 'com.nickkontek.derivo',
  productName: 'Derivo',
  copyright: 'Copyright © 2026 Nick Kontek',
  directories: { output: 'dist', buildResources: 'build' },
  files: ['index.html', 'css/**', 'js/**', 'icons/**', 'desktop/**', 'package.json'],
  fileAssociations: [
    { ext: 'derivo', name: 'DerivoDocument', description: 'Derivo document', role: 'Editor' },
    { ext: 'mathnote', name: 'DerivoLegacyDocument', description: 'Derivo document (older format name)', role: 'Editor' }
  ],
  win: Object.assign({
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico'
  }, sign ? {
    azureSignOptions: {
      publisherName: process.env.SIGNING_PUBLISHER_NAME,      // exactly as on your certificate, e.g. "Nick Kontek"
      endpoint: process.env.SIGNING_ENDPOINT,                 // e.g. https://eus.codesigning.azure.net/
      codeSigningAccountName: process.env.SIGNING_ACCOUNT,    // your Artifact Signing account name
      certificateProfileName: process.env.SIGNING_CERT_PROFILE
    }
  } : {}),
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Derivo',
    uninstallDisplayName: 'Derivo',
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    artifactName: 'Derivo-Setup.exe',
    deleteAppDataOnUninstall: false
  },
  publish: [{ provider: 'github', owner: 'nickxkontek', repo: 'Derivo', releaseType: 'release' }]
};
