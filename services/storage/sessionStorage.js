import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCESS_TOKEN_STORAGE_KEY,
  LOGGED_IN_USER_STORAGE_KEY,
} from '../../constants/config/api';

export const persistSession = async ({accessToken, loggedInUser}) => {
  await AsyncStorage.multiSet([
    [ACCESS_TOKEN_STORAGE_KEY, accessToken],
    [LOGGED_IN_USER_STORAGE_KEY, loggedInUser],
  ]);
};

export const clearSession = async () => {
  await AsyncStorage.multiRemove([
    ACCESS_TOKEN_STORAGE_KEY,
    LOGGED_IN_USER_STORAGE_KEY,
  ]);
};
