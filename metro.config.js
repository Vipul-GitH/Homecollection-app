const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Native Android build folders are transient. Watching them can make Metro
    // crash when CMake removes a temporary directory during an Android build.
    blockList: [
      /[\\/]+android[\\/]+(?:app[\\/]+)?\.cxx[\\/]+.*/,
      /[\\/]+android[\\/]+(?:app[\\/]+)?build[\\/]+.*/,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
