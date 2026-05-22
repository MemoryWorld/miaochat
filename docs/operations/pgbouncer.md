# PgBouncer

This runbook documents the local and Kubernetes PgBouncer topology for the API
and worker.

## Local Development

The Docker Compose stack exposes PgBouncer on `localhost:6432` while PostgreSQL
stays internal to the compose network on `postgres:5432`.

Use a single `DATABASE_URL` for both API and worker:

```bash
export DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub
```

The PgBouncer config uses a wildcard database map:

```ini
[databases]
* = host=postgres port=5432
```

That keeps test and development databases working through the same pooled
endpoint, for example:

```bash
export DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub_h03_test
```

## Compose Verification

```bash
docker compose -f infra/docker/compose.dev.yml up -d postgres pgbouncer redis temporal minio
DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub pnpm db:migrate
DATABASE_URL=postgres://agenthub:agenthub@localhost:6432/agenthub pnpm test:integration
```

The PgBouncer container listens on its internal `5432`, but the host-facing
port is `6432` to avoid colliding with a standalone local PostgreSQL process.

## Kubernetes

`infra/k8s/pgbouncer.yaml` deploys:

- a `ConfigMap` with the PgBouncer pool settings
- a `Secret` containing `userlist.txt`
- a `Deployment` with two replicas
- a `Service` named `pgbouncer`

Cluster workloads continue to use a single `DATABASE_URL`, for example:

```bash
postgres://agenthub:agenthub@pgbouncer:5432/agenthub
```

## Pooling Defaults

- `pool_mode = transaction`
- `max_client_conn = 200`
- `default_pool_size = 20`
- `reserve_pool_size = 5`
- `server_reset_query = DISCARD ALL`
- `ignore_startup_parameters = extra_float_digits`

These settings are conservative defaults for the current API and worker
concurrency profile and can be tuned upward after production traffic data is
available.
