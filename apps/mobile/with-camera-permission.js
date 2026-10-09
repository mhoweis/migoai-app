const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCameraPermission(config) {
  return withAndroidManifest(config, config => {
    const permissions = config.modResults.manifest['uses-permission'] ?? [];
    const cameraPermission = 'android.permission.CAMERA';
    const withoutPickerBlock = permissions.filter(permission => (
      permission.$['android:name'] !== cameraPermission || permission.$['tools:node'] !== 'remove'
    ));

    if (!withoutPickerBlock.some(permission => permission.$['android:name'] === cameraPermission)) {
      withoutPickerBlock.push({ $: { 'android:name': cameraPermission } });
    }

    config.modResults.manifest['uses-permission'] = withoutPickerBlock;
    return config;
  });
};
