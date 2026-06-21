# calhacks2026

## Backend env

Add an Azure Maps key to the backend environment:

```bash
AZURE_MAPS_KEY=your_azure_maps_subscription_key
```

Optional overrides:

```bash
AZURE_MAPS_BASE_URL=https://atlas.microsoft.com
AZURE_MAPS_API_VERSION=2026-01-01
AZURE_MAPS_LANGUAGE=en-US
```

The place-suggestions route now uses Azure Maps for geocoding and nearby POI search, with a local fallback if the service is unavailable.
