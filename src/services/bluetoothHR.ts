/**
 * Native Bluetooth HR Service - iOS Heart Rate Monitor Integration
 * 
 * Uses native CoreBluetooth on iOS for reliable HR strap connectivity.
 * Falls back to Web Bluetooth on other platforms.
 */

import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

// ============================================================================
// Types
// ============================================================================

export interface BluetoothHRPlugin {
  isAvailable(): Promise<{ available: boolean; state: string }>;
  scan(options?: { timeout?: number }): Promise<{ devices: HRDevice[] }>;
  stopScan(): Promise<void>;
  connect(options: { deviceId: string }): Promise<{ connected: boolean; deviceId: string; deviceName: string }>;
  disconnect(): Promise<{ disconnected: boolean }>;
  getConnectionState(): Promise<{ state: string; deviceName: string }>;
  addListener(
    eventName: 'heartRateUpdate',
    listenerFunc: (data: { bpm: number; timestamp: number }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'connectionChange',
    listenerFunc: (data: { state: string; deviceName?: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'bluetoothStateChange',
    listenerFunc: (data: { state: string }) => void
  ): Promise<PluginListenerHandle>;
}

export interface HRDevice {
  deviceId: string;
  name: string;
}

// ============================================================================
// Plugin Registration
// ============================================================================

const BluetoothHR = registerPlugin<BluetoothHRPlugin>('BluetoothHR');

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Check if native Bluetooth HR is available
 */
export async function isNativeBluetoothAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return false;
  }
  
  try {
    const result = await BluetoothHR.isAvailable();
    return result.available;
  } catch (error) {
    console.error('[BluetoothHR] isAvailable error:', error);
    return false;
  }
}

/**
 * Get Bluetooth state
 */
export async function getBluetoothState(): Promise<string> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return 'unsupported';
  }
  
  try {
    const result = await BluetoothHR.isAvailable();
    return result.state;
  } catch (error) {
    console.error('[BluetoothHR] getState error:', error);
    return 'unknown';
  }
}

/**
 * Scan for HR devices
 */
export async function scanForHRDevices(timeout: number = 10): Promise<HRDevice[]> {
  try {
    const result = await BluetoothHR.scan({ timeout });
    return result.devices;
  } catch (error) {
    console.error('[BluetoothHR] scan error:', error);
    return [];
  }
}

/**
 * Connect to HR device
 */
export async function connectToHRDevice(deviceId: string): Promise<{ success: boolean; deviceName?: string }> {
  try {
    const result = await BluetoothHR.connect({ deviceId });
    return { success: result.connected, deviceName: result.deviceName };
  } catch (error) {
    console.error('[BluetoothHR] connect error:', error);
    return { success: false };
  }
}

/**
 * Disconnect from HR device
 */
export async function disconnectHRDevice(): Promise<boolean> {
  try {
    const result = await BluetoothHR.disconnect();
    return result.disconnected;
  } catch (error) {
    console.error('[BluetoothHR] disconnect error:', error);
    return false;
  }
}

/**
 * Get current connection state
 */
export async function getHRConnectionState(): Promise<{ state: string; deviceName: string }> {
  try {
    return await BluetoothHR.getConnectionState();
  } catch (error) {
    console.error('[BluetoothHR] getConnectionState error:', error);
    return { state: 'disconnected', deviceName: '' };
  }
}

/**
 * Add listener for heart rate updates
 */
export async function addHeartRateListener(
  callback: (bpm: number) => void
): Promise<PluginListenerHandle> {
  return BluetoothHR.addListener('heartRateUpdate', (data) => {
    callback(data.bpm);
  });
}

/**
 * Add listener for connection state changes
 */
export async function addConnectionListener(
  callback: (state: string, deviceName?: string) => void
): Promise<PluginListenerHandle> {
  return BluetoothHR.addListener('connectionChange', (data) => {
    callback(data.state, data.deviceName);
  });
}

/**
 * Add listener for Bluetooth state changes
 */
export async function addBluetoothStateListener(
  callback: (state: string) => void
): Promise<PluginListenerHandle> {
  return BluetoothHR.addListener('bluetoothStateChange', (data) => {
    callback(data.state);
  });
}

export { BluetoothHR };
