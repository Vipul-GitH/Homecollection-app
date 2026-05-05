/* global jest */
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import 'react-native-gesture-handler/jestSetup';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const animated = {
    View: ReactNative.View,
    Text: ReactNative.Text,
    Image: ReactNative.Image,
    createAnimatedComponent: component => component,
  };

  return {
    __esModule: true,
    default: animated,
    Easing: {
      ease: jest.fn(),
      cubic: jest.fn(),
      inOut: jest.fn(easing => easing),
      out: jest.fn(easing => easing),
    },
    useSharedValue: jest.fn(value => ({value})),
    useAnimatedStyle: jest.fn(callback => callback()),
    withTiming: jest.fn(toValue => toValue),
    withRepeat: jest.fn(animation => animation),
    withSequence: jest.fn((...animations) => animations[animations.length - 1]),
    withDelay: jest.fn((delay, animation) => animation),
  };
});

jest.mock('react-native-get-location', () => ({
  getCurrentPosition: jest.fn(() =>
    Promise.resolve({
      latitude: 28.6139,
      longitude: 77.209,
    }),
  ),
}));

jest.mock('react-native-android-location-services-dialog-box', () => ({
  checkLocationServicesIsEnabled: jest.fn(() => Promise.resolve(true)),
  stopListener: jest.fn(),
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        display_name: 'New Delhi, India',
        address: {
          city: 'New Delhi',
          state_district: 'New Delhi',
          state: 'Delhi',
          postcode: '110001',
          country: 'India',
        },
      }),
  }),
);
