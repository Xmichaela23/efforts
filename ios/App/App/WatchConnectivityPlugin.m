#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchConnectivityPlugin, "WatchConnectivity",
           CAP_PLUGIN_METHOD(isSupported, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(sendWorkout, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(getWatchState, CAPPluginReturnPromise);
)
