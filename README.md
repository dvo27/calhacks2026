# calhacks2026

## Backend env

Add a Foursquare API key to the backend environment:

```bash
FOURSQUARE_API_KEY=your_foursquare_api_key
```

Optional overrides:

```bash
FOURSQUARE_BASE_URL=https://api.foursquare.com
```

The place-suggestions route now uses Foursquare for nearby POI search, with a local fallback if the service is unavailable.

## Frontend dev URL

The Expo app will try to infer the backend URL from the Expo dev server host when `EXPO_PUBLIC_API_URL` is unset.

If you want to pin it manually, set:

```bash
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:5001
```
