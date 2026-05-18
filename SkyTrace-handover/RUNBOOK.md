# SkyTrace Runbook

## Scope

This runbook covers routine operations, deployment, and common troubleshooting steps
for the SkyTrace production environment (Azure App Service + PostgreSQL + Key Vault)
and local development.

## Services and Dependencies

- Azure App Service: Flask app + gunicorn
- Azure PostgreSQL Flexible Server: primary data store
- Azure Key Vault: secret storage
- Azure Application Insights: metrics and logs
- GitHub Actions: CI/CD deployment
- External APIs: AviationStack, AirLabs, AeroDataBox, Open-Meteo

## Key Endpoints

- Health check: /api/health
- Version: /api/version
- Auth state: /api/auth/state

## Deployment (Production)

1. Push to the deployment branch (current: codex/multi-user-foundation).
2. GitHub Actions builds and deploys to Azure App Service automatically.
3. Validate:
   - Load the live site
   - Call /api/health and verify database connectivity

## Local Development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Default local URL: http://localhost:5000

## Configuration and Secrets

Secrets are provided through Key Vault and injected as environment variables:

- SKYTRACE_SECRET_KEY: Flask session signing
- SKYTRACE_ENCRYPTION_KEY: Fernet key for field encryption
- SKYTRACE_DATABASE_URL: PostgreSQL connection string
- SKYTRACE_SECURE_COOKIES: 1 for HTTPS-only cookies

Local development uses .env.example as a template.

## Backups

- User-level backups are stored as JSON in the configured GitHub repository.
- Backup actions:
  - /api/backup/github/test
  - /api/backup/github/push
  - /api/backup/github/pull

Note: PostgreSQL Flexible Server provides automated backups in Azure. Confirm
retention and restore settings in the Azure Portal.

## Monitoring and Logs

- Application Insights collects errors and performance data.
- Use App Service logs for runtime exceptions and request diagnostics.
- Health endpoint validates DB connectivity and app versioning.

## Common Incidents and Fixes

### Login failures or lockouts

Possible causes:
- Rate limit exceeded (10 attempts per 5 minutes per IP).
- Incorrect user credentials.

Actions:
- Wait for the rate-limit window to reset.
- Reset user password via admin endpoint.

### Encryption errors when reading settings

Possible causes:
- SKYTRACE_ENCRYPTION_KEY missing or rotated without data migration.

Actions:
- Verify Key Vault secret and App Service configuration.
- If key rotation is needed, migrate encrypted fields before switching.

### Flight lookup returns empty

Possible causes:
- API keys missing or invalid in user settings.
- External API provider downtime or rate limits.

Actions:
- Re-test keys in Settings.
- Retry later; fallback to cached schedule/history if available.

### Backend unreachable, app falls back to static mode

Symptoms:
- Frontend logs show static mode enabled.
- Data stored in localStorage instead of DB.

Actions:
- Check App Service availability.
- Validate /api/version and /api/health.
- Confirm CORS/proxy usage only in static mode.

## Data Schema Notes

- SQLAlchemy auto-creates tables on startup.
- storage.py includes a lightweight migration function for new columns in
  user_settings (github_backup_token, github_backup_repo).

## Key Commands

- Run tests:
  ```bash
  python -m unittest discover -s tests -p "test_*.py" -v
  ```

- Reset local DB (dangerous):
  - Use storage.reset_database() only in development.

## Escalation

- Infrastructure issues: Azure App Service / PostgreSQL admin.
- Application bugs: check recent changes in app.py and storage.py.
