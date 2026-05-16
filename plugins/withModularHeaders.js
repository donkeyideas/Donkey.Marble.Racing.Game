/**
 * Plugin: configure the iOS Podfile for react-native-firebase + static frameworks.
 *
 * Adds two things to the Podfile:
 *   1. `use_modular_headers!` at the top, so all pods expose modular headers.
 *   2. A post_install hook that sets CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES=YES
 *      on every Pods target. Without this, RNFBApp (built as a framework module
 *      because we use_frameworks! :linkage => :static) can't include
 *      <React/RCTBridgeModule.h> or <React/RCTConvert.h>, and the build dies with:
 *        "include of non-modular header inside framework module".
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const POST_INSTALL_MARKER = '# --- begin withModularHeaders post_install (Firebase compat) ---';
const POST_INSTALL_END = '# --- end withModularHeaders post_install ---';

const POST_INSTALL_BLOCK = `
${POST_INSTALL_MARKER}
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
    end
  end
end
${POST_INSTALL_END}
`.trimStart();

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // 1. Inject `use_modular_headers!` near the top (before `platform :ios`).
      if (!podfile.includes('use_modular_headers!')) {
        podfile = podfile.replace(
          /platform :ios/,
          'use_modular_headers!\nplatform :ios',
        );
      }

      // 2. Append the post_install hook (idempotent — skip if already present).
      if (!podfile.includes(POST_INSTALL_MARKER)) {
        podfile = podfile.trimEnd() + '\n\n' + POST_INSTALL_BLOCK + '\n';
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
