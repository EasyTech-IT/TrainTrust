// Gemeinsame Konfiguration. Für die APK (Capacitor) muss NATIVE_API_BASE auf den echten Server zeigen.
export const NATIVE_API_BASE = 'https://DEINE-DOMAIN.de';

const native = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
export const API_BASE = native ? NATIVE_API_BASE : '';
export const IS_NATIVE = !!native;
