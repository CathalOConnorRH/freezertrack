# FreezerTrack — Manual QA Checklist

## Desktop (USB Scanner)

- [ ] Open http://raspberrypi.local, dashboard loads with item count
- [ ] Dashboard shows USB Scanner Mode toggle (Scan In / Scan Out)
- [ ] Navigate to Scanner page, USB tab active by default
- [ ] Scan a new QR label - redirected to Add Item with fields blank
- [ ] Fill in name, frozen date, qty - submit - label prints on B1
- [ ] Navigate to Inventory - new item appears
- [ ] Return to Scanner - scan same QR label - "removed" toast appears
- [ ] Item moves to History tab in Inventory
- [ ] Scan a retail product barcode - Add Item form pre-filled with name

## Add Item

- [ ] Barcode field visible below Name
- [ ] Type a barcode and press Enter - lookup runs, name/brand auto-fill if found
- [ ] Tap camera icon - camera scanner opens inline
- [ ] Scan barcode with camera - field populates and lookup runs
- [ ] USB scanner input detected on Add Item page (rapid keystrokes)
- [ ] Submit with barcode - barcode mapping saved (future scans resolve it)
- [ ] Submit without barcode - works as before

## Inventory Edit

- [ ] Tap item group in Inventory - detail panel opens
- [ ] Tap "N individual items" to expand item list
- [ ] Each item shows pencil edit icon
- [ ] Tap pencil - inline edit form with name, brand, category, quantity, frozen date, notes
- [ ] Category dropdown shows preset + existing categories
- [ ] Save updates the item; Cancel discards changes
- [ ] Edited values persist after page refresh

## Mobile (Camera)

- [ ] Open http://raspberrypi.local on phone
- [ ] Navigate to Scanner - Camera tab auto-selected
- [ ] Tap "Enable camera" - browser permission prompt appears
- [ ] Grant permission - live viewfinder shown with targeting reticle
- [ ] Point camera at QR label - green flash - correct action taken
- [ ] Point camera at retail barcode - lookup fires, Add Item pre-filled
- [ ] Deny camera permission - friendly message with re-enable instructions shown

## Scanner Mode Sync

- [ ] Set mode to Scan In on web dashboard - scanner dashboard (8888) updates within 5s
- [ ] Set mode on scanner dashboard (8888) - web dashboard updates within 5s
- [ ] ESP32 touchscreen mode syncs with API within 5s
- [ ] HA select entity change propagates to all clients
- [ ] Scanner service reads correct mode before each scan

## Auto-Categorise

- [ ] POST /api/scanner/auto-categorise assigns categories to uncategorised items
- [ ] Already-categorised items are not changed
- [ ] New scan-in items get auto-categorised from product name

## Home Assistant

- [ ] Add sensor config to configuration.yaml, restart HA
- [ ] sensor.freezer_state shows correct item count
- [ ] Add item over 90 days old - HA alert fires within 5 minutes (next poll)
- [ ] Remove items below threshold - low stock alert fires

## ESP32 Touchscreen

- [ ] Display shows SCAN IN and SCAN OUT buttons
- [ ] Tap button changes mode (check logs for "Button: SCAN IN pressed")
- [ ] Settings gear icon navigates to admin page
- [ ] Update button triggers FreezerTrack update
- [ ] Restart button restarts FreezerTrack service
- [ ] Display sleeps after 5 minutes, touch to wake
- [ ] Touch wakes display without triggering button press

## Printer

- [ ] Niimbot B1 paired via bluetoothctl on Pi
- [ ] Create item - label prints within 10 seconds
- [ ] Label shows correct name, frozen date, quantity, and scannable QR code
- [ ] Scan printed QR code with both USB scanner and phone camera - both decode correctly
