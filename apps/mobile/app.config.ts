import { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const easProjectId = process.env.EAS_PROJECT_ID;

  return {
    ...config,
    ...(googleMapsApiKey
      ? {
          android: {
            ...config.android,
            config: {
              ...config.android?.config,
              googleMaps: {
                ...(config.android?.config as any)?.googleMaps,
                apiKey: googleMapsApiKey,
              },
            },
          },
        }
      : {}),
    ...(easProjectId
      ? {
          extra: {
            ...config.extra,
            eas: {
              ...(config.extra?.eas as Record<string, unknown> | undefined),
              projectId: easProjectId,
            },
          },
        }
      : {}),
  };
};
