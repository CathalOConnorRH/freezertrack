# FreezerTrack — Manual QA Checklist

## Desktop (USB Scanner)

- [ ] Open http://raspberrypi.local, dashboard loads with item count
- [ ] Navigate to Scanner page, USB tab active by default
- [ ] Scan a new QR label - redirected to Add Item with fields blank
- [ ] Fill in name, frozen date, qty - submit - label prints on B1
- [ ] Navigate to Inventory - new item appears
- [ ] Return to Scanner - scan same QR label - "removed" toast appears
- [ ] Item moves to History tab in Inventory
- [ ] Scan a retail product barcode - Add Item form pre-filled with name

## Mobile (Camera)

- [ ] Open http://raspberrypi.local on phone
- [ ] Navigate to Scanner - Camera tab auto-selected
- [ ] Tap "Enable camera" - browser permission prompt appears
- [ ] Grant permission - live viewfinder shown with targeting reticle
- [ ] Point camera at QR label - green flash - correct action taken
- [ ] Point camera at retail barcode - lookup fires, Add Item pre-filled
- [ ] Deny camera permission - friendly message with re-enable instructions shown

## Home Assistant

- [ ] Add sensor config to configuration.yaml, restart HA
- [ ] sensor.freezer_state shows correct item count
- [ ] Add item over 90 days old - HA alert fires within 5 minutes (next poll)
- [ ] Remove items below threshold - low stock alert fires

## Printer

- [ ] Niimbot B1 paired via bluetoothctl on Pi
- [ ] Create item - label prints within 10 seconds
- [ ] Label shows correct name, frozen date, quantity, and scannable QR code
- [ ] Scan printed QR code with both USB scanner and phone camera - both decode correctly
