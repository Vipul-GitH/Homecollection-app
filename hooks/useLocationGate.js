import {useCallback, useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GetLocation from 'react-native-get-location';
import LocationServicesDialogBox from 'react-native-android-location-services-dialog-box';
import {
  Alert,
  AppState,
  BackHandler,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {getAddressFromCoords} from '../utils/location/getAddressFromCoords';
import {isAndroidEmulator} from '../utils/app/runtimeHelpers';
import {logDebug, warnDebug} from '../utils/app/logger';

export const useLocationGate = () => {
  const [stateDistrict, setStateDistrict] = useState('');
  const [suburb, setSuburb] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [locationStatus, setLocationStatus] = useState('Detecting location...');
  const [locationReady, setLocationReady] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const hasLocationBeenReadyRef = useRef(false);
  const hasShownLocationOffAlertRef = useRef(false);
  const shouldBypassStrictLocationCheck = __DEV__ && isAndroidEmulator();

  useEffect(() => {
    if (locationReady) {
      hasLocationBeenReadyRef.current = true;
      hasShownLocationOffAlertRef.current = false;
    }
  }, [locationReady]);

  useEffect(() => {
    if (Platform.OS !== 'android' || shouldBypassStrictLocationCheck) {
      return undefined;
    }

    const handleLocationTurnedOff = () => {
      if (
        !hasLocationBeenReadyRef.current ||
        hasShownLocationOffAlertRef.current
      ) {
        return;
      }

      hasShownLocationOffAlertRef.current = true;
      setLocationReady(false);
      setLocationStatus('Location turned off');

      Alert.alert(
        'Location Turned Off',
        'Location has been turned off. The app will now close.',
        [
          {
            text: 'OK',
            onPress: () => BackHandler.exitApp(),
          },
        ],
        {cancelable: false},
      );
    };

    const checkLocationStillEnabled = async () => {
      if (
        !hasLocationBeenReadyRef.current ||
        isRequestingLocation ||
        AppState.currentState !== 'active'
      ) {
        return;
      }

      try {
        await LocationServicesDialogBox.checkLocationServicesIsEnabled({
          showDialog: false,
          openLocationServices: false,
        });
      } catch (error) {
        handleLocationTurnedOff();
      }
    };

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        checkLocationStillEnabled();
      }
    });

    const intervalId = setInterval(checkLocationStillEnabled, 3000);

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [isRequestingLocation, shouldBypassStrictLocationCheck]);

  const requestLocation = useCallback(async () => {
    try {
      logDebug('[LocationGate] Request started', {
        platform: Platform.OS,
        shouldBypassStrictLocationCheck,
      });
      setIsRequestingLocation(true);
      setLocationStatus('Checking location access...');
      setLocationReady(false);

      let hasPermission = true;

      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        logDebug('[LocationGate] Android permission result', granted);

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Location permission is required');
          setLocationStatus('Location permission denied');
          hasPermission = false;
        }
      }

      if (!hasPermission) {
        setIsRequestingLocation(false);
        return;
      }

      if (Platform.OS === 'android') {
        try {
          logDebug('[LocationGate] Checking Android location services');
          await LocationServicesDialogBox.checkLocationServicesIsEnabled({
            message: `
    <div style="
      font-family: 'Arial', sans-serif;
      padding: 10px;
      font-size: 16px;
      color: #333;
    ">
      <h2 style="
        font-size: 20px;
        margin-bottom: 10px;
        color: #007BFF;
      ">Enable Location</h2>
      <p style="margin-bottom: 15px;">
        <strong>HomeCollection</strong> requires access to your location to continue.
        Please enable GPS to proceed.
      </p>
    </div>
  `,
            ok: 'Enable GPS',
            cancel: 'Cancel',
            enableHighAccuracy: true,
            showDialog: true,
            openLocationServices: true,
          });
          logDebug('[LocationGate] Android location services enabled');
        } catch (locationServicesError) {
          if (!shouldBypassStrictLocationCheck) {
            throw locationServicesError;
          }

          warnDebug(
            'Location services check failed on emulator, bypassing in debug mode:',
            locationServicesError,
          );
          setLocationStatus(
            'Emulator location services check failed, continuing in debug mode...',
          );
        }
      }

      setLocationStatus('Fetching your location...');

      let nextStateDistrict = 'N/A';
      let nextSuburb = 'N/A';
      let nextFullAddress = 'Location unavailable';

      try {
        logDebug('[LocationGate] Fetching current GPS position');
        const location = await GetLocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
        });
        logDebug('[LocationGate] GPS position received', {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          provider: location.provider,
        });

        const address = await getAddressFromCoords(
          location.latitude,
          location.longitude,
        );
        logDebug('[LocationGate] Address resolved', {
          stateDistrict: address?.rawAddress?.state_district || '',
          suburb: address?.rawAddress?.suburb || '',
          fullAddress: address?.fullAddress || address?.displayName || '',
        });

        nextStateDistrict = address?.rawAddress?.state_district || 'N/A';
        nextSuburb = address?.rawAddress?.suburb || 'N/A';
        nextFullAddress =
          address?.fullAddress || address?.displayName || 'Address unavailable';
      } catch (locationError) {
        warnDebug('Location fetch warning:', locationError);
        nextFullAddress = 'Location is unavailable, but the app can continue';
      }

      setStateDistrict(nextStateDistrict);
      setSuburb(nextSuburb);
      setFullAddress(nextFullAddress);
      setLocationStatus(
        nextFullAddress === 'Location is unavailable, but the app can continue'
          ? 'Location service is on, but exact location is unavailable'
          : 'Location ready',
      );
      setLocationReady(true);
      logDebug('[LocationGate] Location ready state saved', {
        stateDistrict: nextStateDistrict,
        suburb: nextSuburb,
        fullAddress: nextFullAddress,
      });

      await AsyncStorage.multiSet([
        ['state_district', nextStateDistrict === 'N/A' ? '' : nextStateDistrict],
        ['suburb', nextSuburb === 'N/A' ? '' : nextSuburb],
        ['full_Address', nextFullAddress],
      ]);
    } catch (error) {
      warnDebug('Location error:', error);
      setLocationStatus('Location service is required');
      setLocationReady(false);
      Alert.alert(
        'Location Error',
        'Please keep location service turned on to continue.',
      );
    } finally {
      setIsRequestingLocation(false);
    }
  }, [shouldBypassStrictLocationCheck]);

  useEffect(() => {
    requestLocation();

    return () => {
      if (Platform.OS === 'android') {
        LocationServicesDialogBox.stopListener();
      }
    };
  }, [requestLocation]);

  return {
    stateDistrict,
    suburb,
    fullAddress,
    locationStatus,
    locationReady,
    isRequestingLocation,
    requestLocation,
  };
};
