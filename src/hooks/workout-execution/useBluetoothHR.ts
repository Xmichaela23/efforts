/**
 * useBluetoothHR - Heart Rate Monitor Connection
 * 
 * Connects to Bluetooth heart rate straps (Polar, Garmin, Wahoo, etc.)
 * Uses native Capacitor plugin on iOS (where Web Bluetooth doesn't work)
 * Falls back to Web Bluetooth API on Android/Desktop
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';

// ============================================================================
// Types
// ============================================================================

export type HRConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface HRState {
  status: HRConnectionStatus;
  deviceName: string | null;
  currentBPM: number | null;
  error: string | null;
  isAvailable: boolean;
}

export interface UseBluetoothHROptions {
  onHeartRateUpdate?: (bpm: number) => void;
  onStatusChange?: (status: HRConnectionStatus, deviceName?: string) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

// Bluetooth GATT Service UUIDs
const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_SERVICE_SHORT = 'heart_rate';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT_SHORT = 'heart_rate_measurement';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse heart rate measurement characteristic value
 * Per Bluetooth GATT specification
 */
function parseHeartRateFromDataView(value: DataView): number {
  const flags = value.getUint8(0);
  const is16Bit = (flags & 0x01) === 1;
  
  if (is16Bit) {
    return value.getUint16(1, true); // Little-endian
  } else {
    return value.getUint8(1);
  }
}

/**
 * Check if running in native iOS/Android app via Capacitor
 */
function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

// ============================================================================
// Hook
// ============================================================================

