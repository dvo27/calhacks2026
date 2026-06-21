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

## Voice search

Voice itinerary generation uses Deepgram for speech-to-text and ASI One for intent normalization.

```bash
DEEPGRAM_API_KEY=your_deepgram_api_key
ASI_BASE_URL=https://api.asi1.ai/v1
ASI_ONE_API_KEY=your_asi_key
```

The mic flow transcribes speech, sends the transcript through ASI One, and builds a trip directly from the result.
If ASI is hosted behind a different path, keep `ASI_BASE_URL` pointed at the API root and adjust `ASI_PARSE_PATH` only when needed.

## Frontend dev URL

The Expo app will try to infer the backend URL from the Expo dev server host when `EXPO_PUBLIC_API_URL` is unset.

If you want to pin it manually, set:

```bash
EXPO_PUBLIC_API_URL=http://<your-lan-ip>:5001
```
