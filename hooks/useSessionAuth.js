import {Alert} from 'react-native';
import {useCallback, useEffect, useState} from 'react';
import {
  diagnoseLoginConnectivity,
  loginUserApi,
} from '../services/api/authApi';
import {
  clearSession,
  getPersistedSession,
  persistSession,
} from '../services/storage/sessionStorage';
import {runCatalogSyncOnce} from '../services/sync/catalogSyncService';
import {logDebug, warnDebug} from '../utils/app/logger';

const isUnsupportedAppVersionError = error => {
  const detail =
    error?.responseBody?.detail ||
    error?.responseBody?.message ||
    error?.message ||
    '';

  return /unsupported app version/i.test(String(detail));
};

const getUnsupportedAppVersionMessage = error => {
  const detail =
    error?.responseBody?.detail ||
    error?.responseBody?.message ||
    error?.message ||
    'This app version is no longer supported.';

  return String(detail).trim();
};

export const useSessionAuth = () => {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginLoadingMessage, setLoginLoadingMessage] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggedInUser, setLoggedInUser] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    let isMounted = true;

    const restorePersistedSessionOnLaunch = async () => {
      try {
        const persistedSession = await getPersistedSession();

        if (!isMounted || !persistedSession.accessToken) {
          return;
        }

        setAccessToken(persistedSession.accessToken);
        setLoggedInUser(persistedSession.loggedInUser);
        setCurrentScreen('home');
        logDebug('[Session] Restored persisted login session on app launch');
      } catch (error) {
        warnDebug('Session restore error:', error);
      }
    };

    restorePersistedSessionOnLaunch();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUsernameChange = useCallback(
    text => {
      setUsername(text);

      if (loginError) {
        setLoginError('');
      }
    },
    [loginError],
  );

  const handlePasswordChange = useCallback(
    text => {
      setPassword(text);

      if (loginError) {
        setLoginError('');
      }
    },
    [loginError],
  );

  const handleLogin = useCallback(async () => {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setLoginError('Both username and password are required.');
      return false;
    }

    try {
      setIsLoggingIn(true);
      setLoginError('');
      setLoginLoadingMessage('Verifying your credentials securely...');

      const {displayName, accessToken: nextAccessToken} = await loginUserApi({
        username: trimmedUsername,
        password: trimmedPassword,
      });

      if (!nextAccessToken) {
        setLoginError('No access token was returned in the login response.');
        return false;
      }

      await persistSession({
        accessToken: nextAccessToken,
        loggedInUser: displayName,
      });
      logDebug('[Login] Request succeeded', {
        displayName,
        hasAccessToken: Boolean(nextAccessToken),
      });
      try {
        setLoginLoadingMessage('Syncing local catalog database...');
        await runCatalogSyncOnce({accessToken: nextAccessToken});
      } catch (syncError) {
        warnDebug('Catalog sync after login failed:', syncError);
      }
      setLoggedInUser(displayName);
      setAccessToken(nextAccessToken);
      setCurrentScreen('home');
      return true;
    } catch (error) {
      logDebug('[Login] Final error details', {
        message: error?.message,
        name: error?.name,
        status: error?.status,
        statusText: error?.statusText,
        responseBody: error?.responseBody || null,
        causeMessage: error?.cause?.message || null,
      });

      const shouldRunLoginDiagnostics =
        __DEV__ &&
        (error?.name === 'TypeError' ||
          String(error?.message || '')
            .toLowerCase()
            .includes('network request failed'));

      if (shouldRunLoginDiagnostics) {
        try {
          await diagnoseLoginConnectivity();
        } catch (diagnosticError) {
          logDebug('[Login Diagnostic] Runner failure', {
            message: diagnosticError?.message,
            name: diagnosticError?.name,
          });
        }
      }

      warnDebug('Login error:', error);
      if (isUnsupportedAppVersionError(error)) {
        const versionMessage = getUnsupportedAppVersionMessage(error);
        Alert.alert(
          'App Update Required',
          `${versionMessage}\n\nPlease install the latest APK and try again.`,
        );
      }
      setLoginError(
        error?.message ||
          'Unable to reach the login API. Please check the server and network.',
      );
      return false;
    } finally {
      setIsLoggingIn(false);
      setLoginLoadingMessage('');
    }
  }, [password, username]);

  const resetSession = useCallback(async () => {
    setCurrentScreen('login');
    setAccessToken('');
    setLoggedInUser('');
    setUsername('');
    setPassword('');
    setLoginError('');

    try {
      await clearSession();
    } catch (error) {
      warnDebug('Session clear error:', error);
    }
  }, []);

  return {
    currentScreen,
    username,
    password,
    isLoggingIn,
    loginLoadingMessage,
    loginError,
    loggedInUser,
    accessToken,
    setCurrentScreen,
    handleLogin,
    handleUsernameChange,
    handlePasswordChange,
    resetSession,
  };
};