export function useBluetoothHR(options: UseBluetoothHROptions = {}) {
  const { onHeartRateUpdate, onStatusChange, onError } = options;
  
  const [state, setState] = useState<HRState>({
    status: 'disconnected',
    deviceName: null,
    currentBPM: null,
    error: null,
    isAvailable: false,
  });
  
  // For web bluetooth
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  
  // For native bluetooth
  const nativeDeviceIdRef = useRef<string | null>(null);
  
  // Store callbacks in refs to avoid stale closures
  const onHeartRateUpdateRef = useRef(onHeartRateUpdate);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  
  useEffect(() => {
    onHeartRateUpdateRef.current = onHeartRateUpdate;
    onStatusChangeRef.current = onStatusChange;
    onErrorRef.current = onError;
  }, [onHeartRateUpdate, onStatusChange, onError]);
  
  // -------------------------------------------------------------------------
  // Check Bluetooth availability
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const checkAvailability = async () => {
      // Native platform (iOS/Android via Capacitor)
      if (isNativePlatform()) {
        try {
          await BleClient.initialize();
          const enabled = await BleClient.isEnabled();
          setState(s => ({ ...s, isAvailable: enabled }));
        } catch {
          setState(s => ({ ...s, isAvailable: false }));
        }
        return;
      }
      
      // Web platform
      if (typeof navigator === 'undefined' || !navigator.bluetooth) {
        setState(s => ({ ...s, isAvailable: false }));
        return;
      }
      
      try {
        const available = await navigator.bluetooth.getAvailability();
        setState(s => ({ ...s, isAvailable: available }));
      } catch {
        setState(s => ({ ...s, isAvailable: false }));
      }
    };
    
    checkAvailability();
    
    // Listen for availability changes (web only)
    if (!isNativePlatform() && navigator.bluetooth) {
      navigator.bluetooth.addEventListener?.('availabilitychanged', (event: Event) => {
        setState(s => ({ ...s, isAvailable: (event as any).value }));
      });
    }
  }, []);
  
  // -------------------------------------------------------------------------
  // Handle heart rate updates (web)
  // -------------------------------------------------------------------------
  
  const handleHeartRateUpdateWeb = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    
    if (!value) return;
    
    try {
      const bpm = parseHeartRateFromDataView(value);
      
      // Validate BPM (reasonable range for exercise)
      if (bpm >= 30 && bpm <= 250) {
        setState(s => ({ ...s, currentBPM: bpm }));
        onHeartRateUpdateRef.current?.(bpm);
      }
    } catch (err) {
      console.error('Error parsing heart rate:', err);
    }
  }, []);
  
  // -------------------------------------------------------------------------
  // Connect - Native (iOS/Android)
  // -------------------------------------------------------------------------
  
  const connectNative = useCallback(async (): Promise<boolean> => {
    setState(s => ({ ...s, status: 'connecting', error: null }));
    onStatusChangeRef.current?.('connecting');
    
    try {
      await BleClient.initialize();
      
      // Request device with heart rate service
      const device = await BleClient.requestDevice({
        services: [HEART_RATE_SERVICE],
        optionalServices: [numberToUUID(0x180F)], // Battery service
      });
      
      nativeDeviceIdRef.current = device.deviceId;
      
      // Connect to device
      await BleClient.connect(device.deviceId, (deviceId) => {
        // Disconnection callback
        console.log('Device disconnected:', deviceId);
        setState(s => ({
          ...s,
          status: 'disconnected',
          currentBPM: null,
        }));
        onStatusChangeRef.current?.('disconnected');
        nativeDeviceIdRef.current = null;
      });
      
      // Start notifications for heart rate
      await BleClient.startNotifications(
        device.deviceId,
        HEART_RATE_SERVICE,
        HEART_RATE_MEASUREMENT,
        (value) => {
          // Parse heart rate from DataView
          const dataView = value;
          const flags = dataView.getUint8(0);
          const is16Bit = (flags & 0x01) === 1;
          const bpm = is16Bit ? dataView.getUint16(1, true) : dataView.getUint8(1);
          
          if (bpm >= 30 && bpm <= 250) {
            setState(s => ({ ...s, currentBPM: bpm }));
            onHeartRateUpdateRef.current?.(bpm);
          }
        }
      );
      
      const deviceName = device.name || 'HR Monitor';
      
      setState(s => ({
        ...s,
        status: 'connected',
        deviceName,
        error: null,
      }));
      onStatusChangeRef.current?.('connected', deviceName);
      
      return true;
    } catch (err) {
      let errorMsg: string;
      
      if (err instanceof Error) {
        errorMsg = err.message;
      } else {
        errorMsg = 'Unknown error connecting to heart rate monitor';
      }
      
      setState(s => ({ ...s, status: 'error', error: errorMsg }));
      onErrorRef.current?.(errorMsg);
      onStatusChangeRef.current?.('error');
      
      return false;
    }
  }, []);
  
  // -------------------------------------------------------------------------
  // Connect - Web Bluetooth
  // -------------------------------------------------------------------------
  
  const connectWeb = useCallback(async (): Promise<boolean> => {
    if (!navigator.bluetooth) {
      const errorMsg = 'Web Bluetooth is not supported in this browser';
      setState(s => ({ ...s, status: 'error', error: errorMsg }));
      onErrorRef.current?.(errorMsg);
      return false;
    }
    
    setState(s => ({ ...s, status: 'connecting', error: null }));
    onStatusChangeRef.current?.('connecting');
    
    try {
      // Request device with heart rate service
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE_SHORT] }],
        optionalServices: ['battery_service'],
      });
      
      if (!device.gatt) {
        throw new Error('GATT not available');
      }
      
      deviceRef.current = device;
      
      // Handle disconnection
      device.addEventListener('gattserverdisconnected', () => {
        setState(s => ({
          ...s,
          status: 'disconnected',
          currentBPM: null,
        }));
        onStatusChangeRef.current?.('disconnected');
        characteristicRef.current = null;
      });
      
      // Connect to GATT server
      const server = await device.gatt.connect();
      
      // Get heart rate service
      const service = await server.getPrimaryService(HEART_RATE_SERVICE_SHORT);
      
      // Get heart rate measurement characteristic
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT_SHORT);
      characteristicRef.current = characteristic;
      
      // Subscribe to notifications
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleHeartRateUpdateWeb);
      
      const deviceName = device.name || 'Unknown HR Monitor';
      
      setState(s => ({
        ...s,
        status: 'connected',
        deviceName,
        error: null,
      }));
      onStatusChangeRef.current?.('connected', deviceName);
      
      return true;
    } catch (err) {
      let errorMsg: string;
      
      if (err instanceof Error) {
        if (err.name === 'NotFoundError') {
          errorMsg = 'No heart rate monitor selected';
        } else if (err.name === 'SecurityError') {
          errorMsg = 'Bluetooth permission denied';
        } else if (err.name === 'NetworkError') {
          errorMsg = 'Could not connect to device';
        } else {
          errorMsg = err.message;
        }
      } else {
        errorMsg = 'Unknown error connecting to heart rate monitor';
      }
      
      setState(s => ({ ...s, status: 'error', error: errorMsg }));
      onErrorRef.current?.(errorMsg);
      onStatusChangeRef.current?.('error');
      
      return false;
    }
  }, [handleHeartRateUpdateWeb]);
  
  // -------------------------------------------------------------------------
  // Connect (auto-select native vs web)
  // -------------------------------------------------------------------------
  
  const connect = useCallback(async (): Promise<boolean> => {
    if (isNativePlatform()) {
      return connectNative();
    } else {
      return connectWeb();
    }
  }, [connectNative, connectWeb]);
  
  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------
  
  const disconnect = useCallback(async () => {
    // Native disconnect
    if (isNativePlatform() && nativeDeviceIdRef.current) {
      try {
        await BleClient.stopNotifications(
          nativeDeviceIdRef.current,
          HEART_RATE_SERVICE,
          HEART_RATE_MEASUREMENT
        );
        await BleClient.disconnect(nativeDeviceIdRef.current);
      } catch {
        // Ignore errors during cleanup
      }
      nativeDeviceIdRef.current = null;
    }
    
    // Web disconnect
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          handleHeartRateUpdateWeb
        );
        characteristicRef.current.stopNotifications?.();
      } catch {
        // Ignore errors during cleanup
      }
      characteristicRef.current = null;
    }
    
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    
    deviceRef.current = null;
    
    setState(s => ({
      ...s,
      status: 'disconnected',
      deviceName: null,
      currentBPM: null,
    }));
    onStatusChangeRef.current?.('disconnected');
  }, [handleHeartRateUpdateWeb]);
  
  // -------------------------------------------------------------------------
  // Reconnect
  // -------------------------------------------------------------------------
  
  const reconnect = useCallback(async (): Promise<boolean> => {
    // For native, just do a fresh connect
    if (isNativePlatform()) {
      return connect();
    }
    
    // For web, try to reconnect to existing device
    if (!deviceRef.current?.gatt) {
      return connect();
    }
    
    setState(s => ({ ...s, status: 'connecting' }));
    onStatusChangeRef.current?.('connecting');
    
    try {
      const server = await deviceRef.current.gatt.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE_SHORT);
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT_SHORT);
      
      characteristicRef.current = characteristic;
      
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleHeartRateUpdateWeb);
      
      const deviceName = deviceRef.current.name || 'Unknown HR Monitor';
      
      setState(s => ({
        ...s,
        status: 'connected',
        deviceName,
      }));
      onStatusChangeRef.current?.('connected', deviceName);
      
      return true;
    } catch {
      // Reconnection failed, try fresh connection
      return connect();
    }
  }, [connect, handleHeartRateUpdateWeb]);
  
  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  return {
    // State
    ...state,
    
    // Actions
    connect,
    disconnect,
    reconnect,
  };
}

export type UseBluetoothHRReturn = ReturnType<typeof useBluetoothHR>;
