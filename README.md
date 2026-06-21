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
