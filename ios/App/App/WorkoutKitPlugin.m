#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WorkoutKitPlugin, "WorkoutKit",
           CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(scheduleSwim, CAPPluginReturnPromise);
)
