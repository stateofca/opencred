# Verification Exchange Plugin Architecture

The verification exchange portion of the system operates within an Express-based middleware plugin architecture. Only one plugin can be enabled at a time which is determined by the configuration.

## Middleware Components

There are two middleware components involved:

1. **Exchange Creator Middleware**:
   - This middleware initiates exchanges and attaches a `context` to the request object for further processing.
   
2. **Exchange Status Middleware**:
   - This middleware queries the exchange and attaches the resulting exchange data to the request object.

## Plugin Structure

- A plugin is essentially a module exporting a function.
- The exported function receives the Express `app` instance and configures the middleware components.
- Each plugin must configure two middleware functions:
  - Attaches to `/login` and creates a new exchange, passing it through to the login endpoint through the `req.context`
  - Attached to `/exchange` and queries the exchange (from the `req.query.exchangeId`), passing it through to the exchange endpoint through the `req.exchange`
- Only one plugin can be active at a time, ensuring a controlled execution flow.
