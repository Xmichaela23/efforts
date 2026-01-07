/**
 * useBluetoothHR - Web Bluetooth Heart Rate Monitor Connection
 * 
 * Connects to Bluetooth heart rate straps (Polar, Garmin, Wahoo, etc.)
 * using the Web Bluetooth API and the standard Heart Rate Service.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

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
const HEART_RATE_SERVICE = 'heart_rate';
const HEART_RATE_MEASUREMENT = 'heart_rate_measurement';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse heart rate measurement characteristic value
 * Per Bluetooth GATT specification
 */
function parseHeartRate(value: DataView): number {
  const flags = value.getUint8(0);
  const is16Bit = (flags & 0x01) === 1;
  
  if (is16Bit) {
    return value.getUint16(1, true); // Little-endian
  } else {
    return value.getUint8(1);
  }
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
  
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  
  // -------------------------------------------------------------------------
  // Check Bluetooth availability
  // -------------------------------------------------------------------------
  
  useEffect(() => {
    const checkAvailability = async () => {
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
    
    // Listen for availability changes
    if (navigator.bluetooth) {
      navigator.bluetooth.addEventListener?.('availabilitychanged', (event: Event) => {
        setState(s => ({ ...s, isAvailable: (event as any).value }));
      });
    }
  }, []);
  
  // -------------------------------------------------------------------------
  // Handle heart rate updates
  // -------------------------------------------------------------------------
  
  const handleHeartRateUpdate = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    
    if (!value) return;
    
    try {
      const bpm = parseHeartRate(value);
      
      // Validate BPM (reasonable range for exercise)
      if (bpm >= 30 && bpm <= 250) {
        setState(s => ({ ...s, currentBPM: bpm }));
        onHeartRateUpdate?.(bpm);
      }
    } catch (err) {
      console.error('Error parsing heart rate:', err);
    }
  }, [onHeartRateUpdate]);
  
  // -------------------------------------------------------------------------
  // Connect to device
  // -------------------------------------------------------------------------
  
  const connect = useCallback(async (): Promise<boolean> => {
    if (!navigator.bluetooth) {
      const errorMsg = 'Web Bluetooth is not supported in this browser';
      setState(s => ({ ...s, status: 'error', error: errorMsg }));
      onError?.(errorMsg);
      return false;
    }
    
    setState(s => ({ ...s, status: 'connecting', error: null }));
    onStatusChange?.('connecting');
    
    try {
      // Request device with heart rate service
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
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
        onStatusChange?.('disconnected');
        characteristicRef.current = null;
      });
      
      // Connect to GATT server
      const server = await device.gatt.connect();
      
      // Get heart rate service
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      
      // Get heart rate measurement characteristic
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      characteristicRef.current = characteristic;
      
      // Subscribe to notifications
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleHeartRateUpdate);
      
      const deviceName = device.name || 'Unknown HR Monitor';
      
      setState(s => ({
        ...s,
        status: 'connected',
        deviceName,
        error: null,
      }));
      onStatusChange?.('connected', deviceName);
      
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
      onError?.(errorMsg);
      onStatusChange?.('error');
      
      return false;
    }
  }, [handleHeartRateUpdate, onStatusChange, onError]);
  
  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------
  
  const disconnect = useCallback(() => {
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener(
          'characteristicvaluechanged',
          handleHeartRateUpdate
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
    onStatusChange?.('disconnected');
  }, [handleHeartRateUpdate, onStatusChange]);
  
  // -------------------------------------------------------------------------
  // Reconnect to last device (if browser supports it)
  // -------------------------------------------------------------------------
  
  const reconnect = useCallback(async (): Promise<boolean> => {
    if (!deviceRef.current?.gatt) {
      // No device to reconnect to
      return connect();
    }
    
    setState(s => ({ ...s, status: 'connecting' }));
    onStatusChange?.('connecting');
    
    try {
      const server = await deviceRef.current.gatt.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      
      characteristicRef.current = characteristic;
      
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleHeartRateUpdate);
      
      const deviceName = deviceRef.current.name || 'Unknown HR Monitor';
      
      setState(s => ({
        ...s,
        status: 'connected',
        deviceName,
      }));
      onStatusChange?.('connected', deviceName);
      
      return true;
    } catch (err) {
      // Reconnection failed, try fresh connection
      return connect();
    }
  }, [connect, handleHeartRateUpdate, onStatusChange]);
  
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

