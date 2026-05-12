const isDebugLoggingEnabled = typeof __DEV__ !== 'undefined' && __DEV__;

export const logDebug = (...args) => {
  if (isDebugLoggingEnabled) {
    console.log(...args);
  }
};

export const warnDebug = (...args) => {
  if (isDebugLoggingEnabled) {
    console.warn(...args);
  }
};
