import appVersionConfig from '../../app.version.json';

export const APP_VERSION_CODE = Number(appVersionConfig.versionCode || 1);
export const APP_VERSION_NAME = String(appVersionConfig.versionName || '1.0.0');
export const APP_DISPLAY_VERSION = `v${APP_VERSION_NAME}`;
