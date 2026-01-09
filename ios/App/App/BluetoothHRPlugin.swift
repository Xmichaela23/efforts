import Foundation
import Capacitor
import CoreBluetooth

@objc(BluetoothHRPlugin)
public class BluetoothHRPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    
    public let identifier = "BluetoothHRPlugin"
    public let jsName = "BluetoothHR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnectionState", returnType: CAPPluginReturnPromise)
    ]
    
    // MARK: - Properties
    
    private var centralManager: CBCentralManager!
    private var connectedPeripheral: CBPeripheral?
    private var heartRateCharacteristic: CBCharacteristic?
    
    // Bluetooth UUIDs
    private let heartRateServiceUUID = CBUUID(string: "180D")
    private let heartRateMeasurementUUID = CBUUID(string: "2A37")
    
    // State
    private var isScanning = false
    private var discoveredDevices: [CBPeripheral] = []
    private var pendingConnectCall: CAPPluginCall?
    private var scanCall: CAPPluginCall?
    
    // MARK: - Plugin Lifecycle
    
    public override func load() {
        print("[BluetoothHRPlugin] Plugin loaded!")
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }
    
    // MARK: - Plugin Methods
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        let state = centralManager.state
        let available = state == .poweredOn
        let bluetoothState: String
        
        switch state {
        case .poweredOn: bluetoothState = "poweredOn"
        case .poweredOff: bluetoothState = "poweredOff"
        case .unauthorized: bluetoothState = "unauthorized"
        case .unsupported: bluetoothState = "unsupported"
        case .resetting: bluetoothState = "resetting"
        case .unknown: bluetoothState = "unknown"
        @unknown default: bluetoothState = "unknown"
        }
        
        call.resolve([
            "available": available,
            "state": bluetoothState
        ])
    }
    
    @objc func scan(_ call: CAPPluginCall) {
        guard centralManager.state == .poweredOn else {
            call.reject("Bluetooth is not powered on")
            return
        }
        
        // Clear previous discoveries
        discoveredDevices.removeAll()
        scanCall = call
        
        // Start scanning for HR devices
        isScanning = true
        centralManager.scanForPeripherals(withServices: [heartRateServiceUUID], options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])
        
        // Stop scanning after timeout and return results
        let timeout = call.getDouble("timeout") ?? 10.0
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
            self?.stopScanAndResolve()
        }
    }
    
    @objc func stopScan(_ call: CAPPluginCall) {
        centralManager.stopScan()
        isScanning = false
        call.resolve()
    }
    
    @objc func connect(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("Missing deviceId")
            return
        }
        
        // Find the peripheral
        guard let peripheral = discoveredDevices.first(where: { $0.identifier.uuidString == deviceId }) else {
            call.reject("Device not found. Please scan again.")
            return
        }
        
        pendingConnectCall = call
        connectedPeripheral = peripheral
        peripheral.delegate = self
        centralManager.connect(peripheral, options: nil)
    }
    
    @objc func disconnect(_ call: CAPPluginCall) {
        if let peripheral = connectedPeripheral {
            centralManager.cancelPeripheralConnection(peripheral)
        }
        
        connectedPeripheral = nil
        heartRateCharacteristic = nil
        
        call.resolve(["disconnected": true])
    }
    
    @objc func getConnectionState(_ call: CAPPluginCall) {
        let state: String
        if let peripheral = connectedPeripheral {
            switch peripheral.state {
            case .connected: state = "connected"
            case .connecting: state = "connecting"
            case .disconnecting: state = "disconnecting"
            case .disconnected: state = "disconnected"
            @unknown default: state = "unknown"
            }
        } else {
            state = "disconnected"
        }
        
        call.resolve([
            "state": state,
            "deviceName": connectedPeripheral?.name ?? ""
        ])
    }
    
    // MARK: - Private Methods
    
    private func stopScanAndResolve() {
        centralManager.stopScan()
        isScanning = false
        
        let devices = discoveredDevices.map { peripheral -> [String: Any] in
            return [
                "deviceId": peripheral.identifier.uuidString,
                "name": peripheral.name ?? "Unknown HR Monitor"
            ]
        }
        
        scanCall?.resolve(["devices": devices])
        scanCall = nil
    }
    
    private func notifyHeartRate(_ bpm: Int) {
        notifyListeners("heartRateUpdate", data: [
            "bpm": bpm,
            "timestamp": Date().timeIntervalSince1970 * 1000
        ])
    }
    
    private func notifyConnectionChange(_ state: String, deviceName: String? = nil) {
        var data: [String: Any] = ["state": state]
        if let name = deviceName {
            data["deviceName"] = name
        }
        notifyListeners("connectionChange", data: data)
    }
    
    // MARK: - CBCentralManagerDelegate
    
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        print("[BluetoothHRPlugin] Bluetooth state: \(central.state.rawValue)")
        
        let stateString: String
        switch central.state {
        case .poweredOn: stateString = "poweredOn"
        case .poweredOff: stateString = "poweredOff"
        case .unauthorized: stateString = "unauthorized"
        case .unsupported: stateString = "unsupported"
        case .resetting: stateString = "resetting"
        case .unknown: stateString = "unknown"
        @unknown default: stateString = "unknown"
        }
        
        notifyListeners("bluetoothStateChange", data: ["state": stateString])
    }
    
    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        // Avoid duplicates
        if !discoveredDevices.contains(where: { $0.identifier == peripheral.identifier }) {
            print("[BluetoothHRPlugin] Discovered: \(peripheral.name ?? "Unknown") - \(peripheral.identifier)")
            discoveredDevices.append(peripheral)
        }
    }
    
    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("[BluetoothHRPlugin] Connected to: \(peripheral.name ?? "Unknown")")
        
        // Discover HR service
        peripheral.discoverServices([heartRateServiceUUID])
        
        notifyConnectionChange("connected", deviceName: peripheral.name)
    }
    
    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        print("[BluetoothHRPlugin] Failed to connect: \(error?.localizedDescription ?? "Unknown error")")
        
        pendingConnectCall?.reject("Failed to connect: \(error?.localizedDescription ?? "Unknown error")")
        pendingConnectCall = nil
        connectedPeripheral = nil
        
        notifyConnectionChange("error")
    }
    
    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        print("[BluetoothHRPlugin] Disconnected from: \(peripheral.name ?? "Unknown")")
        
        connectedPeripheral = nil
        heartRateCharacteristic = nil
        
        notifyConnectionChange("disconnected")
    }
    
    // MARK: - CBPeripheralDelegate
    
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil else {
            print("[BluetoothHRPlugin] Error discovering services: \(error!.localizedDescription)")
            pendingConnectCall?.reject("Error discovering services")
            pendingConnectCall = nil
            return
        }
        
        guard let services = peripheral.services else { return }
        
        for service in services {
            if service.uuid == heartRateServiceUUID {
                peripheral.discoverCharacteristics([heartRateMeasurementUUID], for: service)
            }
        }
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil else {
            print("[BluetoothHRPlugin] Error discovering characteristics: \(error!.localizedDescription)")
            pendingConnectCall?.reject("Error discovering characteristics")
            pendingConnectCall = nil
            return
        }
        
        guard let characteristics = service.characteristics else { return }
        
        for characteristic in characteristics {
            if characteristic.uuid == heartRateMeasurementUUID {
                heartRateCharacteristic = characteristic
                
                // Subscribe to HR notifications
                peripheral.setNotifyValue(true, for: characteristic)
                
                // Resolve the connect call
                pendingConnectCall?.resolve([
                    "connected": true,
                    "deviceId": peripheral.identifier.uuidString,
                    "deviceName": peripheral.name ?? "HR Monitor"
                ])
                pendingConnectCall = nil
            }
        }
    }
    
    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic.uuid == heartRateMeasurementUUID else { return }
        guard let data = characteristic.value else { return }
        
        // Parse heart rate per Bluetooth GATT spec
        let flags = data[0]
        let is16Bit = (flags & 0x01) == 1
        
        let bpm: Int
        if is16Bit {
            bpm = Int(data[1]) | (Int(data[2]) << 8)
        } else {
            bpm = Int(data[1])
        }
        
        // Validate reasonable HR range
        if bpm >= 30 && bpm <= 250 {
            notifyHeartRate(bpm)
        }
    }
}
