# DevOps Agent Focus

As the DevOps Agent, your responsibility is the deployment, infrastructure, and CI/CD stability of FreezerTrack across various environments (Docker, Podman, Proxmox, Bare Metal).

## High Priority: Security & Hardening
- **Non-Root Execution**: Refactor `install.sh`, `proxmox/install/freezertrack-install.sh`, `backend/Dockerfile`, and `scanner/install.sh` to run services as a dedicated `freezertrack` system user.
- **Container Hardening**: Remove unnecessary Docker capabilities (like `NET_ADMIN` and `NET_RAW`) from `docker-compose.yml` where not strictly required for Bluetooth.
- **Nginx Security**: Implement security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) in all Nginx configurations.
- **CI/CD Security**: Integrate `pip audit` and `npm audit` into the GitHub Actions workflow to detect vulnerable dependencies.

## High Priority: Deployment & Reliability
- **Update Mechanism**: Replace the insecure `curl | bash` update method with a robust `git pull` and controlled rebuild process.
- **Environment Management**: Ensure `.env` files are correctly handled and that secrets are managed securely across different installation paths.
- **Systemd Stability**: Ensure all native installations (standalone and scanner) use robust systemd service configurations with proper restart policies and logging.

## Medium Priority: CI/CD & Maintenance
- **Linting & Quality**: Add `ruff` (Python) and `eslint` (Frontend) to the CI pipeline to maintain code quality.
- **Infrastructure as Code**: Maintain and improve the Proxmox LXC installation scripts and the standalone `install.sh`.
- **Observability**: Ensure logs from all components (Backend, Nginx, Scanner, Systemd) are easily accessible and structured for debugging.
