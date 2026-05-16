/**
 * Plugin: configure the iOS Podfile for @react-native-firebase/auth (Swift).
 *
 * Two minimal directives, both before `platform :ios`:
 *
 *   $RNFirebaseAsStaticFramework = true   →  makes react-native-firebase Pods
 *     install as static_framework. Generates the FirebaseAuth-Swift.h bridge
 *     header where Firebase.h's umbrella import expects it, fixing:
 *       'FirebaseAuth/FirebaseAuth-Swift.h' file not found
 *     (RN-Firebase v22+ on Xcode 16+ runs into this because FirebaseAuth was
 *     rewritten in Swift but the Pods/Headers layout is C-style by default.)
 *     This is the react-native-firebase–specific scope — does NOT switch
 *     every Pod to static frameworks the way useFrameworks: 'static' did.
 *
 *   use_modular_headers!                  →  allows Objective-C Firebase glue
 *     to import each Swift Pod's module headers without case-by-case Podfile
 *     directives. Required by FirebaseAuth's downstream consumers.
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

      // Idempotency: clean up artifacts from any prior version of this plugin.
      podfile = podfile.replace(
        /# --- begin withModularHeaders post_install \(Firebase compat\) ---[\s\S]*?# --- end withModularHeaders post_install ---\s*/g,
        '',
      );
      podfile = podfile.replace(
        /\s*# --- withModularHeaders: non-modular includes ---\n\s*installer\.pods_project\.targets\.each do \|target\|[\s\S]*?config\.build_settings\['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'\] = 'YES'[\s\S]*?end\s*end\s*end\n/g,
        '\n',
      );

      // Insert directives before the first `platform :ios` line. Both flags
      // must appear ABOVE use_react_native! / target blocks so the RN-Firebase
      // podspec sees the global before defining its pod entries.
      if (!podfile.includes('$RNFirebaseAsStaticFramework')) {
        podfile = podfile.replace(
          /platform :ios/,
          '$RNFirebaseAsStaticFramework = true\nuse_modular_headers!\nplatform :ios',
        );
      } else if (!podfile.includes('use_modular_headers!')) {
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
