#!/usr/bin/env bash
set -euo pipefail

CERT_DIR="$(dirname "$0")/../nginx/certs"
mkdir -p "$CERT_DIR"

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -days 365 \
  -subj "/CN=raspberrypi.local" \
  -addext "subjectAltName=DNS:raspberrypi.local,DNS:localhost"

echo ""
echo "=== Self-signed certificate generated ==="
echo "  cert: $CERT_DIR/cert.pem"
echo "  key:  $CERT_DIR/key.pem"
echo ""
echo "To enable HTTPS:"
echo "  1. Uncomment the HTTPS block in nginx/nginx.conf"
echo "  2. Restart nginx:"
echo "     docker compose restart nginx    # Docker"
echo "     podman-compose restart nginx    # Podman"
echo ""
echo "To trust the cert on your devices:"
echo "  iOS: AirDrop/email cert.pem → Settings → Profile → Install → "
echo "       Settings → General → About → Certificate Trust Settings → Enable"
echo "  Android: Settings → Security → Install certificate → CA certificate"
echo "           Select cert.pem from storage"
