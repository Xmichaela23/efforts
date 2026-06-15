// One-line-swappable iOS app download link.
//
// Shown to NON-native users (PWA / browser / Android) where the HealthKit swim enrichment would be
// ("Richer swim data is available in the iOS app"). Today it points to the TestFlight public beta;
// swap to the App Store URL at launch — THIS is the only edit point (the component reads the const).
export const IOS_APP_DOWNLOAD_URL = 'https://testflight.apple.com/join/REPLACE_WITH_PUBLIC_LINK';

// Flip to true (and set the App Store URL above) at public launch — lets the note copy adapt
// ("Download on the App Store" vs "Join the iOS beta") without touching the component.
export const IOS_APP_IS_PUBLIC = false;
