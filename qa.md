# QA Agent Focus

As the QA Agent, your goal is to ensure the reliability, security, and correctness of the entire FreezerTrack ecosystem, from the backend API to the ESPHome hardware integration.

## High Priority: Security Testing
- **Authentication Bypass**: Attempt to access `/api/admin/*` endpoints without a valid `ADMIN_TOKEN`.
- **Injection Attacks**: Test `.env` configuration updates with newline/carriage return characters to check for environment variable injection.
- **Remote Code Execution**: Verify that the self-update mechanism is sandboxed and cannot execute arbitrary commands.
- **Path Traversal**: Attempt to serve files outside the `PHOTO_DIR` via the `get_photo` endpoint.
- **XSS Vulnerability**: Test the scanner dashboard with malicious barcode data containing `<script>` tags.

## High Priority: Reliability & Edge Cases
- **Atomic Transactions**: Verify that if a `create_item` request with multiple containers fails halfway through, no partial data is committed to the database.
- **Race Conditions**: Perform concurrent requests to the label preview endpoint to ensure settings mutation does not leak between requests.
- **File Upload Limits**: Test the photo upload endpoint with extremely large files and invalid file types (e.g., `.exe`, `.txt`).
- **Input Bounds**: Test all numeric inputs (containers, quantity, name length) with values at, below, and far above defined limits.

## Medium Priority: Integration & UX
- **Home Assistant Integration**: Validate all sensors, binary sensors, and services work as expected within a real HA environment.
- **Hardware Sync**: Verify that the ESPHome touchscreen mode (Scan In/Out) correctly updates the backend and is reflected across all clients (web, scanner, HA).
- **Mobile UX**: Test the interface on various screen sizes, specifically checking for disruptive `alert()` calls and missing loading states.
- **API Robustness**: Ensure all error responses follow a consistent format and that the system handles database disconnection gracefully.
