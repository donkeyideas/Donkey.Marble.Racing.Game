/**
 * Plugin: adds `use_modular_headers!` to the iOS Podfile.
 *
 * Required by @react-native-firebase/auth (and other Firebase Swift pods) so
 * Objective-C consumers can `#import <FirebaseAuth/FirebaseAuth-Swift.h>`. The
 * directive is inserted before `platform :ios` so it applies globally.
 *
 * This is the minimal, proven config we had before the static-frameworks
 * experiment. Keep it small — no post_install merging, no use_frameworks!
 * dance, no Swift-bridging workarounds. The Firebase pods we still depend on
 * (app, auth, analytics) compile cleanly with just this.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // Clean up any leftover post_install or standalone blocks from prior
      // experiments. Idempotent: safe to run on a Podfile that's already clean.
      podfile = podfile.replace(
        /# --- begin withModularHeaders post_install \(Firebase compat\) ---[\s\S]*?# --- end withModularHeaders post_install ---\s*/g,
        '',
      );
      podfile = podfile.replace(
        /\s*# --- withModularHeaders: non-modular includes ---\n\s*installer\.pods_project\.targets\.each do \|target\|[\s\S]*?config\.build_settings\['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'\] = 'YES'[\s\S]*?end\s*end\s*end\n/g,
        '\n',
      );

      // Inject use_modular_headers! once, before platform :ios.
      if (!podfile.includes('use_modular_headers!')) {
        podfile = podfile.replace(
          /platform :ios/,
          'use_modular_headers!\nplatform :ios',
        );
      }

      fs.writeFileSync(podfilePath, podfile);
      return config;
    },
  ]);
};
