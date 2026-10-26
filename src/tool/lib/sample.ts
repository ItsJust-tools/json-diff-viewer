/** Sample documents offered by the "Load sample" action. */
export const SAMPLE_LEFT = `{
  "service": "checkout",
  "version": 2,
  "enabled": true,
  "retries": 3,
  "timeoutMs": 1500,
  "regions": ["eu-west-1", "us-east-1"],
  "database": {
    "host": "db.internal",
    "port": 5432,
    "pool": { "min": 2, "max": 10 }
  },
  "features": {
    "giftCards": false
  }
}`;

export const SAMPLE_RIGHT = `{
  "service": "checkout",
  "version": 3,
  "enabled": true,
  "retries": 5,
  "regions": ["eu-west-1", "us-east-1", "ap-south-1"],
  "database": {
    "host": "db.internal",
    "port": 5433,
    "pool": { "min": 4, "max": 20 },
    "ssl": true
  },
  "features": {
    "giftCards": true,
    "expressCheckout": true
  }
}`;
