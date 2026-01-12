#import <Capacitor/Capacitor.h>
#import "App-Swift.h"

CAP_PLUGIN(BluetoothHRPlugin, "BluetoothHR",
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(scan, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopScan, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(connect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disconnect, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getConnectionState, CAPPluginReturnPromise);
)
