/**
 * Plugin: configure the iOS Podfile for react-native-firebase + static frameworks.
 *
 *   1. Adds `use_modular_headers!` at the top, so all pods expose modular headers.
 *   2. Injects into the existing `post_install` hook:
 *        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
 *      on every Pods target. Without this, RNFBApp (built as a framework module
 *      because we use_frameworks! :linkage => :static) can't include
 *      <React/RCTBridgeModule.h> or <React/RCTConvert.h>, and the build dies with:
 *        "include of non-modular header inside framework module".
 *
 * CocoaPods only permits a single `post_install` block per Podfile, so we MUST
 * merge into the existing one (added by Expo's prebuild) rather than append.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const INJECTED_MARKER = '# --- withModularHeaders: non-modular includes ---';

const INJECTED_BLOCK = `  ${INJECTED_MARKER}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
    end
  end
`;

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

      // 2. Clean up any standalone post_install block previously appended by an
      //    older version of this plugin (idempotency for in-place rebuilds).
      podfile = podfile.replace(
        /# --- begin withModularHeaders post_install \(Firebase compat\) ---[\s\S]*?# --- end withModularHeaders post_install ---\s*/g,
        '',
      );

      // 3. Inject our settings INTO the existing `post_install do |installer|` block.
      //    The block is added by Expo's prebuild template. CocoaPods rejects more
      //    than one post_install per Podfile, so we merge instead of append.
      if (!podfile.includes(INJECTED_MARKER)) {
        const postInstallRegex = /(post_install do \|installer\|\s*\n)/;
        if (postInstallRegex.test(podfile)) {
          podfile = podfile.replace(postInstallRegex, `$1${INJECTED_BLOCK}`);
        } else {
          // No existing post_install block — create one.
          podfile = podfile.trimEnd()
            + `\n\npost_install do |installer|\n${INJECTED_BLOCK}end\n`;
        }
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
